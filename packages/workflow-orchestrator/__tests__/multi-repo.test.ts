import type { Database } from 'sql.js';

function migratedParentDb() {
  const db = new SQL.Database();
  migrate(db, ORCHESTRATION_MANIFEST, {});
  return db;
}

import { migrate } from '@vestara/sqlite-migrations';
import { beforeAll, describe, expect, it } from 'vitest';
import { MultiRepoOrchestrator } from '../src/multi-repo';
import { ORCHESTRATION_MANIFEST } from '../src/orchestration-migrations';
import { WorkflowOrchestrator } from '../src/orchestrator';
import { DEFAULT_RETRY_POLICY, type RetryPolicy } from '../src/retry-policy';
import { ArtifactStore, FileLockRegistry, ParentProjectStore, PlanStore, ProjectStore, TaskStore } from '../src/stores';
import type {
  OrchestrationEvent,
  OrchestrationEventSink,
  TaskDispatcher,
  TaskDispatchResult,
  WorkflowTask,
} from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

const FAST_RETRY: RetryPolicy = { maxAttempts: 3, maxRevisions: 3, backoffMs: () => 0 };

function makeOrchestrator(dispatcher: TaskDispatcher): WorkflowOrchestrator {
  const db = new SQL.Database();
  migrate(db, ORCHESTRATION_MANIFEST, {});
  return new WorkflowOrchestrator({
    projects: new ProjectStore(db),
    plans: new PlanStore(db),
    tasks: new TaskStore(db),
    artifacts: new ArtifactStore(db),
    locks: new FileLockRegistry(db),
    events: { append: () => {} },
    dispatcher,
    retry: FAST_RETRY,
  });
}

class OkDispatcher implements TaskDispatcher {
  async dispatch(): Promise<TaskDispatchResult> {
    return { status: 'completed', agentId: 'developer' };
  }
}

class FailDispatcher implements TaskDispatcher {
  async dispatch(): Promise<TaskDispatchResult> {
    return { status: 'failed', error: 'flaky' };
  }
}

describe('MultiRepoOrchestrator (PCS-025 §16)', () => {
  it('runs per-repo plans to completion and aggregates them under a parent', async () => {
    const events: OrchestrationEvent[] = [];
    const sink: OrchestrationEventSink = { append: (event) => events.push(event) };
    const apiOrchestrator = makeOrchestrator(new OkDispatcher());
    const uiOrchestrator = makeOrchestrator(new OkDispatcher());
    const multi = new MultiRepoOrchestrator({
      bindings: [
        { repoPath: '/repo/api', orchestrator: apiOrchestrator },
        { repoPath: '/repo/ui', orchestrator: uiOrchestrator },
      ],
      parents: new ParentProjectStore(migratedParentDb()),
      workspaceId: 'ws-1',
      events: sink,
    });

    const result = await multi.runParentProject(
      { name: 'Feature', goal: 'Ship feature', repoPath: '/repo' },
      {
        '/repo/api': {
          title: 'API work',
          goal: 'API',
          tasks: [
            {
              planId: '',
              summary: 'Endpoint',
              description: 'E',
              files: ['api.ts'],
              dependencies: [],
              effort: 'small',
              requiredCapabilities: ['code-generation'],
            },
          ],
        },
        '/repo/ui': {
          title: 'UI work',
          goal: 'UI',
          tasks: [
            {
              planId: '',
              summary: 'Screen',
              description: 'S',
              files: ['screen.tsx'],
              dependencies: [],
              effort: 'small',
              requiredCapabilities: ['code-generation'],
            },
          ],
        },
      },
    );

    expect(result.completed).toBe(true);
    expect(Object.keys(result.subProjects)).toEqual(['/repo/api', '/repo/ui']);
    expect(result.parent.status).toBe('completed');
    expect(events.some((event) => event.type === 'parent.created')).toBe(true);
    expect(events.some((event) => event.type === 'parent.completed')).toBe(true);

    const status = await multi.parentStatus(result.parent.id);
    expect(status).toBe('completed');

    const children = await multi.children(result.parent.id);
    expect(children).toHaveLength(2);

    const metrics = await multi.aggregateMetrics(result.parent.id);
    expect(metrics).toHaveLength(2);
    expect(metrics.every((metric) => metric.status === 'completed')).toBe(true);
  });

  it('marks the parent incomplete when a sub-repo blocks', async () => {
    const apiOrchestrator = makeOrchestrator(new OkDispatcher());
    const uiOrchestrator = makeOrchestrator(new FailDispatcher());
    const multi = new MultiRepoOrchestrator({
      bindings: [
        { repoPath: '/repo/api', orchestrator: apiOrchestrator },
        { repoPath: '/repo/ui', orchestrator: uiOrchestrator },
      ],
      parents: new ParentProjectStore(migratedParentDb()),
      workspaceId: 'ws-1',
    });

    const result = await multi.runParentProject(
      { name: 'Feature', goal: 'Ship', repoPath: '/repo' },
      {
        '/repo/api': {
          title: 'API',
          goal: 'API',
          tasks: [
            {
              planId: '',
              summary: 'A',
              description: 'A',
              files: ['a.ts'],
              dependencies: [],
              effort: 'small',
              requiredCapabilities: [],
            },
          ],
        },
        '/repo/ui': {
          title: 'UI',
          goal: 'UI',
          tasks: [
            {
              planId: '',
              summary: 'U',
              description: 'U',
              files: ['u.ts'],
              dependencies: [],
              effort: 'small',
              requiredCapabilities: [],
            },
          ],
        },
      },
    );

    expect(result.completed).toBe(false);
    expect(result.parent.status).toBe('running');
    expect(await multi.parentStatus(result.parent.id)).toBe('running');
  });

  it('requires a bound orchestrator for each repo', async () => {
    const multi = new MultiRepoOrchestrator({
      bindings: [{ repoPath: '/repo/api', orchestrator: makeOrchestrator(new OkDispatcher()) }],
      parents: new ParentProjectStore(migratedParentDb()),
      workspaceId: 'ws-1',
    });
    await expect(
      multi.runParentProject(
        { name: 'Feature', goal: 'Ship', repoPath: '/repo' },
        {
          '/repo/missing': {
            title: 'Missing',
            goal: 'Missing',
            tasks: [
              {
                planId: '',
                summary: 'M',
                description: 'M',
                files: ['m.ts'],
                dependencies: [],
                effort: 'small',
                requiredCapabilities: [],
              },
            ],
          },
        },
      ),
    ).rejects.toThrow(/No orchestrator bound/);
  });
});
