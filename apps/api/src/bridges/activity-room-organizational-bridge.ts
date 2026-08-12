/**
 * Activity Room organizational bridge (post-ORB observability substrate).
 *
 * Feeds the organization's actual events — workflow lifecycle, acceptance
 * boundary, and harness stage turns — into the Activity Room's durable
 * projection as structured `ActivitySourceEvent`s. The room therefore renders
 * what the organization is doing, believing, and questioning, rather than only
 * the Director's messages.
 *
 * Machine-consumed organizational state comes from structured events emitted
 * by the organization, not from prose parsed into statuses.
 */

import type { ActivitySourceEvent } from '@vestara/activity-projection';
import type { ActivityRoom } from '../activity-room';
import { getActivityRoom } from '../activity-room';
import type { SessionStreamAccumulator } from '../session-stream';

export interface ActivityRoomOrganizationalBridgeOptions {
  readonly eventBus: {
    subscribe(pattern: string, handler: (evt: ActivityRoomBridgeEvent) => void | Promise<void>): () => void;
  };
  readonly threadStore: {
    getThread(id: string): { metadata?: Readonly<Record<string, unknown>> } | undefined;
  };
  /** Injectable for tests; defaults to the process-lifetime room. */
  readonly room?: ActivityRoom;
  /** Coalesces live session narrative; injected by the API boot. */
  readonly streams?: SessionStreamAccumulator;
}

export interface ActivityRoomBridgeEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly actor?: { id: string; role?: string };
  readonly payload: Record<string, unknown>;
}

/** Organizational events that carry a workflowId in their payload. */
const ORGANIZATIONAL_EVENT_TYPES = new Set(['workflow.started', 'workflow.completed', 'acceptance.boundary']);

/** Harness stage-turn events projected as agent activity. */
const HARNESS_EVENT_TYPES = new Set([
  'harness.turn.started',
  'harness.outcome.completed',
  'harness.outcome.failed',
  'harness.model.completed',
]);

/** Live runtime execution activity correlated to a participant/thread. */
const EXECUTION_ACTIVITY_TYPE = 'opencode.execution.activity';

/** Maps a normalized Vestara execution event type to a harness activity type. */
function executionActivityToSourceType(type: string): string | undefined {
  switch (type) {
    case 'tool.started':
      return 'harness.tool.started';
    case 'tool.completed':
      return 'harness.tool.completed';
    case 'agent.progress':
      return 'harness.model-response';
    default:
      return undefined; // activity/heartbeat and terminal events are not projected here
  }
}

export function startActivityRoomOrganizationalBridge(options: ActivityRoomOrganizationalBridgeOptions): () => void {
  return options.eventBus.subscribe('*', async (evt) => {
    try {
      // Resolve lazily per event: the durable room is initialized after the
      // bridge is wired at boot, and routes/bridge must share the same instance.
      const room = options.room ?? getActivityRoom();
      for (const event of projectSourceEvents(evt, options)) {
        if (event) await room.service.project(event);
      }
    } catch {
      // Projection persistence must never break the organizational run.
    }
  });
}

function projectSourceEvents(
  evt: ActivityRoomBridgeEvent,
  options: ActivityRoomOrganizationalBridgeOptions,
): readonly ActivitySourceEvent[] {
  const type = evt.type;
  if (ORGANIZATIONAL_EVENT_TYPES.has(type)) {
    return [
      {
        id: evt.id,
        type,
        at: evt.timestamp,
        actorId: 'multi-agent-workflow',
        authority: 'system',
        workflowId: String(evt.payload.workflowId ?? ''),
        correlationId: undefined,
        payload: evt.payload,
      },
    ];
  }
  if (HARNESS_EVENT_TYPES.has(type)) {
    const threadId = typeof evt.payload.threadId === 'string' ? evt.payload.threadId : undefined;
    const thread = threadId ? options.threadStore.getThread(threadId) : undefined;
    const workflowId = thread?.metadata?.workflowId;
    return [
      {
        id: evt.id,
        type,
        at: evt.timestamp,
        actorId: evt.actor?.id ?? 'agent-harness',
        authority: 'agent',
        workflowId: typeof workflowId === 'string' ? workflowId : undefined,
        threadId,
        turnId: typeof evt.payload.turnId === 'string' ? evt.payload.turnId : undefined,
        correlationId: typeof evt.payload.correlationId === 'string' ? evt.payload.correlationId : undefined,
        payload: evt.payload,
      },
    ];
  }
  if (type === EXECUTION_ACTIVITY_TYPE) {
    const innerType = typeof evt.payload.type === 'string' ? evt.payload.type : '';
    const threadId = typeof evt.payload.threadId === 'string' ? evt.payload.threadId : undefined;
    const thread = threadId ? options.threadStore.getThread(threadId) : undefined;
    const workflowId = thread?.metadata?.workflowId;
    const activity = typeof evt.payload.activity === 'string' ? evt.payload.activity : undefined;
    const at = typeof evt.payload.at === 'string' ? evt.payload.at : evt.timestamp;

    if (innerType === 'agent.progress') {
      // Streamed narrative: coalesce into the participant's live stream item.
      // Never a per-character durable record.
      if (options.streams && threadId) {
        options.streams.update(
          {
            sessionId: typeof evt.payload.sessionId === 'string' ? evt.payload.sessionId : '',
            threadId,
            role: String(thread?.metadata?.role ?? 'developer'),
            agentId: String(thread?.metadata?.agentId ?? evt.actor?.id ?? 'agent'),
            at,
          },
          activity ?? '',
        );
      }
      return [];
    }

    // Semantic boundaries finalize the live narrative as ONE readable record,
    // and the semantic event (tool, completion) is projected distinctly.
    const finalized = options.streams && threadId ? options.streams.finalize(threadId, at) : undefined;
    const records: ActivitySourceEvent[] = [];
    if (finalized && finalized.text.trim().length > 0) {
      records.push({
        id: `${evt.id}-narrative`,
        type: 'harness.agent-message',
        at,
        actorId: evt.actor?.id ?? 'agent-harness',
        authority: 'agent',
        workflowId: typeof workflowId === 'string' ? workflowId : undefined,
        threadId,
        turnId: typeof evt.payload.turnId === 'string' ? evt.payload.turnId : undefined,
        correlationId: typeof evt.payload.correlationId === 'string' ? evt.payload.correlationId : undefined,
        payload: { threadId, content: finalized.text.trim() },
      });
    }

    const sourceType = executionActivityToSourceType(innerType);
    if (sourceType && threadId) {
      records.push({
        id: evt.id,
        type: sourceType,
        at,
        actorId: evt.actor?.id ?? 'agent-harness',
        authority: 'agent',
        workflowId: typeof workflowId === 'string' ? workflowId : undefined,
        threadId,
        turnId: typeof evt.payload.turnId === 'string' ? evt.payload.turnId : undefined,
        correlationId: typeof evt.payload.correlationId === 'string' ? evt.payload.correlationId : undefined,
        payload: { ...evt.payload, toolName: innerType.startsWith('tool.') ? activity : undefined },
      });
    }
    return records;
  }
  return [];
}
