import { describe, expect, it } from 'vitest';
import { CIVerificationService } from '../src/completion';
import { createCICorrelationRecord } from '../src/correlation';
import { SqliteCICorrelationStore } from '../src/sqlite-correlation-store';
import { SqliteCITaskGate } from '../src/sqlite-task-gate';
import { createDb, restart } from './db';
import { buildAndTestJob, COMMIT, desktopBuildJob, REPO, RUN_ID, workflowRun } from './fixtures';

const base = {
  repository: REPO,
  commitSha: COMMIT,
  branch: 'main',
  originatingWorkflowRunId: 'wf-run-598',
  originatingTaskId: 'task-598',
  originatingOperationId: 'op-push-598',
};

describe('SqliteCICorrelationStore (durable)', () => {
  it('persists correlations across a restart', async () => {
    let db = await createDb();
    let store = new SqliteCICorrelationStore(db);
    const record = createCICorrelationRecord({ ...base, createdAt: '2026-09-16T00:00:00.000Z' });
    await store.put(record);

    db = await restart(db);
    store = new SqliteCICorrelationStore(db);
    expect(await store.get(record.correlationId)).toEqual(record);
    expect(await store.findByCommit(REPO, COMMIT)).toHaveLength(1);
  });

  it('is idempotent on the deterministic correlation id', async () => {
    const db = await createDb();
    const store = new SqliteCICorrelationStore(db);
    const record = createCICorrelationRecord(base);
    await store.put(record);
    await store.put(record);
    await store.put({ ...record, branch: 'main' });
    expect(await store.findByCommit(REPO, COMMIT)).toHaveLength(1);
  });

  it('attaches the run id once and survives restart', async () => {
    let db = await createDb();
    let store = new SqliteCICorrelationStore(db);
    const record = createCICorrelationRecord(base);
    await store.put(record);

    await store.attachRunId(record.correlationId, 'first');
    await store.attachRunId(record.correlationId, 'second');
    expect((await store.get(record.correlationId))?.workflowRunId).toBe('first');

    db = await restart(db);
    store = new SqliteCICorrelationStore(db);
    expect(await store.findByRunId('first')).toHaveLength(1);
  });
});

describe('SqliteCITaskGate (durable, exactly-once resume)', () => {
  it('suspends running → waiting and survives restart', async () => {
    let db = await createDb();
    let gate = new SqliteCITaskGate(db);
    await gate.suspend({ taskId: 'task-598', correlationId: 'c1', currentStatus: 'running' });

    db = await restart(db);
    gate = new SqliteCITaskGate(db);
    expect((await gate.getWait('c1'))?.status).toBe('waiting');
    expect(await gate.getStatus('task-598')).toBe('waiting');
  });

  it('resumes waiting → running after restart, exactly once', async () => {
    let db = await createDb();
    let gate = new SqliteCITaskGate(db);
    await gate.suspend({ taskId: 'task-598', correlationId: 'c1', currentStatus: 'running' });

    db = await restart(db);
    gate = new SqliteCITaskGate(db);
    const first = await gate.resume({ correlationId: 'c1', decisionRef: 'obs-1:HOLD' });
    expect(first).toMatchObject({ from: 'waiting', status: 'running', decisionRef: 'obs-1:HOLD' });
    expect(await gate.getWait('c1')).toBeUndefined();
    expect(await gate.getStatus('task-598')).toBe('running');

    // Retry/replay must not create a second resume.
    const retry = await gate.resume({ correlationId: 'c1', decisionRef: 'obs-1:HOLD' });
    expect(retry.resumedAt).toBe(first.resumedAt);
    expect(retry.decisionRef).toBe(first.decisionRef);
  });

  it('rejects missing correlation and non-running suspension', async () => {
    const db = await createDb();
    const gate = new SqliteCITaskGate(db);
    await expect(gate.resume({ correlationId: 'nope', decisionRef: 'x' })).rejects.toThrow(/no wait registered/);
    await expect(gate.suspend({ taskId: 't', correlationId: 'c', currentStatus: 'runnable' })).rejects.toThrow(
      /expected running/,
    );
  });
});

describe('CI completion service — durable restart + retry idempotency', () => {
  it('runs running → waiting → restart → webhook → waiting → running without duplicate resume', async () => {
    let db = await createDb();
    let correlations = new SqliteCICorrelationStore(db);
    let gate = new SqliteCITaskGate(db);
    let service = new CIVerificationService({ correlations, gate });

    // Governed push: persist correlation + suspend the real task record.
    const { correlation, wait } = await service.registerGovernedPush(base);
    expect(wait.status).toBe('waiting');

    // Process restart.
    db = await restart(db);
    correlations = new SqliteCICorrelationStore(db);
    gate = new SqliteCITaskGate(db);
    service = new CIVerificationService({ correlations, gate });

    // Completion arrives after restart; the correlation is restored.
    expect((await correlations.get(correlation.correlationId))?.originatingTaskId).toBe('task-598');
    expect((await gate.getWait(correlation.correlationId))?.status).toBe('waiting');

    const jobs = [
      { job: desktopBuildJob(), steps: desktopBuildJob().steps },
      { job: buildAndTestJob(), steps: buildAndTestJob().steps },
    ];
    const result = await service.handleCompletion({ payload: workflowRun(), jobs });
    expect(result.correlation.workflowRunId).toBe(String(RUN_ID));
    expect(result.observation.conclusion).toBe('failed');
    expect(result.outcome.action).toBe('HOLD');

    const resumed = await service.resumeFromDecision(result);
    expect(resumed.status).toBe('running');
    expect(await gate.getStatus('task-598')).toBe('running');

    // Duplicate webhook delivery: same observation/action, no second resume.
    const replay = await service.handleCompletion({ payload: workflowRun(), jobs });
    const replayResume = await service.resumeFromDecision(replay);
    expect(replayResume.resumedAt).toBe(resumed.resumedAt);
    expect(replayResume.decisionRef).toBe(resumed.decisionRef);
    expect(await gate.getWait(correlation.correlationId)).toBeUndefined();
  });
});
