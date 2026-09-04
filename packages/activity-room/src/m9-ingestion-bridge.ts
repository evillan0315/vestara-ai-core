/**
 * M11C-I1: M9 Production Ingestion Bridge
 *
 * Single EventBus → M9 write boundary. Normalizes authoritative EventBus
 * events into canonical M9 ActivityEvents and appends to the durable store.
 *
 * Architecture:
 *   EventBus → M9IngestionBridge → DurableM9ActivityStore (M9)
 *
 * Invariants:
 *   I1-1: Single M9 ingestion authority (no other DurableM9ActivityStore.append calls)
 *   I1-2: Event identity preservation (canonical M1/M2 lineage flows through)
 *   I1-3: Idempotent redelivery (M9 deduplicates by eventId)
 *   I1-4: Typed normalization (existing M9 adapters, no prose parsing)
 *   I1-5: Explicit event disposition (INGEST/IGNORE/DEFER per pattern)
 *   I1-6: Failure isolation (bridge failures don't corrupt authoritative execution)
 *   I1-7: Ordering (sequential events produce deterministic M9 sequences)
 *   I1-8: No feedback loop (bridge does not emit to EventBus)
 *   I1-9: Lifecycle (initialized once, disposed cleanly)
 */

import type { EventBus } from '@vestara/event-bus';
import type { Unsubscribe, VestaraEvent } from '@vestara/shared';
import type { WorkflowRunId } from '@vestara/types';
import {
  fromAgentLifecycle,
  fromHumanMessage,
  fromInteractionPresented,
  fromInteractionResponded,
  fromWorkflowEvent,
} from './m9-adapter';
import type { ActivityEvent, M9ActivityStore } from './m9-types';

// ─── Event Disposition (I1-5) ──────────────────────────────

type Disposition = 'INGEST' | 'IGNORE' | 'DEFER';

interface PatternDisposition {
  readonly pattern: string;
  readonly disposition: Disposition;
  readonly reason: string;
  readonly adapter?: string;
}

/**
 * Explicit classification of EventBus patterns.
 * ActivityService subscribes to these for dashboard/logging.
 * M9IngestionBridge subscribes to INGEST patterns only.
 */
const PATTERN_DISPOSITIONS: readonly PatternDisposition[] = [
  // ─── INGEST: Durable Activity Room facts ──────────────────
  {
    pattern: 'conversation:created',
    disposition: 'INGEST',
    reason: 'Human started a conversation — durable Activity Room fact',
    adapter: 'fromHumanMessage',
  },
  {
    pattern: 'conversation:response.completed',
    disposition: 'INGEST',
    reason: 'AI response completed — durable Activity Room fact',
    adapter: 'fromAgentLifecycle',
  },
  {
    pattern: 'conversation:session.started',
    disposition: 'INGEST',
    reason: 'Conversation session started — durable Activity Room fact',
    adapter: 'fromHumanMessage',
  },
  {
    pattern: 'plan:created',
    disposition: 'INGEST',
    reason: 'Plan created — durable Activity Room fact',
  },
  {
    pattern: 'plan:approved',
    disposition: 'INGEST',
    reason: 'Plan approved — durable Activity Room fact',
  },
  {
    pattern: 'changeset:created',
    disposition: 'INGEST',
    reason: 'Changeset created — durable Activity Room fact',
    adapter: 'fromAgentLifecycle',
  },
  {
    pattern: 'changeset:applied',
    disposition: 'INGEST',
    reason: 'Changeset applied — durable Activity Room fact',
  },
  {
    pattern: 'verification:started',
    disposition: 'INGEST',
    reason: 'Verification started — durable Activity Room fact',
    adapter: 'fromAgentLifecycle',
  },
  {
    pattern: 'verification:completed',
    disposition: 'INGEST',
    reason: 'Verification completed — durable Activity Room fact',
    adapter: 'fromAgentLifecycle',
  },
  {
    pattern: 'agent:started',
    disposition: 'INGEST',
    reason: 'Agent started — durable Activity Room fact',
    adapter: 'fromAgentLifecycle',
  },
  {
    pattern: 'agent:completed',
    disposition: 'INGEST',
    reason: 'Agent completed — durable Activity Room fact',
    adapter: 'fromAgentLifecycle',
  },
  {
    pattern: 'orchestration.*',
    disposition: 'INGEST',
    reason: 'Orchestration event — durable Activity Room fact',
  },
  {
    pattern: 'interaction:presented',
    disposition: 'INGEST',
    reason: 'Interaction presented — durable Activity Room fact',
    adapter: 'fromInteractionPresented',
  },
  {
    pattern: 'interaction:responded',
    disposition: 'INGEST',
    reason: 'Interaction responded — durable Activity Room fact',
    adapter: 'fromInteractionResponded',
  },

  // ─── IGNORE: Operational-only, not Activity Room facts ─────
  {
    pattern: 'workspace:discover.completed',
    disposition: 'IGNORE',
    reason: 'Workspace discovery is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:fingerprint.completed',
    disposition: 'IGNORE',
    reason: 'Workspace fingerprint is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:analysis.completed',
    disposition: 'IGNORE',
    reason: 'Workspace analysis is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:manifest.created',
    disposition: 'IGNORE',
    reason: 'Manifest creation is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:present.completed',
    disposition: 'IGNORE',
    reason: 'Presentation is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:index.completed',
    disposition: 'IGNORE',
    reason: 'Indexing is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:understood',
    disposition: 'IGNORE',
    reason: 'Understanding is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:ready',
    disposition: 'IGNORE',
    reason: 'Workspace ready is operational, not a collaboration fact',
  },
  {
    pattern: 'workspace:error',
    disposition: 'IGNORE',
    reason: 'Workspace error is operational, not a collaboration fact',
  },
  {
    pattern: 'memory:indexed',
    disposition: 'IGNORE',
    reason: 'Memory indexing is operational, not a collaboration fact',
  },
  {
    pattern: 'user:profile.created',
    disposition: 'IGNORE',
    reason: 'Profile creation is identity management, not Activity Room',
  },
  {
    pattern: 'user:profile.updated',
    disposition: 'IGNORE',
    reason: 'Profile update is identity management, not Activity Room',
  },

  // ─── DEFER: Future capability ──────────────────────────────
  {
    pattern: 'workspace:opened',
    disposition: 'DEFER',
    reason: 'Workspace open is important but not yet modeled as Activity Room fact',
  },
  {
    pattern: 'workspace:indexed',
    disposition: 'DEFER',
    reason: 'Workspace indexed — may become Activity Room fact when indexing is collaborative',
  },
  {
    pattern: 'workspace:updated',
    disposition: 'DEFER',
    reason: 'Workspace updated — may become Activity Room fact for file-change collaboration',
  },
] as const;

