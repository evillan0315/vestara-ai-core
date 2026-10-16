/**
 * WFO-E2E recording sinks.
 *
 * The orchestrator event sink is decorated with a monotonic sequence and a
 * deterministic timestamp so ordering and replay assertions are stable.
 */

import type { OrchestrationEvent, OrchestrationEventSink, OrchestrationTelemetry } from '../../src/types';
import type { DeterministicWorkflowClock } from './clock';

export interface RecordedWorkflowEvent {
  readonly sequence: number;
  readonly event: OrchestrationEvent;
  readonly at: string;
}

export class RecordingEventSink implements OrchestrationEventSink {
  private readonly recorded: RecordedWorkflowEvent[] = [];

  constructor(private readonly clock: DeterministicWorkflowClock) {}

  append(event: OrchestrationEvent): void {
    this.recorded.push({ sequence: this.recorded.length + 1, event, at: this.clock.now() });
  }

  events(): readonly RecordedWorkflowEvent[] {
    return this.recorded;
  }

  types(): readonly string[] {
    return this.recorded.map((record) => record.event.type);
  }

  /** Event types emitted for a project, in order. */
  typesFor(projectId: string): readonly string[] {
    return this.recorded.filter((record) => record.event.projectId === projectId).map((record) => record.event.type);
  }
}

export class RecordingTelemetrySink {
  private readonly ops: OrchestrationTelemetry[] = [];

  onTelemetry(op: OrchestrationTelemetry): void {
    this.ops.push(op);
  }

  operations(): readonly OrchestrationTelemetry[] {
    return this.ops;
  }

  count(operation: string): number {
    return this.ops.filter((op) => op.operation === operation).length;
  }
}
