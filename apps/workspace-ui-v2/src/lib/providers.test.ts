import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProviders, fetchRoutingSelection, ProvidersApiError, saveRoutingAssignment } from './providers';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => handler(String(url), init)),
  );
}

describe('fetchProviders', () => {
  it('normalizes providers with their models', async () => {
    stubFetch(async (url) => {
      expect(url).toBe('/api/providers');
      return ok({
        providers: [
          {
            id: 'opencode',
            name: 'OpenCode',
            enabled: true,
            status: 'available',
            models: [{ id: 'glm-4', name: 'GLM 4', enabled: true }, { id: '' }],
          },
          { id: '' },
        ],
      });
    });
    await expect(fetchProviders()).resolves.toEqual([
      {
        id: 'opencode',
        name: 'OpenCode',
        enabled: true,
        status: 'available',
        models: [{ id: 'glm-4', name: 'GLM 4', enabled: true }],
      },
    ]);
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchProviders()).rejects.toBeInstanceOf(ProvidersApiError);
  });
});

describe('fetchRoutingSelection', () => {
  it('parses the versioned selection', async () => {
    stubFetch(async (url) => {
      expect(url).toBe('/api/routing/selection');
      return ok({
        revision: 3,
        updatedByClientId: 'workspace-ui',
        selection: {
          profileId: 'balanced',
          roles: { developer: { providerId: 'opencode', modelId: 'glm-4' }, stale: {} },
        },
      });
    });
    await expect(fetchRoutingSelection()).resolves.toEqual({
      revision: 3,
      updatedByClientId: 'workspace-ui',
      selection: {
        profileId: 'balanced',
        roles: { developer: { providerId: 'opencode', modelId: 'glm-4' } },
      },
    });
  });

  it('resolves null on unusable shapes', async () => {
    stubFetch(async () => ok({ revision: 'x' }));
    await expect(fetchRoutingSelection()).resolves.toBeNull();
  });
});

describe('saveRoutingAssignment', () => {
  it('patches the selection with the expected revision', async () => {
    const current = {
      revision: 3,
      updatedByClientId: 'workspace-ui',
      selection: { profileId: 'balanced', roles: {} },
    };
    stubFetch(async (url, init) => {
      expect(url).toBe('/api/routing/selection');
      expect(init?.method).toBe('PATCH');
      const body = JSON.parse(String(init?.body));
      expect(body.expectedRevision).toBe(3);
      expect(body.selection.roles.developer).toEqual({ providerId: 'opencode', modelId: 'glm-4' });
      return ok({ ...current, revision: 4, selection: body.selection });
    });
    await expect(
      saveRoutingAssignment(current, 'developer', { providerId: 'opencode', modelId: 'glm-4' }),
    ).resolves.toMatchObject({ revision: 4 });
  });

  it('rejects with the server message on conflict', async () => {
    const current = {
      revision: 3,
      updatedByClientId: 'workspace-ui',
      selection: { profileId: 'balanced', roles: {} },
    };
    stubFetch(async () => ok({ error: 'Routing changed in another client' }, 409));
    await expect(saveRoutingAssignment(current, 'developer', { providerId: 'p', modelId: 'm' })).rejects.toMatchObject({
      status: 409,
    });
  });
});
