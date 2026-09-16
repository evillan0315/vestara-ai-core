import { describe, expect, it } from 'vitest';
import { createCICorrelationRecord, deriveCorrelationId, InMemoryCICorrelationStore } from '../src/correlation';

const base = {
  repository: 'evillan0315/vestara-ai-core',
  commitSha: '598d416bd5998f375f70e43bae81cc8405633006',
  branch: 'main',
  originatingWorkflowRunId: 'wf-run-1',
  originatingTaskId: 'task-1',
  originatingOperationId: 'op-1',
};

describe('CICorrelationRecord', () => {
  it('derives a deterministic correlation id from repository/commit/task', () => {
    const id = deriveCorrelationId(base.repository, base.commitSha, base.originatingTaskId);
    expect(id).toBe(`ci-corr:${base.repository}:${base.commitSha}:${base.originatingTaskId}`);
    const record = createCICorrelationRecord({ ...base, createdAt: '2026-09-16T00:00:00.000Z' });
    expect(record.correlationId).toBe(id);
    expect(record.createdAt).toBe('2026-09-16T00:00:00.000Z');
  });

  it('omits run identity until it is observed (never invented at push time)', () => {
    const record = createCICorrelationRecord(base);
    expect(record.workflowRunId).toBeUndefined();
    expect(record.workflowName).toBeUndefined();
  });

  it('rejects incomplete governed-push inputs', () => {
    expect(() => createCICorrelationRecord({ ...base, repository: ' ' })).toThrow();
    expect(() => createCICorrelationRecord({ ...base, commitSha: '' })).toThrow();
    expect(() => createCICorrelationRecord({ ...base, originatingTaskId: '' })).toThrow();
  });
});

describe('InMemoryCICorrelationStore', () => {
  it('stores, retrieves, and finds by commit and by run id', async () => {
    const store = new InMemoryCICorrelationStore();
    const record = createCICorrelationRecord(base);
    await store.put(record);

    expect(await store.get(record.correlationId)).toEqual(record);
    expect(await store.findByCommit(base.repository, base.commitSha)).toEqual([record]);
    expect(await store.findByRunId('run-xyz')).toEqual([]);

    const attached = await store.attachRunId(record.correlationId, 'run-xyz');
    expect(attached?.workflowRunId).toBe('run-xyz');
    expect(await store.findByRunId('run-xyz')).toHaveLength(1);
  });

  it('returns undefined when attaching to an unknown correlation', async () => {
    const store = new InMemoryCICorrelationStore();
    expect(await store.attachRunId('missing', 'run-1')).toBeUndefined();
  });
});