// ─── Bridge ────────────────────────────────────────────────

export interface M9IngestionBridgeOptions {
  /** The M9 durable activity store. */
  readonly store: M9ActivityStore;
  /** The process-wide EventBus. */
  readonly eventBus: EventBus;
  /** Optional logger. */
  readonly logger?: {
    warn: (msg: string, ctx?: Record<string, unknown>) => void;
    info: (msg: string, ctx?: Record<string, unknown>) => void;
  };
}

/**
 * Single EventBus → M9 write boundary.
 *
 * Subscribes to EventBus patterns classified as INGEST and normalizes
 * them into M9 ActivityEvents using existing adapters. Appends to the
 * DurableM9ActivityStore. Does NOT emit to EventBus (I1-8).
 */
export class M9IngestionBridge {
  private readonly store: M9ActivityStore;
  private readonly eventBus: EventBus;
  private readonly logger?: M9IngestionBridgeOptions['logger'];
  private readonly unsubscribers: Unsubscribe[] = [];
  private started = false;

  constructor(options: M9IngestionBridgeOptions) {
    this.store = options.store;
    this.eventBus = options.eventBus;
    this.logger = options.logger;
  }

  /**
   * Subscribe to INGEST patterns. Must be called exactly once (I1-9).
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    const ingestPatterns = PATTERN_DISPOSITIONS.filter((d) => d.disposition === 'INGEST');

    for (const disposition of ingestPatterns) {
      try {
        const unsub = this.eventBus.subscribe(disposition.pattern, async (event: VestaraEvent) => {
          await this.ingest(event);
        });
        this.unsubscribers.push(unsub);
      } catch (err) {
        this.logger?.warn('M9IngestionBridge: failed to subscribe', {
          pattern: disposition.pattern,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger?.info('M9IngestionBridge started', { patterns: ingestPatterns.length });
  }

  /**
   * Unsubscribe all patterns. Called during shutdown/restart (I1-9).
   */
  stop(): void {
    for (const unsub of this.unsubscribers) {
      try {
        unsub();
      } catch {
        /* best-effort */
      }
    }
    this.unsubscribers.length = 0;
    this.started = false;
    this.logger?.info('M9IngestionBridge stopped');
  }

  /**
   * Get the list of patterns classified as INGEST (for testing/introspection).
   */
  static getIngestPatterns(): readonly string[] {
    return PATTERN_DISPOSITIONS.filter((d) => d.disposition === 'INGEST').map((d) => d.pattern);
  }

  /**
   * Get the full disposition table (for testing/introspection).
   */
  static getDispositions(): readonly PatternDisposition[] {
    return PATTERN_DISPOSITIONS;
  }

  // ─── Internal ────────────────────────────────────────────

