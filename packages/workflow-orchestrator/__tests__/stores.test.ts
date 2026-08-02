import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { ArtifactStore } from '../src/stores/artifact-store';
import { FileLockRegistry } from '../src/stores/file-lock-registry';
import { PlanStore } from '../src/stores/plan-store';
import { ProjectStore } from '../src/stores/project-store';
import { TaskStore } from '../src/stores/task-store';
import type { WorkflowTask } from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

function freshDb(): Database {
  return new SQL.Database();
}

describe('project + plan stores', () => {
  it('creates and reloads a project', async () => {
    const store = new ProjectStore(freshDb());
    const project = await store.create({ name: 'Feature', goal: 'Build X', repoPath: '/repo', workspaceId: 'ws-1' });
    expect(project.phase).toBe('draft');
    const loaded = await store.get(project.id);
    expect(loaded).toEqual(project);
    await store.updatePhase(project.id, 'analyzing');
    expect((await store.get(project.id))?.phase).toBe('analyzing');
  });

  it('creates a plan with revision 1', async () => {
    const db = freshDb();
    const store = new PlanStore(db);
    const plan = await store.create({ projectId: 'p-1', title: 'Plan', goal: 'Goal' });
    expect(plan.revision).toBe(1);
    await store.bumpRevision(plan.id);
    expect((await store.get(plan.id))?.revision).toBe(2);
  });
});

describe('task store', () => {
  it('creates many tasks and resolves numeric dependencies to ids', async () => {
    const store = new TaskStore(freshDb());
    const tasks = await store.createMany('plan-1', [
      {
        planId: 'plan-1',
        summary: 'Setup',
        description: '',
        files: ['a.ts'],
        dependencies: [],
        effort: 'small',
        requiredCapabilities: ['code-generation'],
      },
      {
        planId: 'plan-1',
        summary: 'Build',
        description: '',
        files: ['b.ts'],
        dependencies: ['0'],
        effort: 'medium',
        requiredCapabilities: ['code-generation'],
      },
    ]);
    expect(tasks).toHaveLength(2);
    expect(tasks[1].dependencies).toEqual([tasks[0].id]);
    expect(tasks.every((task) => task.status === 'pending')).toBe(true);
  });

  it('persists status changes', async () => {
    const store = new TaskStore(freshDb());
    const [task] = await store.createMany('plan-1', [
      {
        planId: 'plan-1',
        summary: 'T',
        description: '',
        files: [],
        dependencies: [],
        effort: 'small',
        requiredCapabilities: [],
      },
    ]);
    await store.markStarted(task.id);
    await store.complete(task.id, 'developer-1');
    const stored: WorkflowTask | null = await store.get(task.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.assignedAgentId).toBe('developer-1');
    expect(stored?.completedAt).toBeTruthy();
  });

  it('records failures with attempt counts', async () => {
    const store = new TaskStore(freshDb());
    const [task] = await store.createMany('plan-1', [
      {
        planId: 'plan-1',
        summary: 'T',
        description: '',
        files: [],
        dependencies: [],
        effort: 'small',
        requiredCapabilities: [],
      },
    ]);
    await store.recordFailure(task.id, 'boom', 2);
    const stored = await store.get(task.id);
    expect(stored?.status).toBe('failed');
    expect(stored?.attemptCount).toBe(2);
    expect(stored?.lastError).toBe('boom');
  });
});

describe('artifact store', () => {
  it('stores versioned artifacts and lists them per project', async () => {
    const store = new ArtifactStore(freshDb());
    const a = await store.create({
      kind: 'analysis',
      projectId: 'p-1',
      agentId: 'analyst',
      body: { summary: 'repo scan' },
    });
    const b = await store.create({
      kind: 'changeset',
      projectId: 'p-1',
      planId: 'plan-1',
      taskId: 'task-1',
      agentId: 'developer',
      body: { files: ['x.ts'] },
    });
    expect(a.version).toBe(1);
    const list = await store.listForProject('p-1');
    expect(list).toHaveLength(2);
    expect((await store.get(b.id))?.body).toEqual({ files: ['x.ts'] });
  });
});

describe('file lock registry', () => {
  it('acquires, conflicts, and releases', async () => {
    const registry = new FileLockRegistry(freshDb());
    const first = await registry.acquire({ path: 'src/a.ts', holderAgentId: 'dev-1', taskId: 'task-1' });
    expect(first.acquired).toBe(true);
    expect(await registry.isLocked('src/a.ts')).toBe(true);

    const second = await registry.acquire({ path: 'src/a.ts', holderAgentId: 'dev-2', taskId: 'task-2' });
    expect(second.acquired).toBe(false);
    expect(second.holderTaskId).toBe('task-1');

    await registry.release('src/a.ts', 'task-1');
    expect(await registry.isLocked('src/a.ts')).toBe(false);
    expect(await registry.listActive()).toHaveLength(0);
  });
});
