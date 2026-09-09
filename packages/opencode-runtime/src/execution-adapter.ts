/**
 * OpenCode Runtime Execution Adapter — proof of the RuntimeExecutionPort boundary.
 *
 * CORE-004 Phase C: Implements RuntimeExecutionPort by wrapping the existing
 * OpenCode HTTP client. This adapter translates between canonical Vestara
 * execution contracts and OpenCode-native formats.
 *
 * The adapter does NOT rewrite the OpenCode client. It wraps proven existing
 * infrastructure and adds canonical boundary translation.
 *
 * Architecture:
 *   ExecutionRequest (Vestara canonical)
 *       ↓
 *   OpenCodeAdapter.execute()
 *       ↓
 *   OpenCodeHttpClient (existing, proven)
 *       ↓
 *   OpenCode headless server
 *       ↓
 *   OpenCode events (runtime-native)
 *       ↓
 *   OpenCodeAdapter (translation layer)
 *       ↓
 *   ExecutionObservation (Vestara canonical)
 *
 * INVARIANT: No OpenCode-specific types appear in the port contract.
 * The adapter translates everything internally.
 */

import type {
  CanonicalPermissionAction,
  ExecutionId,
  ExecutionObservation,
  ExecutionRequest,
  RuntimeBinding,
  RuntimeExecutionHandle,
  RuntimeExecutionPort,
  RuntimeSessionId,
} from '@vestara/execution-types';
import { operationId } from '@vestara/execution-types';

import type { OpenCodeHttpClient } from './client/opencode-http-client.js';
import type { OpenCodeEvent, OpenCodeRequestContext } from './client/opencode-types.js';
import { classifyPermissionRisk, normalizePermissionAction } from './permissions/permission-types.js';

/**
 * Configuration for the OpenCode adapter.
 */
export interface OpenCodeAdapterConfig {
  /** The OpenCode HTTP client (existing, proven). */
  readonly client: OpenCodeHttpClient;
  /** Workspace identifier. */
  readonly workspaceId: string;
  /** Repository directory (canonical path). */
  readonly directory: string;
  /** OpenCode agent name. */
  readonly agent: string;
  /** Default timeout for turns (ms). */
  readonly turnTimeoutMs?: number;
}

/**
 * Resolve the execution binding from an execution request.
 *
 * This is the provider/model resolution step. In the current GA path,
 * this delegates to AssistantBindingResolver. Here it's simplified to
 * use the routing intent from the request.
 */
function _resolveBinding(request: ExecutionRequest, config: OpenCodeAdapterConfig): RuntimeBinding {
  return {
    executionId: request.id,
    runtimeId: 'opencode',
    providerId: request.routing?.providerId,
    modelId: request.routing?.modelId,
    boundAt: new Date().toISOString(),
    metadata: {
      workspaceId: config.workspaceId,
      directory: config.directory,
      agent: config.agent,
    },
  };
}

/**
 * Create an OpenCode request context from the adapter config.
 */
function makeContext(config: OpenCodeAdapterConfig): OpenCodeRequestContext {
  return {
    workspaceId: config.workspaceId,
    directory: config.directory,
  };
}

/**
 * Map OpenCode session status to canonical ExecutionStatus.
 */
function _mapSessionStatus(ocStatus: string): 'completed' | 'failed' | undefined {
  switch (ocStatus) {
    case 'idle':
      return 'completed';
    case 'error':
      return 'failed';
    default:
      return undefined;
  }
}

/**
 * Normalize a raw permission action to the canonical vocabulary,
 * preserving the native action in metadata.
 */
function normalizePermissionWithNative(rawAction: string): { canonical: CanonicalPermissionAction; native: string } {
  return {
    canonical: normalizePermissionAction(rawAction) as CanonicalPermissionAction,
    native: rawAction,
  };
}

/**
 * OpenCode Runtime Execution Adapter.
 *
 * Implements RuntimeExecutionPort by wrapping the existing OpenCodeHttpClient.
 * The adapter translates between canonical Vestara contracts and OpenCode-native
 * formats without modifying the OpenCode client.
 */
