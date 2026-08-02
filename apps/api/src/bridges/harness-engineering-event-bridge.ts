/**
 * Harness → Engineering Event Store bridge.
 *
 * Subscribes to `harness.*` domain events emitted by AgentHarnessRuntime and
 * projects them into the SqliteEngineeringEventStore. The harness never knows
 * about the event store; this bridge is a decoupled projection. A projection
 * failure is recorded through telemetry and never breaks the harness run.
 */

import type { EngineeringTruthEventInput, SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import type { EmitEvent, EventBus } from '@vestara/event-bus';
import type { VestaraEvent } from '@vestara/shared';
import type { TelemetryRuntime } from '@vestara/telemetry';

export interface HarnessEventIdentityFields {
  readonly threadId?: unknown;
  readonly turnId?: unknown;
  readonly runId?: unknown;
  readonly agentId?: unknown;
  readonly correlationId?: unknown;
  readonly causationId?: unknown;
}

export interface HarnessEngineeringEventBridgeOptions {
  readonly eventBus: EventBus;
  readonly events: SqliteEngineeringEventStore;
  readonly workspaceId: string;
  readonly environmentId: string;
  readonly telemetry?: TelemetryRuntime;
  /** Called after an event is appended, with the engineering event seq. */
  readonly onAppended?: (input: { threadId?: string; sequence: number }) => void;
}

/**
 * Pure normalization of a harness domain event into an event-store append.
 * Exported for unit testing without a live bus or store.
 */
export function harnessEventToAppend(
  event: VestaraEvent,
  workspaceId: string,
  environmentId: string,
): EngineeringTruthEventInput {
  const payload = event.payload as HarnessEventIdentityFields & Record<string, unknown>;
  const agentId = typeof payload.agentId === 'string' && payload.agentId ? payload.agentId : 'agent-harness';
  return {
    type: event.type,
    at: event.timestamp,
    source: 'agent-harness',
    actorId: agentId,
    authority: event.actor?.role === 'user' ? 'user' : 'system',
    workspaceId,
    environmentId,
    threadId: typeof payload.threadId === 'string' ? payload.threadId : undefined,
    turnId: typeof payload.turnId === 'string' ? payload.turnId : undefined,
    correlationId: typeof payload.correlationId === 'string' ? payload.correlationId : event.metadata.correlationId,
    causationId: typeof payload.causationId === 'string' ? payload.causationId : event.metadata.causationId,
    payload: { ...payload },
  };
}

export function createHarnessEngineeringEventBridge(options: HarnessEngineeringEventBridgeOptions): () => void {
  const handler = async (event: VestaraEvent): Promise<void> => {
    try {
      const appended = options.events.append(harnessEventToAppend(event, options.workspaceId, options.environmentId));
      options.onAppended?.({ threadId: appended.threadId, sequence: appended.seq });
    } catch (error) {
      options.telemetry?.track({
        agent: 'agent-harness',
        timestamp: new Date().toISOString(),
        type: 'harness-bridge.persist-failed',
        status: 'failed',
        operation: 'verify',
        task: 'harness-bridge',
        progress: 0,
        phase: 'projection',
        detail: error instanceof Error ? error.message : String(error),
        metadata: {
          type: event.type,
          threadId: String((event.payload as HarnessEventIdentityFields).threadId ?? ''),
        },
      });
    }
  };
  return options.eventBus.subscribe('harness.*', handler);
}