  /**
   * Normalize and append a single EventBus event to M9.
   * Failures are logged and do not propagate (I1-6).
   *
   * F2 correction: Uses semantic eventId from payload for interaction events,
   * ensuring stable deduplication across normal and recovery publication.
   */
  private async ingest(event: VestaraEvent): Promise<void> {
    try {
      const activityEvent = this.mapToActivityEvent(event);
      if (activityEvent === null) {
        return;
      }
      // F2 correction: For interaction events, use the semantic eventId from the
      // payload (e.g. "interaction:presented:${interactionId}") instead of the
      // auto-generated delivery id ("interaction:presented:evt-XXXX"). This ensures
      // the same semantic fact produces the same M9 eventId across normal and
      // recovery publication, enabling idempotent deduplication.
      const deterministicEvent: ActivityEvent = {
        ...activityEvent,
        eventId: this.getSemanticEventId(event, activityEvent),
      };
      await this.store.append(deterministicEvent);
    } catch (err) {
      // I1-6: Failure isolation — log but don't throw
      this.logger?.warn('M9IngestionBridge: ingest failed', {
        eventId: event.id,
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * F2 correction: Derive the M9 eventId.
   * For interaction events, use the stable semantic identity from the payload.
   * For all other events, preserve the existing delivery-based identity.
   */
  private getSemanticEventId(event: VestaraEvent, activityEvent: ActivityEvent): string {
    if (event.type === 'interaction:presented' || event.type === 'interaction:responded') {
      // The adapter puts the semantic eventId (e.g. "interaction:presented:${interactionId}")
      // in the payload. Use it directly for stable deduplication.
      return (event.payload.eventId as string) || `${event.type}:${event.id}`;
    }
    return `${event.type}:${event.id}`;
  }

  /**
   * Map a VestaraEvent to an M9 ActivityEvent using existing adapters (I1-4).
   * Returns null if the event type doesn't match any adapter.
   */
  private mapToActivityEvent(event: VestaraEvent): ActivityEvent | null {
    const type = event.type;

    // ─── Conversation events → fromHumanMessage ────────────
    if (type === 'conversation:created' || type === 'conversation:session.started') {
      const userId = (event.actor?.id as string) || (event.payload.userId as string) || 'local';
      const displayName = (event.payload.userId as string) || 'User';
      return fromHumanMessage({
        message: (event.payload.title as string) || type,
        userId,
        displayName,
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }

    // ─── AI response completed → fromAgentLifecycle ────────
    if (type === 'conversation:response.completed') {
      return fromAgentLifecycle({
        agentId: 'vestara',
        displayName: 'Vestara',
        lifecycleType: 'completed',
        message: event.payload.tokens ? `Generated response (${event.payload.tokens} tokens)` : 'Generated response',
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }

    // ─── Agent lifecycle → fromAgentLifecycle ──────────────
    if (type === 'agent:started') {
      return fromAgentLifecycle({
        agentId: (event.payload.agentId as string) || 'unknown',
        displayName: (event.payload.agentId as string) || 'Agent',
        lifecycleType: 'started',
        role: (event.payload.role as string) || undefined,
        modelId: (event.payload.modelId as string) || undefined,
        modelDisplayName: (event.payload.modelDisplayName as string) || undefined,
        providerId: (event.payload.providerId as string) || undefined,
        message: `${(event.payload.modelDisplayName as string) || (event.payload.agentId as string) || 'Agent'} started ${(event.payload.task as string) || 'task'}`,
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }
    if (type === 'agent:completed') {
      return fromAgentLifecycle({
        agentId: (event.payload.agentId as string) || 'unknown',
        displayName: (event.payload.agentId as string) || 'Agent',
        lifecycleType: 'completed',
        role: (event.payload.role as string) || undefined,
        modelId: (event.payload.modelId as string) || undefined,
        modelDisplayName: (event.payload.modelDisplayName as string) || undefined,
        providerId: (event.payload.providerId as string) || undefined,
        message: `${(event.payload.modelDisplayName as string) || (event.payload.agentId as string) || 'Agent'} completed`,
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }

    // ─── Changeset created → fromAgentLifecycle ────────────
    if (type === 'changeset:created') {
      return fromAgentLifecycle({
        agentId: (event.payload.agentId as string) || 'vestara',
        displayName: (event.payload.agentName as string) || 'Vestara',
        lifecycleType: 'completed',
        message: `Created change set with ${event.payload.fileCount ?? 0} file(s)`,
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }

    // ─── Verification → fromAgentLifecycle ─────────────────
    if (type === 'verification:started') {
      return fromAgentLifecycle({
        agentId: (event.payload.agentId as string) || 'verifier',
        displayName: (event.payload.agentName as string) || 'Verifier',
        lifecycleType: 'started',
        message: 'Running verification checks...',
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }
    if (type === 'verification:completed') {
      return fromAgentLifecycle({
        agentId: (event.payload.agentId as string) || 'verifier',
        displayName: (event.payload.agentName as string) || 'Verifier',
        lifecycleType: 'completed',
        message: event.payload.allPassed ? 'All checks passed' : `${event.payload.failedCount ?? 0} check(s) failed`,
        executionId: event.metadata.executionId as any,
        traceId: event.metadata.traceId as any,
      });
    }

    // ─── Orchestration events → generic ActivityEvent ──────
    if (type.startsWith('orchestration.')) {
      const projectId = event.payload.projectId as string | undefined;
      const taskId = event.payload.taskId as string | undefined;
      return {
        eventId: `orch-${event.id}`,
        type: mapOrchestrationType(type),
        timestamp: event.timestamp,
        workflowRunId: projectId as WorkflowRunId | undefined,
        taskId: taskId as any,
        actor: {
          type: 'system',
          id: 'workflow-orchestrator',
          displayName: 'Workflow Orchestrator',
        },
        source: 'workflow-engine',
        payload: {
          message: defaultMessage(type),
        },
      };
    }

    // ─── Plan events → generic ActivityEvent ───────────────
    if (type === 'plan:created' || type === 'plan:approved') {
      return {
        eventId: `plan-${event.id}`,
        type: type === 'plan:created' ? 'workflow.started' : 'workflow.completed',
        timestamp: event.timestamp,
        actor: {
          type: 'human',
          id: (event.actor?.id as string) || 'local',
          displayName: (event.payload.userName as string) || 'User',
        },
        source: 'human-input',
        payload: {
          message:
            type === 'plan:created'
              ? `Created plan: ${event.payload.title || ''}`
              : `Approved plan: ${event.payload.title || ''}`,
        },
      };
    }

    // ─── Changeset applied → generic ActivityEvent ──────────
    if (type === 'changeset:applied') {
      return {
        eventId: `cs-${event.id}`,
        type: 'workflow.completed',
        timestamp: event.timestamp,
        actor: {
          type: 'human',
          id: (event.actor?.id as string) || 'local',
          displayName: 'User',
        },
        source: 'human-input',
        payload: {
          message: 'Applied change set to disk',
        },
      };
    }

    // ─── Interaction events → fromInteractionPresented/Responded ──
    if (type === 'interaction:presented') {
      return fromInteractionPresented({
        eventId: (event.payload.eventId as string) || event.id,
        interactionId: (event.payload.interactionId as string) || 'unknown',
        conversationId: event.payload.conversationId as string | undefined,
        presentingParticipantId:
          (event.payload.presentingParticipantId as string) || (event.actor?.id as string) || 'system',
        presentingParticipantName: (event.payload.presentingParticipantName as string) || 'System',
        createdAt: event.timestamp,
        content: (event.payload.content as string) || '',
        choices:
          (event.payload.choices as readonly {
            readonly choiceId: string;
            readonly label: string;
            readonly description?: string;
          }[]) || [],
      });
    }
    if (type === 'interaction:responded') {
      return fromInteractionResponded({
        eventId: (event.payload.eventId as string) || event.id,
        interactionId: (event.payload.interactionId as string) || 'unknown',
        responseId: (event.payload.responseId as string) || 'unknown',
        selectedChoiceId: (event.payload.selectedChoiceId as string) || 'unknown',
        respondingParticipantId:
          (event.payload.respondingParticipantId as string) || (event.actor?.id as string) || 'local',
        respondingParticipantName: (event.payload.respondingParticipantName as string) || 'User',
        respondedAt: event.timestamp,
        correlationId: event.payload.correlationId as string | undefined,
      });
    }

    // Unknown type — skip
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────

function mapOrchestrationType(type: string): ActivityEvent['type'] {
  // Map orchestration.* to canonical ActivityType
  if (type.includes('task.started') || type.includes('task.runnable')) return 'task.started';
  if (type.includes('task.completed')) return 'task.completed';
  if (type.includes('task.failed')) return 'task.failed';
  if (type.includes('task.blocked')) return 'task.failed';
  if (type.includes('project.completed')) return 'workflow.completed';
  if (type.includes('plan.generated')) return 'workflow.started';
  return 'system.event';
}

function defaultMessage(type: string): string {
  switch (type) {
    case 'orchestration.project.completed':
      return 'Project completed';
    case 'orchestration.task.failed':
      return 'Task failed';
    case 'orchestration.task.blocked':
      return 'Task blocked';
    case 'orchestration.task.approval-requested':
      return 'Approval required';
    case 'orchestration.task.review.decided':
      return 'Task reviewed';
    case 'orchestration.verification.failed':
      return 'Verification failed';
    case 'orchestration.plan.generated':
      return 'Plan generated';
    default:
      return type.replace('orchestration.', '');
  }
}
