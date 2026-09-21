/**
 * Assistant Codex Adapter — SDK-backed secondary Global Assistant runtime.
 *
 * It streams final text, status, reasoning/tool summaries, and completion
 * metadata through the existing Conversation SSE contract. Codex threads are
 * persisted by the SDK and resumed from the conversation runtimeSessionId,
 * giving the Global Assistant the same one-conversation/one-session behavior
 * as OpenCode.
 */

import * as path from 'node:path';
import type { ProviderExecutor } from '@vestara/conversation';
import type { CompletionRequest, CompletionResponse, StreamChunk } from '@vestara/shared';
import { truncateReasoning } from '@vestara/shared';

export interface AssistantCodexExecutorOptions {
  readonly directory: string;
  readonly defaultModel?: string;
}

type CodexSdk = typeof import('@openai/codex-sdk');
type CodexThreadEvent = import('@openai/codex-sdk').ThreadEvent;
type CodexUsage = import('@openai/codex-sdk').Usage;

const CODEX_RUNTIME_ID = 'codex';
const CODEX_PROVIDER_ID = 'openai-codex';

let sdkPromise: Promise<CodexSdk> | undefined;

function loadSdk(): Promise<CodexSdk> {
  sdkPromise ??= import('@openai/codex-sdk');
  return sdkPromise;
}

function lastUserText(messages: CompletionRequest['messages']): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user' && typeof message.content === 'string') return message.content;
  }
  return '';
}

function usageTotal(usage: CodexUsage | null | undefined) {
  if (!usage) return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const promptTokens = usage.input_tokens + usage.cached_input_tokens + usage.cache_write_input_tokens;
  const completionTokens = usage.output_tokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

function statusFor(event: CodexThreadEvent): string | undefined {
  if (event.type === 'thread.started') return 'Codex thread started';
  if (event.type === 'turn.started') return 'Codex is working';
  if (event.type === 'item.started') {
    if (event.item.type === 'command_execution') return `Running ${event.item.command}`;
    if (event.item.type === 'file_change') return 'Applying file changes';
    if (event.item.type === 'mcp_tool_call') return `Using ${event.item.server}.${event.item.tool}`;
    if (event.item.type === 'web_search') return `Searching ${event.item.query}`;
    if (event.item.type === 'todo_list') return 'Updating task plan';
  }
  if (event.type === 'turn.completed') return 'Codex turn completed';
  return undefined;
}

function codexThreadId(runtimeSessionId: string | undefined): string | undefined {
  if (!runtimeSessionId?.startsWith('codex:')) return undefined;
  const id = runtimeSessionId.slice('codex:'.length).trim();
  return id || undefined;
}

export function createCodexSdkEnv(sourceEnv: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(sourceEnv).filter(([key, value]) => key !== 'OPENAI_MODEL' && value !== undefined),
  ) as Record<string, string>;

  if (env.OPENAI_API_KEY === '${GPT4ALL_API_KEY}' && env.GPT4ALL_API_KEY?.trim()) {
    env.OPENAI_API_KEY = env.GPT4ALL_API_KEY;
  }

  return env;
}

export function avoidWorkspaceCodexHome(
  env: Record<string, string>,
  workspaceDirectory: string,
): Record<string, string> {
  const codexHome = env.CODEX_HOME?.trim();
  if (!codexHome) return env;
  if (path.resolve(codexHome) !== path.resolve(workspaceDirectory)) return env;
  const { CODEX_HOME: _discarded, ...rest } = env;
  return rest;
}

