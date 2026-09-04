import type { ActivityRecord } from '@vestara/activity-room';
import { MonotonicSequence } from '@vestara/activity-room';
import { describe, expect, it } from 'vitest';

describe('MonotonicSequence', () => {
  it('allocates strictly increasing values starting at 1', () => {
    const sequence = new MonotonicSequence();
    expect(sequence.allocate()).toBe(1);
    expect(sequence.allocate()).toBe(2);
    expect(sequence.allocate()).toBe(3);
  });

  it('respects a custom start value', () => {
    const sequence = new MonotonicSequence(41);
    expect(sequence.allocate()).toBe(41);
    expect(sequence.allocate()).toBe(42);
  });

  it('peek returns the next value without consuming it', () => {
    const sequence = new MonotonicSequence();
    expect(sequence.peek()).toBe(1);
    expect(sequence.peek()).toBe(1);
    expect(sequence.allocate()).toBe(1);
    expect(sequence.peek()).toBe(2);
  });

  it('seeds from the maximum existing record sequence', () => {
    const records = [{ sequence: 5 }, { sequence: 2 }, { sequence: 9 }] as unknown as readonly Pick<
      ActivityRecord,
      'sequence'
    >[];
    const sequence = MonotonicSequence.fromRecords(records);
    expect(sequence.allocate()).toBe(10);
  });

  it('never allocates below 1 for empty record sets', () => {
    expect(MonotonicSequence.fromRecords([]).allocate()).toBe(1);
  });
});
