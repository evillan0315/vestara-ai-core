import type { EngineeringAgentRole } from '@vestara/provider-runtime';
import type { CompletionRequest, CompletionResponse, ToolDefinition } from '@vestara/shared';
import type { ToolInvocationResult, ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, ToolCallId } from '@vestara/types';
import type { WorkspaceContext } from '../workspace-context';

/** Cap on model↔tool iterations per request (safety valve). */
const MAX_TOOL_ITERATIONS = 8;

/**
 * Remove raw model tool-call markup (DSML / `<|DSML|...>` blocks) from streamed
 * text so clients never render raw invocation syntax. Handles ASCII and
 * fullwidth bracket variants, whole invoke/parameter/result blocks, and
 * self-closing action tags such as `<|DSML|:read_file path="..." />`.
 */
export function scrubToolMarkup(content: string): string {
  if (!content || !/(DSML|<\s*\/?\s*(invoke|parameter|result))/i.test(content)) return content;

  const out = content
    .replace(/<\|DSML\|[\s\S]*?<\/\|DSML\|invoke>/gi, '')
    .replace(/＜｜DSML｜[\s\S]*?＜／｜DSML｜invoke＞/g, '')
    .replace(/<\|DSML\|:[\w.-]+[^>]*\/?>/gi, '')
    .replace(/＜｜DSML｜：[\w.-]+[^>]*／?＞/g, '')
    .replace(/(^|\n)\s*<\|DSML\|[^\n]*(\n[ \t]*<\|DSML\|[^\n]*)*/gi, '$1')
    .replace(/(^|\n)\s*＜｜DSML｜[^\n]*/g, '$1')
    .replace(/<\/?\|?DSML\|?[^>]*>/gi, '')
    .replace(/＜\/(｜)?DSML｜＞/g, '')
    .replace(/\n{3,}/g, '\n\n');
  return out.trim();
}

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  result: ToolInvocationResult,
): CompletionRequest['messages'][number] {
  if (result.status === 'completed') {
    const output =
      typeof result.output === 'string'
        ? result.output
        : typeof result.output === 'object' && result.output !== null
          ? JSON.stringify(result.output)
          : String(result.output ?? '');
    return { role: 'tool', content: `Tool ${toolName} succeeded:\n${output}`, toolCallId };
  }
  const reason = 'reason' in result ? result.reason : 'error' in result ? result.error : result.status;
  return {
    role: 'tool',
    content: `Tool ${toolName} ${result.status === 'denied' ? 'was denied' : result.status === 'approval-required' ? 'requires approval' : `failed: ${reason ?? 'unknown error'}`}:\n${reason ?? ''}`,
    toolCallId,
  };
}

export async function runToolLoop(options: {
  provider: { complete(request: CompletionRequest): Promise<CompletionResponse> };
  model: string;
  messages: CompletionRequest['messages'];
  tools: readonly ToolDefinition[];
  toolsRuntime: ToolRuntime;
  environment: AgentEnvironment;
  taskId: string;
}): Promise<{ content: string; toolResults: string[] }> {
  let messages = [...options.messages];
  const toolResults: string[] = [];
  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await options.provider.complete({
      model: options.model,
      messages,
      tools: [...options.tools],
      temperature: 0.4,
      maxTokens: 2048,
    });
    const calls = response.toolCalls ?? [];
    if (calls.length === 0) return { content: response.content ?? '', toolResults };
    messages = [
      ...messages,
      {
        role: 'assistant',
        content: response.content ?? '',
        toolCalls: calls.map((call) => ({ id: call.id, name: call.name, arguments: call.arguments })),
      },
    ];
    for (const call of calls) {
      let input: unknown;
      try {
        input = JSON.parse(call.arguments);
      } catch {
        input = { raw: call.arguments };
      }
      let result: ToolInvocationResult;
      try {
        result = await options.toolsRuntime.invoke(
          {
            callId: call.id as ToolCallId,
            toolName: call.name,
            input,
            agentId: 'chat',
            taskId: options.taskId,
            environment: options.environment,
          },
          new AbortController().signal,
          true,
        );
      } catch (error) {
        result = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
          risk: 'low' as const,
          affectedResources: [],
          evidence: [],
        };
      }
      const summary = result.status === 'completed' ? (result.output ?? '') : result.status;
      toolResults.push(
        `[${call.name}] ${result.status}${typeof summary === 'string' && summary ? `: ${summary}` : ''}`,
      );
      messages = [...messages, toolResultMessage(call.id as string, call.name, result)];
    }
  }
  // Exhausted the safety valve — surface what the model last produced.
  const final = await options.provider.complete({ model: options.model, messages });
  return { content: final.content ?? '', toolResults };
}

function systemPromptFor(
  ctx: WorkspaceContext,
  route: { agentName?: string; role?: string },
  profile: { name: string; language: string; framework?: string; fileCount: number; packageCount: number },
): string {
  return [
    'You are Vestara, an AI engineering assistant.',
    `Workspace: ${profile.name}`,
    `Language: ${profile.language}`,
    `Framework: ${profile.framework || '(none)'}`,
    `Files: ${profile.fileCount}`,
    `Packages: ${profile.packageCount}`,
    route.agentName ? `Active agent: ${route.agentName} (${route.role})` : '',
    'You have direct access to the workspace via tools: you can read and search files, run commands, and write files.',
    'Use tools when the answer depends on workspace contents instead of guessing.',
    'Keep responses concise and actionable.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function resolveChatRoute(
  ctx: WorkspaceContext,
  agentId: unknown,
  requestedRole: unknown,
  requestedModel: unknown,
  provider?: { models: readonly { id: string }[] },
) {
  const defaultModel = provider?.models?.[0]?.id ?? 'opencode';
  if (typeof agentId !== 'string' && typeof requestedRole !== 'string') {
    return {
      agentName: undefined,
      role: 'assistant',
      providerId: 'opencode',
      modelId: typeof requestedModel === 'string' && requestedModel ? requestedModel : defaultModel,
    };
  }
  const selection = ctx.routingStore.get().selection;
  const agent = typeof agentId === 'string' ? await ctx.agents.getAgent(agentId) : null;
  const normalizedAgentRole =
    agent?.role === 'documenter' ? 'documentation' : agent?.role === 'planning' ? 'planner' : agent?.role;
  const selectableRoles: readonly EngineeringAgentRole[] = [
    'planner',
    'architect',
    'developer',
    'reviewer',
    'verifier',
    'documentation',
  ];
  const requestedRoutingRole =
    typeof requestedRole === 'string' && selectableRoles.includes(requestedRole as EngineeringAgentRole)
      ? (requestedRole as EngineeringAgentRole)
      : undefined;
  const role =
    requestedRoutingRole && requestedRoutingRole === normalizedAgentRole && selection.roles[requestedRoutingRole]
      ? requestedRoutingRole
      : selection.roles.developer
        ? 'developer'
        : Object.keys(selection.roles)[0];
  const selected = role ? selection.roles[role as EngineeringAgentRole] : undefined;
  return {
    agentName: agent?.name,
    role: role ?? 'assistant',
    providerId: selected?.providerId ?? 'opencode',
    modelId: selected?.modelId ?? defaultModel,
  };
}