async function runCodexTurn(
  request: CompletionRequest,
  options: AssistantCodexExecutorOptions,
  onChunk?: (chunk: StreamChunk) => void,
): Promise<CompletionResponse> {
  const prompt = lastUserText(request.messages);
  if (!prompt) throw new Error('Codex turn requires a user message');

  const { Codex } = await loadSdk();
  // OPENAI_MODEL belongs to the generic provider path. Do not let it leak
  // into Codex CLI configuration and override the thread's explicit model.
  const codexEnv = avoidWorkspaceCodexHome(createCodexSdkEnv(), options.directory);
  const codex = new Codex({ env: codexEnv });
  const startedAt = Date.now();
  const threadOptions = {
    ...(options.defaultModel ? { model: options.defaultModel } : {}),
    workingDirectory: options.directory,
    sandboxMode: 'workspace-write' as const,
    approvalPolicy: 'never' as const,
    skipGitRepoCheck: true,
    threadSource: 'vestara-global-assistant',
  };
  const existingThreadId = codexThreadId(request.runtimeSessionId);
  const thread = existingThreadId
    ? codex.resumeThread(existingThreadId, threadOptions)
    : codex.startThread(threadOptions);
  const streamed = await thread.runStreamed(prompt, { signal: request.signal });

  let finalResponse = '';
  let reasoning = '';
  let usage: CodexUsage | null = null;
  let sequence = 0;

  const metadata = () => ({
    sequence: sequence++,
    timestamp: new Date().toISOString(),
    provider: CODEX_PROVIDER_ID,
    execution: { runtimeId: CODEX_RUNTIME_ID, providerId: CODEX_PROVIDER_ID },
    ...(thread.id ? { runtimeSessionId: `codex:${thread.id}` } : {}),
  });

  for await (const event of streamed.events) {
    const status = statusFor(event);
    if (status) {
      onChunk?.({
        id: `codex-status-${sequence++}`,
        type: 'status',
        content: status,
        metadata: metadata(),
      });
    }
    if (event.type === 'item.completed' || event.type === 'item.updated') {
      if (event.item.type === 'agent_message') {
        finalResponse = event.item.text;
        onChunk?.({
          id: `codex-text-${sequence++}`,
          type: 'text',
          content: event.item.text,
          metadata: metadata(),
        });
      } else if (event.item.type === 'reasoning') {
        reasoning = truncateReasoning(`${reasoning}${event.item.text}`);
        onChunk?.({
          id: `codex-reasoning-${sequence++}`,
          type: 'reasoning',
          content: event.item.text,
          metadata: metadata(),
        });
      } else if (event.item.type === 'command_execution') {
        onChunk?.({
          id: `codex-command-${event.item.id}`,
          type: 'tool_result',
          name: 'codex.command',
          content: event.item.aggregated_output.slice(0, 2000),
          metadata: metadata(),
        });
      } else if (event.item.type === 'error') {
        throw new Error(event.item.message);
      }
    } else if (event.type === 'turn.completed') {
      usage = event.usage;
    } else if (event.type === 'turn.failed' || event.type === 'error') {
      throw new Error(event.type === 'turn.failed' ? event.error.message : event.message);
    }
  }

  const tokens = usageTotal(usage);
  return {
    id: `codex-${Date.now()}`,
    provider: CODEX_PROVIDER_ID,
    content: finalResponse,
    ...(reasoning ? { reasoning } : {}),
    usage: tokens,
    latency: Date.now() - startedAt,
    resolution: {
      providerId: CODEX_PROVIDER_ID,
      reason: 'default',
      defaultResolution: true,
      ...(thread.id ? { runtimeSessionId: `codex:${thread.id}` } : {}),
    },
    executionResult: {
      termination: 'completed',
      toolCallCount: 0,
      elapsedMs: Date.now() - startedAt,
      execution: { runtimeId: CODEX_RUNTIME_ID, providerId: CODEX_PROVIDER_ID },
    },
  };
}

export function createAssistantCodexExecutor(options: AssistantCodexExecutorOptions): ProviderExecutor {
  return {
    complete(request) {
      return runCodexTurn(request, options);
    },
    async *stream(request) {
      const queue: StreamChunk[] = [];
      let wake: (() => void) | undefined;
      let done = false;
      let failure: unknown;
      let response: CompletionResponse | undefined;

      const push = (chunk: StreamChunk) => {
        queue.push(chunk);
        wake?.();
      };

      void runCodexTurn(request, options, push)
        .then((result) => {
          response = result;
        })
        .catch((error) => {
          failure = error;
        })
        .finally(() => {
          done = true;
          wake?.();
        });

      while (!done || queue.length > 0) {
        while (queue.length > 0) {
          yield queue.shift() as StreamChunk;
        }
        if (done) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        wake = undefined;
      }

      if (failure) throw failure;
      yield {
        id: response?.id ?? `codex-done-${Date.now()}`,
        type: 'complete',
        content: '',
        metadata: {
          sequence: 0,
          timestamp: new Date().toISOString(),
          provider: CODEX_PROVIDER_ID,
          execution: { runtimeId: CODEX_RUNTIME_ID, providerId: CODEX_PROVIDER_ID },
          ...(response?.usage ? { usage: response.usage } : {}),
          ...(response?.executionResult ? { executionResult: response.executionResult } : {}),
        },
      };
    },
  };
}
