/**
 * AR-STREAM-ORDER-001 — bounded, ordered live delivery.
 *
 * These cases exercise ActivityStreamConnection itself. The same connection
 * receives live and catch-up records, so ordering and overlap dedupe stay at
 * the transport boundary rather than in a second presentation helper.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ActivityRecord } from '../src/contracts';
import { ActivityStreamConnection } from '../src/stream';

function record(sequence: number): ActivityRecord {
  return {
    id: `activity-${sequence}`,
    kind: 'workflow',
    workflowId: 'workflow-1' as ActivityRecord['workflowId'],
    previousState: sequence === 1 ? 'pending' : 'running',
    currentState: 'running',
    reason: `step ${sequence}`,
    authoritative: true,
    observed: false,
    sequence,
    timestamp: new Date(Date.UTC(2026, 8, 24, 0, 0, sequence)).toISOString(),
    actor: { type: 'system', id: 'workflow', displayName: 'Workflow' },
    source: 'workflow-engine',
    payload: {},
    visibility: 'workspace',
  } as unknown as ActivityRecord;
}

function connection(afterSequence = 0, bufferCapacity = 128) {
  const messages: Array<{ type: string; sequence?: number }> = [];
  const onResync = vi.fn();
  const stream = new ActivityStreamConnection({
    id: 'test-connection',
    afterSequence,
    bufferCapacity,
    sink: {
      send: (message) =>
        messages.push({ type: message.type, sequence: 'sequence' in message ? message.sequence : undefined }),
    },
    onResync,
  });
  return { stream, messages, onResync };
}

function delivered(messages: readonly { type: string; sequence?: number }[]): number[] {
  return messages.filter((message) => message.type === 'activity.appended').map((message) => message.sequence!);
}

describe('AR-STREAM-ORDER-001: bounded ordered stream delivery', () => {
  it.each([
    { name: 'ordered delivery', input: [3, 4, 5], expected: [3, 4, 5] },
    { name: 'out-of-order batch', input: [5, 3, 4], expected: [3, 4, 5] },
    { name: 'gap closes later', input: [3, 5, 4], expected: [3, 4, 5] },
  ])('$name', ({ input, expected }) => {
    const { stream, messages } = connection(2);
    for (const sequence of input) stream.deliver(record(sequence));
    expect(delivered(messages)).toEqual(expected);
    expect(stream.lastDeliveredSequence).toBe(5);
  });

  it('delivers one record per sequence when a duplicate is buffered', () => {
    const { stream, messages } = connection(2);
    expect(stream.deliver(record(3))).toBe('delivered');
    expect(stream.deliver(record(3))).toBe('duplicate');
    expect(stream.deliver(record(4))).toBe('delivered');
    expect(delivered(messages)).toEqual([3, 4]);
  });

  it('does not advance past a missing sequence', () => {
    const { stream, messages } = connection(3);
    expect(stream.deliver(record(5))).toBe('held');
    expect(delivered(messages)).toEqual([]);
    expect(stream.lastDeliveredSequence).toBe(3);
    expect(stream.needsResync).toBe(false);
  });

  it('requests explicit resync when the unresolved gap exceeds capacity', () => {
    const { stream, messages, onResync } = connection(2, 2);
    expect(stream.deliver(record(5))).toBe('held');
    expect(stream.deliver(record(6))).toBe('held');
    expect(stream.deliver(record(7))).toBe('resync');
    expect(onResync).toHaveBeenCalledWith(stream);
    expect(stream.needsResync).toBe(true);
    expect(delivered(messages)).toEqual([]);
  });

  it('deduplicates catch-up records that overlap live delivery', () => {
    const { stream, messages } = connection(2);
    stream.deliver(record(4));
    stream.deliver(record(3));
    stream.deliver(record(4));
    stream.deliver(record(5));
    expect(delivered(messages)).toEqual([3, 4, 5]);
  });
});
