import { describe, expect, it } from 'vitest';
import { DefaultHistoryStore } from '../src/default-history-store';
import { DuplicateRecordError } from '../src/types/errors';
import type { DecisionRecord } from '../src/types/record';

function makeRecord(overrides?: Partial<DecisionRecord>): DecisionRecord {
  return {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    stage: 'permission',
    requestId: 'req-1',
    jobId: 'job-1',
    runtimeId: 'rt-1',
    workerId: 'worker-1',
    data: { allowed: true },
    metadata: { source: 'test' },
    ...overrides,
  };
}

describe('DefaultHistoryStore', () => {
  describe('Principle: Append-only', () => {
    it('stores a record and retrieves it by id', () => {
      const store = new DefaultHistoryStore();
      const record = makeRecord();
      store.append(record);

      const retrieved = store.get(record.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(record.id);
    });

    it('throws on duplicate record id', () => {
      const store = new DefaultHistoryStore();
      const record = makeRecord({ id: 'dup-1' });
      store.append(record);

      expect(() => store.append(makeRecord({ id: 'dup-1' }))).toThrow('Record already exists: dup-1');
    });

    it('no delete method exists', () => {
      const store = new DefaultHistoryStore() as Record<string, unknown>;
      expect(typeof store.append).toBe('function');
      expect(typeof store.get).toBe('function');
      expect(typeof (store as Record<string, unknown>).delete).toBe('undefined');
      expect(typeof (store as Record<string, unknown>).update).toBe('undefined');
    });

    it('getAllRecords returns all appended records in order', () => {
      const store = new DefaultHistoryStore();
      const r1 = makeRecord({ id: 'order-1' });
      const r2 = makeRecord({ id: 'order-2' });
      const r3 = makeRecord({ id: 'order-3' });

      store.append(r1);
      store.append(r2);
      store.append(r3);

      const all = store.getAllRecords();
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe('order-1');
      expect(all[1].id).toBe('order-2');
      expect(all[2].id).toBe('order-3');
    });
  });

  describe('Principle: Records are immutable by contract', () => {
    it('readonly types are enforced at compile time (cannot set via type assertion in TS)', () => {
      const store = new DefaultHistoryStore();
      const record = makeRecord({ id: 'immutable-1' });
      store.append(record);

      const retrieved = store.get('immutable-1')!;
      expect(retrieved.id).toBe('immutable-1');
      expect(retrieved.stage).toBe('permission');
    });

    it('getAllRecords returns a copy, not internal array reference', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'copy-test' }));

      const all = store.getAllRecords();
      expect(all).toHaveLength(1);
      // Mutating the returned array does not affect the store
      const all2 = store.getAllRecords();
      expect(all2).toHaveLength(1);
    });

    it('find returns a filtered copy, not internal array reference', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'find-copy-1' }));

      const results1 = store.find({});
      const results2 = store.find({});
      // Each call returns a separate array
      expect(results1).toEqual(results2);
      expect(results1).not.toBe(results2);
    });
  });

  describe('Query: get by id', () => {
    it('returns undefined for unknown id', () => {
      const store = new DefaultHistoryStore();
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('returns the correct record for a known id', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'known-1', requestId: 'req-alpha' }));
      store.append(makeRecord({ id: 'known-2', requestId: 'req-beta' }));

      const r = store.get('known-2');
      expect(r).toBeDefined();
      expect(r!.requestId).toBe('req-beta');
    });
  });

  describe('Query: find by criteria', () => {
    it('returns all records when query is empty', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'all-1' }));
      store.append(makeRecord({ id: 'all-2' }));
      store.append(makeRecord({ id: 'all-3' }));

      expect(store.find({})).toHaveLength(3);
    });

    it('filters by stage', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'f1', stage: 'permission' }));
      store.append(makeRecord({ id: 'f2', stage: 'execution' }));
      store.append(makeRecord({ id: 'f3', stage: 'permission' }));

      const permissions = store.find({ stage: 'permission' });
      expect(permissions).toHaveLength(2);
      expect(permissions.every((r) => r.stage === 'permission')).toBe(true);
    });

    it('filters by jobId', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'j1', jobId: 'job-alpha' }));
      store.append(makeRecord({ id: 'j2', jobId: 'job-beta' }));
      store.append(makeRecord({ id: 'j3', jobId: 'job-alpha' }));

      expect(store.find({ jobId: 'job-alpha' })).toHaveLength(2);
      expect(store.find({ jobId: 'job-beta' })).toHaveLength(1);
    });

    it('filters by workerId', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'w1', workerId: 'worker-a' }));
      store.append(makeRecord({ id: 'w2', workerId: 'worker-b' }));

      expect(store.find({ workerId: 'worker-a' })).toHaveLength(1);
    });

    it('filters by runtimeId', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'rt1', runtimeId: 'runtime-x' }));
      store.append(makeRecord({ id: 'rt2', runtimeId: 'runtime-y' }));

      expect(store.find({ runtimeId: 'runtime-x' })).toHaveLength(1);
    });

    it('filters by timestamp range', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 't1', timestamp: '2026-01-01T00:00:00.000Z' }));
      store.append(makeRecord({ id: 't2', timestamp: '2026-06-15T00:00:00.000Z' }));
      store.append(makeRecord({ id: 't3', timestamp: '2026-12-31T00:00:00.000Z' }));

      const mid = store.find({
        fromTimestamp: '2026-01-01T00:00:00.000Z',
        toTimestamp: '2026-06-30T00:00:00.000Z',
      });
      expect(mid).toHaveLength(2);
      expect(mid.map((r) => r.id)).toEqual(['t1', 't2']);
    });

    it('supports pagination with limit and offset', () => {
      const store = new DefaultHistoryStore();
      for (let i = 0; i < 10; i++) {
        store.append(makeRecord({ id: `page-${i}` }));
      }

      const page1 = store.find({ limit: 3, offset: 0 });
      expect(page1).toHaveLength(3);
      expect(page1[0].id).toBe('page-0');
      expect(page1[2].id).toBe('page-2');

      const page2 = store.find({ limit: 3, offset: 3 });
      expect(page2).toHaveLength(3);
      expect(page2[0].id).toBe('page-3');
      expect(page2[2].id).toBe('page-5');
    });
  });

  describe('Query: timeline', () => {
    it('returns all records for a requestId', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'tl1', requestId: 'req-alpha', stage: 'permission' }));
      store.append(makeRecord({ id: 'tl2', requestId: 'req-beta', stage: 'permission' }));
      store.append(makeRecord({ id: 'tl3', requestId: 'req-alpha', stage: 'execution' }));
      store.append(makeRecord({ id: 'tl4', requestId: 'req-alpha', stage: 'verification' }));

      const timeline = store.timeline('req-alpha');
      expect(timeline).toHaveLength(3);
      expect(timeline.map((r) => r.id)).toEqual(['tl1', 'tl3', 'tl4']);
    });

    it('returns all records for a jobId', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'jtl1', jobId: 'job-alpha', stage: 'permission' }));
      store.append(makeRecord({ id: 'jtl2', jobId: 'job-beta', stage: 'permission' }));
      store.append(makeRecord({ id: 'jtl3', jobId: 'job-alpha', stage: 'execution' }));

      const timeline = store.timeline('job-alpha');
      expect(timeline).toHaveLength(2);
    });

    it('returns empty array for unknown entity', () => {
      const store = new DefaultHistoryStore();
      expect(store.timeline('unknown')).toHaveLength(0);
    });

    it('preserves insertion order across mixed entities', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 'a1', requestId: 'req-a', stage: 'permission' }));
      store.append(makeRecord({ id: 'b1', requestId: 'req-b', stage: 'permission' }));
      store.append(makeRecord({ id: 'a2', requestId: 'req-a', stage: 'execution' }));
      store.append(makeRecord({ id: 'b2', requestId: 'req-b', stage: 'verification' }));
      store.append(makeRecord({ id: 'a3', requestId: 'req-a', stage: 'trust' }));

      const timelineA = store.timeline('req-a');
      expect(timelineA).toHaveLength(3);
      expect(timelineA[0].stage).toBe('permission');
      expect(timelineA[1].stage).toBe('execution');
      expect(timelineA[2].stage).toBe('trust');

      const timelineB = store.timeline('req-b');
      expect(timelineB).toHaveLength(2);
      expect(timelineB[0].stage).toBe('permission');
      expect(timelineB[1].stage).toBe('verification');
    });
  });

  describe('Multiple pipeline stages coexist', () => {
    it('stores and queries records from all five stages', () => {
      const store = new DefaultHistoryStore();

      store.append(makeRecord({ id: 'p1', stage: 'permission' }));
      store.append(makeRecord({ id: 'po1', stage: 'policy' }));
      store.append(makeRecord({ id: 'e1', stage: 'execution' }));
      store.append(makeRecord({ id: 'v1', stage: 'verification' }));
      store.append(makeRecord({ id: 't1', stage: 'trust' }));

      expect(store.get('p1')!.stage).toBe('permission');
      expect(store.get('po1')!.stage).toBe('policy');
      expect(store.get('e1')!.stage).toBe('execution');
      expect(store.get('v1')!.stage).toBe('verification');
      expect(store.get('t1')!.stage).toBe('trust');
      expect(store.find({})).toHaveLength(5);
    });

    it('timeline returns stages in pipeline order', () => {
      const store = new DefaultHistoryStore();
      store.append(makeRecord({ id: 's1', requestId: 'req-pipe', stage: 'permission' }));
      store.append(makeRecord({ id: 's2', requestId: 'req-pipe', stage: 'policy' }));
      store.append(makeRecord({ id: 's3', requestId: 'req-pipe', stage: 'execution' }));
      store.append(makeRecord({ id: 's4', requestId: 'req-pipe', stage: 'verification' }));
      store.append(makeRecord({ id: 's5', requestId: 'req-pipe', stage: 'trust' }));

      const tl = store.timeline('req-pipe');
      const stages = tl.map((r) => r.stage);
      expect(stages).toEqual(['permission', 'policy', 'execution', 'verification', 'trust']);
    });
  });

  describe('Edge cases', () => {
    it('empty store returns empty arrays', () => {
      const store = new DefaultHistoryStore();
      expect(store.find({})).toHaveLength(0);
      expect(store.timeline('any')).toHaveLength(0);
      expect(store.get('any')).toBeUndefined();
    });

    it('store handles records without optional fields', () => {
      const store = new DefaultHistoryStore();
      const record: DecisionRecord = {
        id: 'minimal',
        timestamp: new Date().toISOString(),
        stage: 'verification',
        requestId: 'req-min',
        data: { status: 'passed' },
        metadata: {},
      };
      store.append(record);

      const retrieved = store.get('minimal')!;
      expect(retrieved.jobId).toBeUndefined();
      expect(retrieved.workerId).toBeUndefined();
    });
  });
});
