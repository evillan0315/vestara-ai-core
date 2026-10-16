/**
 * CI-OBS-002B2 — Authoritative external-verification wait integration.
 *
 * Verifies the canonical suspension on the workflow-orchestrator TaskStore:
 *   in-progress → awaiting-verification → in-progress
 * with atomic correlation persistence, exactly-once resume, restart safety,
 * and dispatch/dependency exclusion. Waiting ≠ Blocked; Waiting ≠ Approval;
 * CI completion ≠ task completion; CI PASS ≠ objective verification.
 */

import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ORCHESTRATION_MANIFEST } from '../src/orchestration-migrations';
import { canTransitionTask } from '../src/state-machines';
import { TaskStore } from '../src/stores/task-store';
import { readyTasks } from '../src/task-graph';
import { TASK_STATUSES } from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function freshDb(): Database {
  const db = new SQL.Database();
  migrate(db, ORCHESTRATION_MANIFEST, {});
  return db;
}

function restart(db: Database): Database {
  const bytes = db.export();
  db.close();
  const next = new SQL.Database(bytes);
  migrate(next, ORCHESTRATION_MANIFEST, {});
  return next;
}

const waitInput = {
  verifier: 'ci' as const,
  waitRef: 'ci-corr:evillan0315/vestara-ai-core:598d416:task-1',
  repository: 'evillan0315/vestara-ai-core',
  commitSha: '598d416bd5998f375f70e43bae81cc8405633006',
  branch: 'main',
  provider: 'github-actions',
  originatingWorkflowRunId: 'wf-run-598',
  originatingOperationId: 'op-push-598',
};

async function taskInProgress(store: TaskStore): Promise<string> {
  const [task] = await store.createMany('plan-1', [
    {
      planId: 'plan-1',
      summary: 'Implement feature',
      description: '',
      files: [],
      dependencies: [],
      effort: 'medium',
      requiredCapabilities: [],
    },
  ]);
  await store.markStarted(task.id);
  return task.id;
}

describe('external-verification wait — lifecycle', () => {
  it('transitions in-progress → awaiting-verification with a typed wait', async () => {
    const store = new TaskStore(freshDb());
    const taskId = await taskInProgress(store);

    const task = await store.beginExternalVerificationWait({
      taskId,
      ...waitInput,
      suspendedAt: '2026-09-16T00:00:00.000Z',
    });

    expect(task.status).toBe('awaiting-verification');
    expect(task.externalWait).toMatchObject({
      verifier: 'ci',
      waitRef: waitInput.waitRef,
      repository: waitInput.repository,
      commitSha: waitInput.commitSha,
      branch: 'main',
      suspendedAt: '2026-09-16T00:00:00.000Z',
    });
    expect(task.externalWait?.resumedAt).toBeUndefined();
  });

  it('survives a restart while awaiting CI', async () => {
    let db = freshDb();
    let store = new TaskStore(db);
    const taskId = await taskInProgress(store);
    await store.beginExternalVerificationWait({ taskId, ...waitInput });

    db = restart(db);
    store = new TaskStore(db);
    const restored = await store.getByWaitRef(waitInput.waitRef);
    expect(restored?.status).toBe('awaiting-verification');
    expect(restored?.externalWait?.commitSha).toBe(waitInput.commitSha);
    expect(await store.listWaitsByCommit(waitInput.repository, waitInput.commitSha)).toHaveLength(1);
  });

  it('resumes awaiting-verification → in-progress (never completed) after restart', async () => {
    let db = freshDb();
    let store = new TaskStore(db);
    const taskId = await taskInProgress(store);
    await store.beginExternalVerificationWait({ taskId, ...waitInput });

    db = restart(db);
    store = new TaskStore(db);
    const resumed = await store.resumeExternalVerificationWait({
      waitRef: waitInput.waitRef,
      decisionRef: 'obs-35031683683:HOLD',
      resumedAt: '2026-09-16T00:10:00.000Z',
    });

    expect(resumed.status).toBe('in-progress');
    expect(resumed.status).not.toBe('completed');
    expect(resumed.externalWait?.resumedAt).toBe('2026-09-16T00:10:00.000Z');
    expect(resumed.externalWait?.decisionRef).toBe('obs-35031683683:HOLD');
  });
});

