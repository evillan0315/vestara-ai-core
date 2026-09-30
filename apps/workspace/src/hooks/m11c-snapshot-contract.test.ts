import { describe, expect, it } from 'vitest';
import { mergeActivityItems, snapshotCompletionMessage, snapshotStreamItems } from './useM11CActivityRoom';
import type { M11ASnapshot } from '../lib/m11a-api';

const parent = {
  streamItemId: 'si-parent',
  activityId: 'act-parent',
  sequenceNumber: 3,
  kind: 'activity',
  importance: 'secondary' as const,
  actor: { type: 'agent', id: 'agent-a', displayName: 'Agent A' },
  content: 'Completed',
  timestamp: '2026-09-26T00:00:03.000Z',
};

function snapshot(complete: boolean): Pick<M11ASnapshot, 'entities' | 'stream'> & { complete: boolean } {
  return {
    complete,
    entities: [{
      parent,
      lineageKey: 'conversation:conv-a',
      operations: [{
        operationId: 'call-1',
        toolName: 'bash',
        status: 'completed',
        timestamp: '2026-09-26T00:00:02.000Z',
        activityIds: ['act-tool-called', 'act-tool-result'],
        conversationId: 'conv-a',
      }],
    }],
    stream: [],
  };
}

describe('M11A snapshot completeness and entity contract', () => {
  it('normalizes M11A newest-first entities to ascending display order', () => {
    const items = snapshotStreamItems({
      entities: [
        { parent: { ...parent, sequenceNumber: 5 }, lineageKey: null, operations: [] },
        { parent: { ...parent, sequenceNumber: 2 }, lineageKey: null, operations: [] },
      ],
      stream: [],
    });

    expect(items.map((item) => item.sequence)).toEqual([2, 5]);
  });

  it('keeps live additions ascending and renders earlier Started before later Completed', () => {
    const started = { ...parent, id: 'started', sequence: 10, content: 'Started', fresh: false };
    const completed = { ...parent, id: 'completed', sequence: 12, content: 'Completed', fresh: false };

    expect(mergeActivityItems([completed], [started]).map((item) => item.content)).toEqual(['Started', 'Completed']);
  });

  it('consumes the server-established parent/operation relationship', () => {
    const items = snapshotStreamItems(snapshot(true));
    expect(items).toHaveLength(1);
    expect(items[0]?.session?.operations).toHaveLength(1);
    expect(items[0]?.session?.operations[0]?.activityIds).toEqual(['act-tool-called', 'act-tool-result']);
  });

  it('makes incomplete reconstruction actionable to the consumer', () => {
    expect(snapshotCompletionMessage(true)).toBeUndefined();
    expect(snapshotCompletionMessage(false)).toBe('Activity snapshot incomplete; load older history to continue.');
  });
});
