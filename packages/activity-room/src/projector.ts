import type { ActivityKind, ActivityRecord } from './contracts';
import type { ActivitySourceEvent } from './source-event';

/**
 * A subsystem adapter that normalizes one family of source events into typed
 * activity records. Projectors are pure: they never persist, broadcast, or read
 * state. Multiple projectors may support the same source event, each producing
 * a different activity kind.
 */
export interface ActivityProjector<TEvent extends ActivitySourceEvent = ActivitySourceEvent> {
  readonly kind: ActivityKind;
  supports(event: TEvent): boolean;
  project(event: TEvent): readonly ActivityRecord[];
}

/** Registry that routes a source event to every supporting projector. */
export class ActivityProjectorRegistry {
  private readonly projectors: ActivityProjector[] = [];

  constructor(projectors: readonly ActivityProjector[] = []) {
    for (const projector of projectors) this.projectors.push(projector);
  }

  register(projector: ActivityProjector): this {
    this.projectors.push(projector);
    return this;
  }

  get size(): number {
    return this.projectors.length;
  }

  findFor(event: ActivitySourceEvent): readonly ActivityProjector[] {
    return this.projectors.filter((projector) => projector.supports(event));
  }

  projectAll(event: ActivitySourceEvent): readonly ActivityRecord[] {
    const records: ActivityRecord[] = [];
    for (const projector of this.findFor(event)) {
      records.push(...projector.project(event));
    }
    return records;
  }
}
