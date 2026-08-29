/**
 * Normalize raw `opencode.*` stream envelopes into a stable UI event union.
 *
 * Only events correlated to the open session are passed in. Unknown types
 * degrade to a neutral system event instead of being discarded.
 */

import type { OpenCodeStreamEnvelope } from '../../../lib/opencode-events';

export type OpenCodeLifecycleStage = 'request' | 'context' | 'planning' | 'execution' | 'verification' | 'complete';

export interface OpenCodeActivityBase {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly sessionId?: string;
  readonly executionId?: string;
  readonly agentId?: string;
}

export interface OpenCodeUserMessageEvent extends OpenCodeActivityBase {
  readonly kind: 'message';
  readonly role: 'user';
  readonly text: string;
  readonly messageId?: string;
}

export interface OpenCodeAgentMessageEvent extends OpenCodeActivityBase {
  readonly kind: 'message';
  readonly role: 'assistant';
  readonly text: string;
  readonly messageId?: string;
}

export interface OpenCodeToolStartedEvent extends OpenCodeActivityBase {
  readonly kind: 'tool';
  readonly phase: 'started';
  readonly tool: string;
  readonly callId?: string;
  readonly messageId?: string;
  readonly input?: Record<string, unknown>;
}

export interface OpenCodeToolCompletedEvent extends OpenCodeActivityBase {
  readonly kind: 'tool';
  readonly phase: 'completed';
  readonly tool: string;
  readonly callId?: string;
  readonly messageId?: string;
  readonly output?: string;
}

export interface OpenCodeFileOperationEvent extends OpenCodeActivityBase {
  readonly kind: 'file';
  readonly path?: string;
  readonly operation: string;
}

export interface OpenCodeStatusChangedEvent extends OpenCodeActivityBase {
  readonly kind: 'status';
  readonly status: string;
}

export interface OpenCodeSessionErrorEvent extends OpenCodeActivityBase {
  readonly kind: 'error';
  readonly message: string;
}

export interface OpenCodeSystemEvent extends OpenCodeActivityBase {
  readonly kind: 'system';
  readonly summary: string;
}

export interface OpenCodeUnknownEvent extends OpenCodeActivityBase {
  readonly kind: 'unknown';
  readonly rawType: string;
}

export type OpenCodeActivityEvent =
  | OpenCodeUserMessageEvent
  | OpenCodeAgentMessageEvent
  | OpenCodeToolStartedEvent
  | OpenCodeToolCompletedEvent
  | OpenCodeFileOperationEvent
  | OpenCodeStatusChangedEvent
  | OpenCodeSessionErrorEvent
  | OpenCodeSystemEvent
  | OpenCodeUnknownEvent;

const LIFECYCLE_FROM_STATUS: Record<string, OpenCodeLifecycleStage> = {
  pending: 'request',
  planning: 'planning',
  executing: 'execution',
  running: 'execution',
  verifying: 'verification',
  completed: 'complete',
  done: 'complete',
};

/** Derive a lifecycle stage from a status string. */
export function lifecycleStageFromStatus(status: string): OpenCodeLifecycleStage | undefined {
  const normalized = status.toLowerCase();
  if (normalized in LIFECYCLE_FROM_STATUS) return LIFECYCLE_FROM_STATUS[normalized];
  if (normalized.includes('plan')) return 'planning';
  if (normalized.includes('context') || normalized.includes('read')) return 'context';
  if (normalized.includes('execut') || normalized.includes('run')) return 'execution';
  if (normalized.includes('verif')) return 'verification';
  if (normalized.includes('complete') || normalized.includes('done') || normalized.includes('finish'))
    return 'complete';
  return undefined;
}

function summaryForTool(type: string, payload: Record<string, unknown>): string {
  const tool = payload.tool ?? payload.toolName ?? 'tool';
  const state = payload.state as Record<string, unknown> | undefined;
  const status = (state?.status as string | undefined) ?? payload.status ?? 'running';
  return `${String(tool)} ${String(status)}`;
}

