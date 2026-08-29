import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutingRevisionConflictError, routingClient } from '../src/lib/routing.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('routingClient', () => {
  it('loads the shared catalog and assignments', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ profiles: [{ id: 'balanced' }], candidates: [] }))
      .mockResolvedValueOnce(response({ assignments: [{ taskId: 'TASK-1', revision: 2 }] }));

    await expect(routingClient.catalog()).resolves.toMatchObject({ profiles: [{ id: 'balanced' }] });
    await expect(routingClient.assignments()).resolves.toEqual([{ taskId: 'TASK-1', revision: 2 }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/routing/catalog',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Vestara-Actor': 'workspace-ui' }) }),
    );
  });

  it('sends revision-checked routing updates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({
        revision: 4,
        updatedAt: '2026-08-01T00:00:00.000Z',
        updatedByClientId: 'workspace-ui',
        selection: { profileId: 'local', roles: {} },
      }),
    );

    await routingClient.updateSelection({ profileId: 'local', roles: {} }, 3);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/routing/selection',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          selection: { profileId: 'local', roles: {} },
          expectedRevision: 3,
          updatedByClientId: 'workspace-ui',
        }),
      }),
    );
  });

  it('returns the current selection through a typed revision conflict', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(
        {
          error: 'Routing revision conflict',
          current: {
            revision: 9,
            updatedAt: '2026-08-01T00:00:00.000Z',
            updatedByClientId: 'console',
            selection: { profileId: 'strict-engineering', roles: {} },
          },
        },
        409,
      ),
    );

    const error = await routingClient.updateSelection({ profileId: 'local', roles: {} }, 8).catch((caught) => caught);
    expect(error).toBeInstanceOf(RoutingRevisionConflictError);
    expect(error.current).toMatchObject({ revision: 9, updatedByClientId: 'console' });
  });
});
