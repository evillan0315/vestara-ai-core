/**
 * Orchestration event bridge — projects workflow-orchestrator events into the
 * temporal engineering event store as `orchestration.*` records.
 *
 * The orchestrator is a pure domain package; this bridge is the composition-
 * root adapter that makes its audit stream replayable alongside the existing
 * `harness.*` and `change.*` projections (ADR-121). Every event carries the
 * project as `correlationId` and task/plan ids in the payload. When an event
 * bus is provided, each event is also re-emitted as `orchestration.*` so the
 * Workspace UI surfaces them as toasts and notifications in real time.
 */

import type { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import type { EventBus } from '@vestara/event-bus';
import type { OrchestrationEvent, OrchestrationEventSink } from '@vestara/workflow-orchestrator';

export interface OrchestrationEventBridgeOptions {
  readonly events: SqliteEngineeringEventStore;
  readonly workspaceId: string;
  readonly environmentId?: string;
  readonly eventBus?: EventBus;
}

type FlatOrchestrationEvent = {
  readonly type: string;
  readonly taskId?: string;
  readonly planId?: string;
  readonly projectId?: string;
};

function flat(event: OrchestrationEvent): FlatOrchestrationEvent {
  return event as unknown as FlatOrchestrationEvent;
}

function eventTaskId(event: OrchestrationEvent): string | undefined {
  const e = flat(event);
  return e.type.startsWith('task.') || e.type.startsWith('file.lock.') ? e.taskId : undefined;
}

function eventPlanId(event: OrchestrationEvent): string | undefined {
  const e = flat(event);
  return e.type.startsWith('plan.') ||
    e.type.startsWith('task.') ||
    e.type === 'architecture.reviewed' ||
    e.type === 'verification.passed' ||
    e.type === 'verification.failed'
    ? e.planId
    : undefined;
}

export class OrchestrationEventBridge implements OrchestrationEventSink {
  private readonly events: SqliteEngineeringEventStore;
  private readonly workspaceId: string;
  private readonly environmentId?: string;
  private readonly eventBus?: EventBus;

  constructor(options: OrchestrationEventBridgeOptions) {
    this.events = options.events;
    this.workspaceId = options.workspaceId;
    this.environmentId = options.environmentId;
    this.eventBus = options.eventBus;
  }

  async append(event: OrchestrationEvent): Promise<void> {
    const type = `orchestration.${event.type}`;
    await this.events.append({
      type,
      source: 'workflow-orchestrator',
      actorId: 'orchestrator',
      authority: 'system',
      workspaceId: this.workspaceId,
      environmentId: this.environmentId,
      taskId: eventTaskId(event),
      correlationId: String(event.projectId),
      payload: { ...(event as unknown as Record<string, unknown>), planId: eventPlanId(event) },
    });
    if (this.eventBus) {
      await this.eventBus
        .emit({
          type,
          source: 'workflow-orchestrator',
          actor: { id: 'orchestrator', role: 'system' },
          payload: { message: defaultMessage(type), ...(event as unknown as Record<string, unknown>) },
        })
        .catch(() => {});
    }
  }
}

function defaultMessage(type: string): string {
  switch (type) {
    case 'orchestration.project.completed':
      return 'Project completed';
    case 'orchestration.task.failed':
      return 'Task failed';
    case 'orchestration.task.blocked':
      return 'Task blocked';
    case 'orchestration.verification.failed':
      return 'Verification failed';
    case 'orchestration.plan.generated':
      return 'Plan generated';
    default:
      return type.replace('orchestration.', '');
  }
}
