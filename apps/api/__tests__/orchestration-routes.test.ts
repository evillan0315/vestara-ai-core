import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import type { TaskDispatcher, TaskDispatchResult } from '@vestara/workflow-orchestrator';
import {
  ArtifactStore,
  FileLockRegistry,
  PlanStore,
  ProjectStore,
  TaskStore,
  WorkflowOrchestrator,
} from '@vestara/workflow-orchestrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OrchestrationEventBridge } from '../src/bridges/orchestration-event-bridge';
import { handleOrchestrationRoute } from '../src/routes/orchestration';
import type { WorkspaceContext } from '../src/workspace-context';

let SQL: { Database: new (data?: Uint8Array | null) => import('sql.js').Database };

const directories: string[] = [];

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

class OkDispatcher implements TaskDispatcher {
  async dispatch(): Promise<TaskDispatchResult> {
    return { status: 'completed', agentId: 'developer', output: 'done' };
  }
}

interface ResponseCapture {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function capture(): { res: http.ServerResponse; response: ResponseCapture } {
  const response: ResponseCapture = { status: 0, body: undefined, headers: {} };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      response.status = status;
      response.headers = headers ?? {};
    },
    end(body: string) {
      response.body = body ? JSON.parse(body) : undefined;
    },
  } as unknown as http.ServerResponse;
  return { res, response };
}

function request(body?: unknown): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.headers = {};
  if (body !== undefined) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(JSON.stringify(body)));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

describe('orchestration routes', () => {
  let orchestrator: WorkflowOrchestrator;
  let events: SqliteEngineeringEventStore;
  let ctx: WorkspaceContext;

  beforeAll(async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-orchestration-routes-'));
    directories.push(directory);
    const db = new SQL.Database();
    events = await SqliteEngineeringEventStore.open(path.join(directory, 'events.db'));
    const bridge = new OrchestrationEventBridge({ events, workspaceId: 'ws-1' });
    orchestrator = new WorkflowOrchestrator({
      projects: new ProjectStore(db),
      plans: new PlanStore(db),
      tasks: new TaskStore(db),
      artifacts: new ArtifactStore(db),
      locks: new FileLockRegistry(db),
      events: bridge,
      dispatcher: new OkDispatcher(),
    });
    ctx = {
      workflowOrchestrator: orchestrator,
      runtime: { getSession: () => ({ fingerprint: { id: 'ws-1' } }) },
      repoPath: '/repo',
      engineeringEvents: events,
    } as unknown as WorkspaceContext;
  });

  async function call(method: string, path: string, body?: unknown) {
    const { res, response } = capture();
    const handled = await handleOrchestrationRoute(method, path, request(body), res, ctx);
    return { handled, response };
  }

  it('creates and lists orchestrated projects', async () => {
    const created = await call('POST', '/api/orchestration/projects', {
      name: 'Feature',
      goal: 'Build X',
      repoPath: '/repo',
    });
    expect(created.response.status).toBe(201);
    const project = (created.response.body as { project: { id: string } }).project;

    const listed = await call('GET', '/api/orchestration/projects');
    expect(listed.response.status).toBe(200);
    const projects = (listed.response.body as { projects: Array<{ id: string; name: string }> }).projects;
    expect(projects.some((p) => p.id === project.id)).toBe(true);
  });

  it('rejects a project without a goal', async () => {
    const result = await call('POST', '/api/orchestration/projects', { name: 'No Goal' });
    expect(result.response.status).toBe(400);
  });

  it('drives a project through the approval gateway and resolves it', async () => {
    const created = await call('POST', '/api/orchestration/projects', {
      name: 'Risky',
      goal: 'Build',
      repoPath: '/repo',
    });
    const projectId = (created.response.body as { project: { id: string } }).project.id;

    await call('POST', `/api/orchestration/projects/${projectId}/start`);
    await call('POST', `/api/orchestration/projects/${projectId}/analysis`, { analystId: 'analyst', report: {} });
    await call('POST', `/api/orchestration/projects/${projectId}/plan`, {
      plannerId: 'planner',
      title: 'Risky',
      goal: 'Build',
      tasks: [
        {
          summary: 'Deploy',
          description: 'Sensitive change',
          files: ['.env'],
          dependencies: [],
          effort: 'small',
          requiredCapabilities: ['code-generation'],
        },
      ],
    });
    await call('POST', `/api/orchestration/projects/${projectId}/architecture`, {
      architectId: 'architect',
      status: 'approved',
    });
    await call('POST', `/api/orchestration/projects/${projectId}/approve`, { approvalId: 'a1' });
    await call('POST', `/api/orchestration/projects/${projectId}/execute`);

    // Sensitive `.env` file → high-risk approval required.
    const approvals = await call('GET', `/api/orchestration/projects/${projectId}/approvals`);
    const pending = (approvals.response.body as { approvals: Array<{ id: string }> }).approvals;
    expect(pending).toHaveLength(1);

    const resolved = await call('POST', `/api/orchestration/projects/${projectId}/tasks/${pending[0].id}/approval`, {
      approved: true,
    });
    expect(resolved.response.status).toBe(200);

    await call('POST', `/api/orchestration/projects/${projectId}/resume`);
    const snapshot = await call('GET', `/api/orchestration/projects/${projectId}`);
    const snapshotBody = snapshot.response.body as { snapshot: { tasks: Array<{ status: string }> } };
    expect(snapshotBody.snapshot.tasks[0].status).toBe('completed');
  });

  it('exposes metrics and audit for a project', async () => {
    const created = await call('POST', '/api/orchestration/projects', { name: 'M', goal: 'G', repoPath: '/repo' });
    const projectId = (created.response.body as { project: { id: string } }).project.id;

    const metrics = await call('GET', `/api/orchestration/projects/${projectId}/metrics`);
    expect(metrics.response.status).toBe(200);
    expect((metrics.response.body as { metrics: { projectId: string } }).metrics.projectId).toBe(projectId);

    const allMetrics = await call('GET', '/api/orchestration/metrics');
    expect((allMetrics.response.body as { metrics: unknown[] }).metrics.length).toBeGreaterThanOrEqual(1);

    const audit = await call('GET', `/api/orchestration/projects/${projectId}/audit`);
    const eventTypes = (audit.response.body as { events: Array<{ type: string }> }).events.map((e) => e.type);
    expect(eventTypes).toContain('orchestration.project.created');
  });
});
