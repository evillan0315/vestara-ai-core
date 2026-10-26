import { describe, expect, it } from 'vitest';
import { DefaultHistoryStore } from '../src/default-history-store';
import type { DecisionRecord } from '../src/types';

function record(id: string): DecisionRecord {
  return {
    id,
    timestamp: new Date().toISOString(),
    stage: 'policy',
    requestId: 'req-1',
    data: {},
    metadata: {},
  } as DecisionRecord;
}

describe('DefaultHistoryStore contract', () => {
  it('appends, gets, and queries records; rejects duplicates', () => {
    const store = new DefaultHistoryStore();
    store.append(record('r1'));
    expect(store.get('r1')?.id).toBe('r1');
    expect(store.find({ stage: 'policy' })).toHaveLength(1);
    expect(store.find({ stage: 'trust' })).toHaveLength(0);
    expect(() => store.append(record('r1'))).toThrow();
  });
});