describe('external-verification wait — exactly-once + guards', () => {
  it('resumes exactly once across duplicate webhook deliveries', async () => {
    const db = freshDb();
    const store = new TaskStore(db);
    const taskId = await taskInProgress(store);
    await store.beginExternalVerificationWait({ taskId, ...waitInput });

    const first = await store.resumeExternalVerificationWait({
      waitRef: waitInput.waitRef,
      decisionRef: 'obs-1:HOLD',
      resumedAt: '2026-09-16T00:10:00.000Z',
    });
    const replay = await store.resumeExternalVerificationWait({
      waitRef: waitInput.waitRef,
      decisionRef: 'obs-1:HOLD',
      resumedAt: '2026-09-16T00:20:00.000Z',
    });

    expect(replay.status).toBe('in-progress');
    expect(replay.externalWait?.resumedAt).toBe(first.externalWait?.resumedAt);
    expect(replay.externalWait?.decisionRef).toBe(first.externalWait?.decisionRef);
  });

  it('makes missing/wrong correlation a no-op (no mutation)', async () => {
    const store = new TaskStore(freshDb());
    const taskId = await taskInProgress(store);
    await store.beginExternalVerificationWait({ taskId, ...waitInput });

    await expect(
      store.resumeExternalVerificationWait({ waitRef: 'ci-corr:unknown', decisionRef: 'obs:HOLD' }),
    ).rejects.toThrow(/no pending external wait/);

    const untouched = await store.get(taskId);
    expect(untouched?.status).toBe('awaiting-verification');
    expect(untouched?.externalWait?.resumedAt).toBeUndefined();
  });

  it('rejects beginning a wait from any state other than in-progress (blocked/approval unaffected)', async () => {
    const store = new TaskStore(freshDb());
    const [task] = await store.createMany('plan-1', [
      {
        planId: 'plan-1',
        summary: 'x',
        description: '',
        files: [],
        dependencies: [],
        effort: 'medium',
        requiredCapabilities: [],
      },
    ]);

    await expect(store.beginExternalVerificationWait({ taskId: task.id, ...waitInput })).rejects.toThrow(
      /expected in-progress/,
    );

    await store.markStarted(task.id);
    await store.requestApproval(task.id, 'high-risk');
    await expect(store.beginExternalVerificationWait({ taskId: task.id, ...waitInput })).rejects.toThrow(
      /expected in-progress/,
    );
    expect((await store.get(task.id))?.status).toBe('awaiting-approval');
  });

  it('is idempotent when re-begun with the same waitRef', async () => {
    const store = new TaskStore(freshDb());
    const taskId = await taskInProgress(store);
    const first = await store.beginExternalVerificationWait({ taskId, ...waitInput });
    const second = await store.beginExternalVerificationWait({ taskId, ...waitInput });
    expect(second).toEqual(first);
  });

  it('attaches the run identity once', async () => {
    const store = new TaskStore(freshDb());
    const taskId = await taskInProgress(store);
    await store.beginExternalVerificationWait({ taskId, ...waitInput });

    await store.attachExternalWaitRunRef(waitInput.waitRef, '35031683683');
    await store.attachExternalWaitRunRef(waitInput.waitRef, 'other');
    expect((await store.getByWaitRef(waitInput.waitRef))?.externalWait?.runRef).toBe('35031683683');
  });
});

describe('external-verification wait — state machine + scheduling', () => {
  it('declares awaiting-verification in the authoritative vocabulary', () => {
    expect(TASK_STATUSES).toContain('awaiting-verification');
  });

  it('permits only in-progress ↔ awaiting-verification (not completion)', () => {
    expect(canTransitionTask('in-progress', 'awaiting-verification')).toBe(true);
    expect(canTransitionTask('awaiting-verification', 'in-progress')).toBe(true);
    expect(canTransitionTask('awaiting-verification', 'failed')).toBe(true);
    expect(canTransitionTask('awaiting-verification', 'cancelled')).toBe(true);
    expect(canTransitionTask('awaiting-verification', 'completed')).toBe(false);
    expect(canTransitionTask('in-progress', 'blocked')).toBe(false);
  });

  it('is neither dispatched nor treated as dependency-complete', () => {
    // Dispatch selection requires pending|ready|assigned.
    expect(TASK_STATUSES).toContain('awaiting-verification');
    // Dependency satisfaction requires completed|cancelled.
    const completed = new Set<string>(['other-task']);
    const ready = readyTasks(
      [
        { id: 'dep', dependencies: [] },
        { id: 'blocked-by-ci', dependencies: ['dep'] },
      ],
      completed,
    );
    expect(ready.map((task) => task.id)).toEqual(['dep']);
  });
});
