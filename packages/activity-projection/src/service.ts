import type { ActivityRecord } from './contracts';
import { ActivityProjectorRegistry } from './projector';
import { AgentMessageProjector } from './projectors/agent-message-projector';
import { TaskProjector } from './projectors/task-projector';
import { TestProjector } from './projectors/test-projector';
import { VerificationProjector } from './projectors/verification-projector';
import { WorkflowProjector } from './projectors/workflow-projector';
import { ActivityRedactor } from './redactor';
import { MonotonicSequence } from './sequence';
import type { ActivitySourceEvent } from './source-event';
import { type ActivityStore, DuplicateActivityError } from './store';

export const DEFAULT_PROJECTORS = [
  new WorkflowProjector(),
  new TaskProjector(),
  new AgentMessageProjector(),
  new TestProjector(),
  new VerificationProjector(),
] as const;

export interface ActivityProjectionServiceOptions {
  readonly store: ActivityStore;
  readonly redactor?: ActivityRedactor;
  readonly registry?: ActivityProjectorRegistry;
  readonly sequence?: MonotonicSequence;
  /** When true (default), duplicate source events are ignored instead of failing. */
  readonly skipDuplicates?: boolean;
  /**
   * Invoked strictly after a record is persisted. Wire this to the broadcast
   * hub so an activity that failed to persist is never broadcast.
   */
  readonly onAppended?: (record: ActivityRecord) => void;
}

/**
 * Orchestrates the projection pipeline:
 *
 *   subsystem event → typed projector → redaction → append-only persistence
 *
 * Redaction always runs before persistence so sensitive values never reach the
 * store or any future broadcast.
 */
export class ActivityProjectionService {
  private readonly store: ActivityStore;
  private readonly redactor: ActivityRedactor;
  private readonly registry: ActivityProjectorRegistry;
  private readonly skipDuplicates: boolean;
  private readonly onAppended?: (record: ActivityRecord) => void;
  private readonly externalSequence?: MonotonicSequence;
  private allocator: MonotonicSequence | undefined;

  constructor(options: ActivityProjectionServiceOptions) {
    this.store = options.store;
    this.redactor = options.redactor ?? new ActivityRedactor();
    this.registry = options.registry ?? new ActivityProjectorRegistry(DEFAULT_PROJECTORS);
    this.skipDuplicates = options.skipDuplicates ?? true;
    this.onAppended = options.onAppended;
    this.externalSequence = options.sequence;
  }

  /** Projects a source event into redacted, sequenced activity records and appends them. */
  async project(event: ActivitySourceEvent): Promise<readonly ActivityRecord[]> {
    const candidates = this.registry.projectAll(event);
    const appended: ActivityRecord[] = [];
    for (const candidate of candidates) {
      const redacted = this.redactor.redact(candidate);
      const record = withSequence(redacted, await this.nextSequence());
      try {
        await this.store.append(record);
        appended.push(record);
        this.onAppended?.(record);
      } catch (error) {
        if (!(error instanceof DuplicateActivityError) || !this.skipDuplicates) throw error;
      }
    }
    return appended;
  }

  /**
   * Appends a pre-built record directly (e.g. a human-authored message that has
   * no projector source event), preserving the same redaction → sequence →
   * persist → broadcast pipeline. The record is broadcast only after it
   * persisted.
   */
  async appendActivity(record: ActivityRecord): Promise<ActivityRecord> {
    const redacted = this.redactor.redact(record);
    const sequenced = withSequence(redacted, await this.nextSequence());
    await this.store.append(sequenced);
    this.onAppended?.(sequenced);
    return sequenced;
  }

  private async nextSequence(): Promise<number> {
    if (this.externalSequence !== undefined) return this.externalSequence.allocate();
    if (this.allocator === undefined) {
      this.allocator = new MonotonicSequence((await this.store.lastSequence()) + 1);
    }
    return this.allocator.allocate();
  }
}

/** Replaces the placeholder sequence with the canonical monotonic allocation. */
function withSequence(record: ActivityRecord, sequence: number): ActivityRecord {
  switch (record.kind) {
    case 'workflow':
      return { ...record, sequence };
    case 'task':
      return { ...record, sequence };
    case 'agent-message':
      return { ...record, sequence };
    case 'test':
      return { ...record, sequence };
    case 'verification':
      return { ...record, sequence };
  }
}
