import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAndRunOrchestrationProject,
  draftFromOrchestrationTemplate,
  fetchOrchestrationTemplates,
  type OrchestrationTemplate,
} from './orchestration-templates';

const TEMPLATE: OrchestrationTemplate = {
  id: 'feature-delivery',
  name: 'Feature Delivery',
  description: 'Plan, build, verify, and review a scoped feature.',
  goal: 'Deliver a scoped feature.',
  tasks: [
    { summary: 'Plan', files: ['src/a.ts'], requiredCapabilities: ['planning'] },
    { summary: 'Build', files: [], requiredCapabilities: ['code-generation'] },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('draftFromOrchestrationTemplate', () => {
  it('maps the catalog preset to a project draft without sharing arrays', () => {
    const draft = draftFromOrchestrationTemplate(TEMPLATE);
    expect(draft).toEqual({
      name: 'Feature Delivery',
      goal: 'Deliver a scoped feature.',
      tasks: [
        { summary: 'Plan', files: ['src/a.ts'], requiredCapabilities: ['planning'] },
        { summary: 'Build', files: [], requiredCapabilities: ['code-generation'] },
      ],
    });
    expect(draft.tasks[0]?.files).not.toBe(TEMPLATE.tasks[0]?.files);
  });
});

describe('fetchOrchestrationTemplates', () => {
  it('returns the server catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ templates: [TEMPLATE] }), { status: 200 })),
    );
    await expect(fetchOrchestrationTemplates()).resolves.toEqual([TEMPLATE]);
  });

  it('fails closed to an empty catalog', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    await expect(fetchOrchestrationTemplates()).resolves.toEqual([]);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await expect(fetchOrchestrationTemplates()).resolves.toEqual([]);
  });
});

describe('createAndRunOrchestrationProject', () => {
  it('runs the canonical phase sequence and returns the project id', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/projects')) {
        return new Response(JSON.stringify({ project: { id: 'p-1' } }), { status: 201 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const projectId = await createAndRunOrchestrationProject(draftFromOrchestrationTemplate(TEMPLATE));

    expect(projectId).toBe('p-1');
    const calls = fetchMock.mock.calls.map(([input]) => (typeof input === 'string' ? input : input.toString()));
    expect(calls).toEqual([
      '/api/orchestration/projects',
      '/api/orchestration/projects/p-1/start',
      '/api/orchestration/projects/p-1/analysis',
      '/api/orchestration/projects/p-1/plan',
      '/api/orchestration/projects/p-1/architecture',
      '/api/orchestration/projects/p-1/approve',
      '/api/orchestration/projects/p-1/execute',
    ]);

    const planBody = JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body)) as {
      tasks: Array<{ summary: string; requiredCapabilities: string[] }>;
    };
    expect(planBody.tasks[0]).toMatchObject({ summary: 'Plan', requiredCapabilities: ['planning'] });
  });

  it('surfaces the server error and stops the sequence', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/projects')) {
        return new Response(JSON.stringify({ error: 'name and goal are required' }), { status: 400 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(createAndRunOrchestrationProject(draftFromOrchestrationTemplate(TEMPLATE))).rejects.toThrow(
      'name and goal are required',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
