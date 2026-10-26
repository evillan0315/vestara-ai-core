import { describe, expect, it } from 'vitest';
import { createCICorrelationRecord, deriveCorrelationId, InMemoryCICorrelationStore } from '../src/correlation';

const input = {
  repository: 'acme/app',
  commitSha: 'abc123',
  branch: 'main',
  originatingWorkflowRunId: 'w1',
  originatingTaskId: 't1',
  originatingOperationId: 'op1',
};

describe('CI correlation contract', () => {
  it('derives deterministic correlation ids and validates inputs', () => {
    expect(deriveCorrelationId('acme/app', 'abc123', 't1')).toBe('ci-corr:acme/app:abc123:t1');
    expect(createCICorrelationRecord(input).correlationId).toBe('ci-corr:acme/app:abc123:t1');
    expect(() => createCICorrelationRecord({ ...input, repository: '  ' })).toThrow();
  });

  it('stores, looks up, and links runs', async () => {
    const store = new InMemoryCICorrelationStore();
    const record = createCICorrelationRecord(input);
    await store.put(record);
    expect(await store.get(record.correlationId)).toMatchObject({ commitSha: 'abc123' });
    expect(await store.findByCommit('acme/app', 'abc123')).toHaveLength(1);
    expect(await store.findByCommit('acme/app', 'nope')).toHaveLength(0);
    const linked = await store.attachRunId(record.correlationId, 'run-9');
    expect(linked?.workflowRunId).toBe('run-9');
    expect(await store.attachRunId('missing', 'run-9')).toBeUndefined();
  });
});