function extractToolPart(payload: Record<string, unknown>): {
  tool?: string;
  callId?: string;
  input?: Record<string, unknown>;
  output?: string;
} {
  const part = payload.part as Record<string, unknown> | undefined;
  const tool = part?.tool as string | undefined;
  const callId = (part?.callID as string | undefined) ?? (payload.callID as string | undefined);
  const state = part?.state as Record<string, unknown> | undefined;
  const input = state?.input as Record<string, unknown> | undefined;
  const metadata = state?.metadata as Record<string, unknown> | undefined;
  const output = metadata?.output as string | undefined;
  return { tool, callId, input, output };
}

/**
 * Normalize an envelope into an activity event. Returns undefined for events
 * that do not carry session-scoped content (e.g. server.connected).
 */
export function normalizeActivityEvent(envelope: OpenCodeStreamEnvelope): OpenCodeActivityEvent | undefined {
  const payload = envelope.payload;
  const base: OpenCodeActivityBase = {
    id: envelope.id,
    type: envelope.type,
    timestamp: payload?.timestamp ?? envelope.timestamp,
    sessionId: payload?.sessionId,
    executionId: undefined,
    agentId: undefined,
  };
  const inner = payload?.payload ?? {};
  const rawType = payload?.type ?? envelope.type.replace(/^opencode\./, '');

  switch (rawType) {
    case 'message.updated': {
      const info = inner.info as Record<string, unknown> | undefined;
      const role = info?.role as string | undefined;
      const text = (info?.text as string | undefined) ?? '';
      return {
        ...base,
        kind: 'message',
        role: role === 'user' ? 'user' : 'assistant',
        text: text ?? '',
        messageId: payload?.messageId ?? (info?.id as string | undefined),
      };
    }
    case 'message.part.delta': {
      const delta = payload?.delta ?? '';
      return {
        ...base,
        kind: 'message',
        role: 'assistant',
        text: typeof delta === 'string' ? delta : '',
        messageId: payload?.messageId,
      };
    }
    case 'message.part.updated': {
      const part = inner.part as Record<string, unknown> | undefined;
      const partType = part?.type as string | undefined;
      if (partType === 'tool') {
        const { tool, callId, input, output } = extractToolPart(inner);
        const state = part?.state as Record<string, unknown> | undefined;
        const running = (state?.status as string | undefined) === 'running' || !state?.status;
        if (running) {
          return {
            ...base,
            kind: 'tool',
            phase: 'started',
            tool: tool ?? 'tool',
            callId,
            input,
            messageId: payload?.messageId,
          };
        }
        return {
          ...base,
          kind: 'tool',
          phase: 'completed',
          tool: tool ?? 'tool',
          callId,
          output: output ?? ((state?.metadata as Record<string, unknown> | undefined)?.output as string | undefined),
          messageId: payload?.messageId,
        };
      }
      if (partType === 'file') {
        return {
          ...base,
          kind: 'file',
          path: (part?.path as string | undefined) ?? (part?.filePath as string | undefined),
          operation: 'updated',
        };
      }
      return undefined;
    }
    case 'session.status': {
      const statusInfo = inner.status as Record<string, unknown> | undefined;
      const status = (statusInfo?.type as string | undefined) ?? 'unknown';
      return {
        ...base,
        kind: 'status',
        status,
        sessionId: payload?.sessionId ?? base.sessionId,
      };
    }
    case 'session.diff': {
      const files = Array.isArray(inner.diff) ? inner.diff.length : 0;
      return {
        ...base,
        kind: 'file',
        operation: `diff (${files} files)`,
      };
    }
    case 'session.idle': {
      return { ...base, kind: 'status', status: 'idle' };
    }
    case 'session.error':
    case 'message.error':
    case 'session.failed': {
      return {
        ...base,
        kind: 'error',
        message: (inner.message as string | undefined) ?? 'OpenCode reported an error',
      };
    }
    case 'session.updated': {
      const info = inner.info as Record<string, unknown> | undefined;
      const title = info?.title as string | undefined;
      return { ...base, kind: 'system', summary: title ? `Session "${title}"` : 'Session updated' };
    }
    default: {
      return { ...base, kind: 'unknown', rawType };
    }
  }
}