export class OpenCodeAdapter implements RuntimeExecutionPort {
  readonly runtimeId = 'opencode';

  constructor(private readonly config: OpenCodeAdapterConfig) {}

  async isAvailable(): Promise<boolean> {
    try {
      // Use listSessions as a liveness probe — if the runtime is reachable,
      // this call will succeed. A dedicated health endpoint may be added later.
      const context = makeContext(this.config);
      await this.config.client.listSessions(context);
      return true;
    } catch {
      return false;
    }
  }

  async execute(request: ExecutionRequest, binding: RuntimeBinding): Promise<RuntimeExecutionHandle> {
    const context = makeContext(this.config);
    const resolvedBinding = { ...binding, runtimeId: 'opencode', boundAt: new Date().toISOString() };

    // Create or reuse OpenCode session
    const ocSession = await this.config.client.createSession({ title: request.objective.slice(0, 48) }, context);

    // Send the execution prompt
    const model =
      resolvedBinding.providerId && resolvedBinding.modelId
        ? { providerId: resolvedBinding.providerId, modelId: resolvedBinding.modelId }
        : undefined;

    await this.config.client.sendMessageAsync(
      ocSession.id,
      {
        parts: [{ type: 'text', text: request.objective }],
        agent: this.config.agent,
        model,
        system: request.context.surfaceContext ? JSON.stringify(request.context.surfaceContext) : undefined,
      },
      context,
    );

    // Open the event stream and create the handle
    const eventStream = this.config.client.openEventStream(context);
    const observations = this.createObservationStream(request.id, ocSession.id, eventStream, resolvedBinding);

    return {
      executionId: request.id,
      runtimeSessionId: ocSession.id as RuntimeSessionId,
      binding: resolvedBinding,
      observations,
      cancel: async () => {
        await this.config.client.abortSession(ocSession.id, context);
      },
    };
  }

  /**
   * Create an observation stream from OpenCode events.
   *
   * This is the core translation layer: OpenCode-native events become
   * canonical ExecutionObservation objects.
   */
  private async *createObservationStream(
    executionId: ExecutionId,
    sessionId: string,
    eventStream: AsyncIterable<OpenCodeEvent>,
    _binding: RuntimeBinding,
  ): AsyncGenerator<ExecutionObservation> {
    const _context = makeContext(this.config);
    const deadline = Date.now() + (this.config.turnTimeoutMs ?? 300_000);
    let turnDone = false;

    yield {
      kind: 'status',
      executionId,
      timestamp: new Date().toISOString(),
      status: 'running',
      reason: 'execution started',
    };

    for await (const event of eventStream) {
      // Timeout check
      if (Date.now() > deadline) {
        yield {
          kind: 'result',
          executionId,
          timestamp: new Date().toISOString(),
          status: 'timed_out',
          error: { code: 'TIMEOUT', message: 'Execution timed out', recoverable: false },
        };
        return;
      }

      // Filter by session
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload?.sessionID && payload.sessionID !== sessionId) continue;

      const timestamp = new Date().toISOString();

      switch (event.type) {
        // ── Text delta ──
        case 'session.next.text.delta':
        case 'message.part.delta': {
          const delta = String(payload?.delta ?? payload?.content ?? '');
          if (delta) {
            yield {
              kind: 'activity',
              executionId,
              timestamp,
              operationId: operationId(`text-${Date.now()}`),
              activityType: 'text-delta',
              state: 'running',
              detail: { delta },
            };
          }
          break;
        }

        // ── Tool lifecycle ──
        case 'session.next.tool.input.started':
        case 'session.next.tool.called': {
          const callId = String(payload?.callID ?? payload?.callId ?? `tool-${Date.now()}`);
          const toolName = String(payload?.tool ?? 'unknown');
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(callId),
            activityType: 'tool-call',
            name: toolName,
            state: 'running',
          };
          break;
        }

        case 'session.next.tool.success': {
          const callId = String(payload?.callID ?? payload?.callId ?? `tool-${Date.now()}`);
          const toolName = String(payload?.tool ?? 'unknown');
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(callId),
            activityType: 'tool-result',
            name: toolName,
            state: 'completed',
            detail: { output: payload?.content },
          };
          break;
        }

