import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentsApiError, fetchAgents, mergeAgentsWithCanonical } from './agents';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

describe('fetchAgents', () => {
  it('normalizes live agents and drops nameless rows', async () => {
    stubFetch(async (url) => {
      expect(url).toBe('/api/agents');
      return ok({
        agents: [
          { id: 'a1', name: 'Assistant', role: 'assistant', status: 'active', provider: 'opencode', model: 'glm-4' },
          { id: '', name: '' },
        ],
      });
    });
    await expect(fetchAgents()).resolves.toEqual([
      { id: 'a1', name: 'Assistant', role: 'assistant', status: 'active', provider: 'opencode', model: 'glm-4' },
    ]);
  });

  it('defaults missing role/status/model fields', async () => {
    stubFetch(async () => ok({ agents: [{ id: 'a2', name: 'Browser' }] }));
    await expect(fetchAgents()).resolves.toEqual([
      { id: 'a2', name: 'Browser', role: 'Agent', status: 'offline', provider: '', model: 'unknown' },
    ]);
  });

  it('rejects with status 0 when the API is unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchAgents()).rejects.toMatchObject({ status: 0 });
    await expect(fetchAgents()).rejects.toBeInstanceOf(AgentsApiError);
  });

  it('rejects with the server message on non-OK status', async () => {
    stubFetch(async () => ok({ error: 'boom' }, 500));
    await expect(fetchAgents()).rejects.toMatchObject({ status: 500, message: 'boom' });
  });

  it('sends the persisted Bearer token (gateway VES-AUTH-001)', async () => {
    localStorage.setItem('vestara-assistant-token', 'tok-123');
    let seenAuth: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const headers = (vi.mocked(fetch).mock.calls[0][1]?.headers ?? {}) as Headers;
        seenAuth = headers instanceof Headers ? headers.get('Authorization') : null;
        return ok({ agents: [] });
      }),
    );
    await expect(fetchAgents()).resolves.toEqual([]);
    expect(seenAuth).toBe('Bearer tok-123');
    localStorage.clear();
  });
});

describe('mergeAgentsWithCanonical', () => {
  const canonical = [
    { id: 'agent-assistant', name: 'Assistant', role: 'assistant', status: 'active', provider: '', model: 'unknown' },
    { id: 'agent-browser', name: 'Browser', role: 'custom', status: 'active', provider: '', model: 'unknown' },
  ];

  it('overlays live status onto the canonical roster', () => {
    const merged = mergeAgentsWithCanonical(canonical, [
      {
        id: 'agent-browser',
        name: 'Browser',
        role: 'browser',
        status: 'offline',
        provider: 'opencode',
        model: 'glm-4',
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'agent-assistant', status: 'active' });
    expect(merged[1]).toMatchObject({ id: 'agent-browser', status: 'offline', provider: 'opencode', model: 'glm-4' });
    // Canonical identity wins over live renames.
    expect(merged[1].name).toBe('Browser');
  });

  it('appends unknown live agents', () => {
    const merged = mergeAgentsWithCanonical(canonical, [
      { id: 'a9', name: 'Atlas', role: 'developer', status: 'active', provider: '', model: 'unknown' },
    ]);
    expect(merged).toHaveLength(3);
    expect(merged[2]).toMatchObject({ id: 'a9', name: 'Atlas' });
  });
});
