import { cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/Toast.js';
import type { Agent } from '../src/pages/Agents/types.js';
import AgentsPage from '../src/pages/Agents.js';

configure({ asyncUtilTimeout: 5000 });

function json(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: 'agent-1',
    name: 'Planner',
    role: 'planner',
    agentType: 'workspace',
    description: '',
    capabilities: [],
    permissions: [],
    provider: 'opencode',
    model: 'deepseek-v4-flash-free',
    runtimeAgent: 'planner',
    teamId: '',
    color: '#6b7280',
    status: 'active',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(_url: string) {}
  send(_data: string): void {}
  close(): void {}
}

interface FetchRouter {
  agents: Agent[];
  posted: unknown[];
  failSave?: boolean;
}

function makeFetch(router: FetchRouter) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u === '/api/agents' && method === 'GET') {
      return json({ agents: router.agents, executions: [], runtime: { reachable: false } });
    }
    if (u === '/api/agents' && method === 'POST') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      router.posted.push(body);
      if (router.failSave) return { ok: false, status: 500, json: async () => ({ error: 'boom' }) };
      const created = agent({
        id: body.id || `agent-${router.agents.length + 1}`,
        name: body.name || 'New Agent',
        role: body.role || 'custom',
      });
      router.agents.push(created);
      return { ok: true, status: 201, json: async () => ({ agent: created }) };
    }
    if (u.includes('/api/opencode/providers')) return json({ providers: [] });
    if (u.includes('/api/opencode/agents')) return json({ agents: [] });
    if (u.includes('/api/opencode/health')) return json({ status: 'ok' });
    if (u.includes('/api/teams')) return json({ teams: [] });
    if (u.includes('/api/sessions/executions')) return json({ sessions: [] });
    if (u.includes('/api/providers')) return json({ providers: [] });
    if (u.includes('/api/routing/selection')) return json({});
    if (u.includes('/api/activity')) return json({ events: [] });
    return json({});
  });
}

function renderPage(fetchImpl: ReturnType<typeof makeFetch>) {
  vi.stubGlobal('fetch', fetchImpl);
  return render(
    <ToastProvider>
      <AgentsPage />
    </ToastProvider>,
  );
}

function comboboxWith(text: string): HTMLSelectElement {
  return screen
    .getAllByRole('combobox')
    .find((box) => [...box.options].some((o) => o.textContent?.includes(text))) as HTMLSelectElement;
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Agent Control page (AC-TST-002 UI)', () => {
  it('renders registered agents in their role slots from the API', async () => {
    const router: FetchRouter = {
      agents: [
        agent({ id: 'a1', name: 'Planner', role: 'planner' }),
        agent({ id: 'a2', name: 'Engineer', role: 'developer' }),
      ],
      posted: [],
    };
    renderPage(makeFetch(router));

    await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());
    expect(screen.getByText('Engineer')).toBeTruthy();
  });

  it('reaches the empty state when a filter/search matches nothing', async () => {
    const router: FetchRouter = { agents: [], posted: [] };
    renderPage(makeFetch(router));

    await waitFor(() => expect(screen.getByPlaceholderText('Search by name, role, capability...')).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Search by name, role, capability...'), {
      target: { value: 'no-such-agent' },
    });
    await waitFor(() => expect(screen.getByText('No agents found')).toBeTruthy());
  });

  it('posts the registry payload on create and acknowledges with a toast', async () => {
    const router: FetchRouter = { agents: [], posted: [] };
    renderPage(makeFetch(router));

    await waitFor(() => expect(screen.getByText('+ Add Agent')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '+ Add Agent' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Frontend Developer' } });
    fireEvent.change(comboboxWith('developer'), { target: { value: 'developer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Agent' }));

    await waitFor(() => expect(router.posted).toHaveLength(1));
    expect(router.posted[0]).toMatchObject({ name: 'Frontend Developer', role: 'developer' });
    await waitFor(() => expect(screen.getByText('Agent "Frontend Developer" registered')).toBeTruthy());
  });

  it('shows a persisted agent on a fresh load (refresh persistence)', async () => {
    const router: FetchRouter = {
      agents: [agent({ id: 'persisted', name: 'Verifier', role: 'verifier' })],
      posted: [],
    };
    renderPage(makeFetch(router));
    await waitFor(() => expect(screen.getByText('Verifier')).toBeTruthy());
  });

  it('surfaces the API rejection when saving fails', async () => {
    const router: FetchRouter = { agents: [], posted: [], failSave: true };
    renderPage(makeFetch(router));

    await waitFor(() => expect(screen.getByText('+ Add Agent')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: '+ Add Agent' }));
    await waitFor(() => expect(screen.getByPlaceholderText('Agent name')).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('Agent name'), { target: { value: 'Doomed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Agent' }));

    await waitFor(() => expect(screen.getByText(/Failed to save agent/)).toBeTruthy());
    expect(router.posted).toHaveLength(1);
  });
});