        case 'session.next.tool.failed': {
          const callId = String(payload?.callID ?? payload?.callId ?? `tool-${Date.now()}`);
          const toolName = String(payload?.tool ?? 'unknown');
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(callId),
            activityType: 'tool-result',
            name: toolName,
            state: 'failed',
            detail: { error: payload?.error },
          };
          break;
        }

        // ── Shell lifecycle ──
        case 'session.next.shell.started': {
          const callId = String(payload?.callID ?? `shell-${Date.now()}`);
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(callId),
            activityType: 'shell-command',
            name: String(payload?.command ?? 'bash'),
            state: 'running',
            detail: { command: payload?.command },
          };
          break;
        }

        case 'session.next.shell.ended': {
          const callId = String(payload?.callID ?? `shell-${Date.now()}`);
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(callId),
            activityType: 'shell-command',
            name: 'bash',
            state: 'completed',
            detail: { exitCode: payload?.exitCode, output: payload?.output ?? payload?.content },
          };
          break;
        }

        // ── Permission requests ──
        case 'permission.v2.asked':
        case 'permission.asked': {
          const permId = String(payload?.id ?? `perm-${Date.now()}`);
          const rawAction = String(payload?.action ?? payload?.permission ?? 'other');
          const { canonical, native } = normalizePermissionWithNative(rawAction);
          const resources = Array.isArray(payload?.resources)
            ? (payload.resources as string[])
            : Array.isArray(payload?.patterns)
              ? (payload.patterns as string[])
              : [];

          yield {
            kind: 'permission',
            executionId,
            timestamp,
            permissionRequestId: permId,
            canonicalAction: canonical,
            nativeAction: native,
            runtime: 'opencode',
            resources,
            risk: classifyPermissionRisk(rawAction) as 'safe' | 'sensitive' | 'dangerous',
          };
          break;
        }

        // ── Permission replies ──
        case 'permission.v2.replied':
        case 'permission.replied': {
          // Permission resolved — no observation needed (decision already sent)
          break;
        }

        // ── Questions ──
        case 'question.v2.asked':
        case 'question.asked': {
          const questionId = String(payload?.id ?? `question-${Date.now()}`);
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(questionId),
            activityType: 'question-asked',
            state: 'running',
            detail: { questions: payload?.questions },
          };
          break;
        }

        // ── File edits ──
        case 'file.edited': {
          yield {
            kind: 'activity',
            executionId,
            timestamp,
            operationId: operationId(`edit-${Date.now()}`),
            activityType: 'file-edit',
            name: String(payload?.file ?? ''),
            state: 'running',
            detail: { file: payload?.file },
          };
          break;
        }

        // ── Session status — turn completion ──
        case 'session.status': {
          const statusPayload = payload?.status as Record<string, unknown> | undefined;
          if (statusPayload?.type === 'idle') {
            turnDone = true;
          }
          break;
        }

        case 'session.idle': {
          turnDone = true;
          break;
        }

        // ── Session error ──
        case 'session.error': {
          yield {
            kind: 'result',
            executionId,
            timestamp,
            status: 'failed',
            error: {
              code: 'RUNTIME_ERROR',
              message: String(payload?.error ?? payload?.message ?? 'Runtime error'),
              recoverable: false,
            },
          };
          return;
        }
      }

      // Check natural completion
      if (turnDone) {
        yield {
          kind: 'result',
          executionId,
          timestamp,
          status: 'completed',
        };
        return;
      }
    }

    // Stream ended without explicit completion
    if (!turnDone) {
      yield {
        kind: 'result',
        executionId,
        timestamp: new Date().toISOString(),
        status: 'completed',
      };
    }
  }
}
