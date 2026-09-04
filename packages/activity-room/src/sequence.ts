import type { ActivityRecord } from './contracts';

/**
 * Allocates strictly increasing, gap-free sequence numbers. Sequence order is
 * the primary ordering key for the activity stream; timestamps are secondary.
 */
export class MonotonicSequence {
  private next: number;

  constructor(start = 1) {
    this.next = Math.max(1, Math.floor(start));
  }

  allocate(): number {
    const value = this.next;
    this.next += 1;
    return value;
  }

  /** The next value that will be allocated without consuming it. */
  peek(): number {
    return this.next;
  }

  static fromRecords(records: readonly Pick<ActivityRecord, 'sequence'>[]): MonotonicSequence {
    let max = 0;
    for (const record of records) {
      if (record.sequence > max) max = record.sequence;
    }
    return new MonotonicSequence(max + 1);
  }
}
