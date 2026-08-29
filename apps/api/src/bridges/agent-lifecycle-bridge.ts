/**
 * ARX-015: Agent Lifecycle Bridge
 *
 * Subscribes to harness/runtime lifecycle events (`harness.*`) and re-emits
 * canonical agent lifecycle events (`agent:started`, `agent:completed`) on the
 * EventBus. This is the integration boundary between harness-internal event
 * namespaces and the canonical Activity Room agent lifecycle contract.
 *
 * The bridge resolves model/provider metadata from AgentStorage so the M9
 * durable record carries enough identity for M10 to project agent participants
 * with their assigned model name.
 *
 * Design constraints:
 *   - Does NOT modify the harness event contract
 *   - Does NOT create a second participant authority
 *   - Preserves stable agent identity (agentId) independently from model display
 *   - Follows the OrchestrationEventBridge composition-root pattern
 */

import type { EventBus } from '@vestara/event-bus';
import type { VestaraEvent } from '@vestara/shared';

/** Minimal interface for resolving agent model configuration. */
export interface AgentModelResolver {
  resolve(input: { agentId: string }): Promise<
    | {
        providerId?: string;
        modelId?: string;
        role?: string;
        displayName?: string;
        modelDisplayName?: string;
      }
    | undefined
  >;
}

export interface AgentLifecycleBridgeOptions {
  readonly eventBus: EventBus;
  readonly agentModelResolver: AgentModelResolver;
}

/** Identity fields carried in harness.* event payloads. */
interface HarnessIdentity {
  readonly agentId?: unknown;
  readonly threadId?: unknown;
  readonly turnId?: unknown;
  readonly runId?: unknown;
  readonly correlationId?: unknown;
  readonly causationId?: unknown;
}

/**
 * Create the Agent lifecycle bridge. Returns an unsubscribe function.
 *
 * The bridge subscribes to `harness.*` events and:
 *   1. Filters to turn lifecycle events (started/completed/cancelled)
 *   2. Resolves the agent's model configuration
 *   3. Emits canonical `agent:started`/`agent:completed` events
 *
 * The M9IngestionBridge then ingests these canonical events normally.
 */
export function createAgentLifecycleBridge(options: AgentLifecycleBridgeOptions): () => void {
  const handler = async (event: VestaraEvent): Promise<void> => {
    try {
      const payload = event.payload as HarnessIdentity & Record<string, unknown>;
      const agentId = typeof payload.agentId === 'string' && payload.agentId ? payload.agentId : '';
      if (!agentId) return;

      // Map harness event types to canonical agent lifecycle types
      const lifecycleType = mapHarnessToLifecycle(event.type);
      if (!lifecycleType) return;

      // Resolve model metadata from agent configuration
      const resolved = await options.agentModelResolver.resolve({ agentId });

      // displayName = canonical identity (agentId for unnamed agents)
      // modelDisplayName = presentation-only model name (for unnamed AI fallback)
      const modelDisplayName = resolved?.modelDisplayName || resolved?.displayName;

      // Emit canonical agent lifecycle event for M9 bridge ingestion
      await options.eventBus
        .emit({
          type: `agent:${lifecycleType}`,
          source: 'agent-lifecycle-bridge',
          actor: { id: agentId, role: 'agent' },
          payload: {
            agentId,
            displayName: agentId,
            modelDisplayName,
            role: resolved?.role || agentId,
            modelId: resolved?.modelId,
            providerId: resolved?.providerId,
            task: (payload as Record<string, unknown>).instruction ?? (payload as Record<string, unknown>).task,
          },
          metadata: {
            correlationId:
              typeof payload.correlationId === 'string' ? payload.correlationId : event.metadata?.correlationId,
            causationId: typeof payload.causationId === 'string' ? payload.causationId : event.metadata?.causationId,
            executionId: event.metadata?.executionId,
            traceId: event.metadata?.traceId,
          },
        })
        .catch(() => {
          /* bridge failures must never break the harness run */
        });
    } catch {
      /* best-effort — swallow all errors */
    }
  };

  return options.eventBus.subscribe('harness.*', handler);
}

/**
 * Map harness event types to canonical agent lifecycle types.
 * Returns undefined for events that don't represent agent lifecycle transitions.
 */
function mapHarnessToLifecycle(type: string): 'started' | 'completed' | 'failed' | 'cancelled' | 'progress' | null {
  if (type === 'harness.turn.started') return 'started';
  if (type === 'harness.outcome.completed') return 'completed';
  if (type === 'harness.outcome.failed') return 'failed';
  if (type === 'harness.outcome.cancelled') return 'cancelled';
  if (type === 'harness.model.started') return 'progress';
  return null;
}
