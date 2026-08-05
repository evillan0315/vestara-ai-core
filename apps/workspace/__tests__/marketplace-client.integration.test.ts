import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceOperationDto } from '../src/lib/marketplace.js';
import { marketplaceClient } from '../src/lib/marketplace.js';

/**
 * Integration tests — the real marketplaceClient adapter against a mocked
 * fetch, asserting the exact request/response contract the API routes define.
 */

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const planningOp: MarketplaceOperationDto = {
  id: 'op-plan',
  type: 'install',
  status: 'planning',
  asset: { publisherId: 'vestara', packageName: 'vestara.git-helper' },
  plan: {
    installOrder: [{ packageName: 'vestara.git-helper', version: '0.4.1', source: 'catalog' }],
    satisfiedByInstalled: [],
    permissions: [
      { capability: 'process:execute', scope: 'workspace' },
      { capability: 'filesystem:write', scope: 'repository' },
    ],
    warnings: [],
  },
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
};

const awaitingOp: MarketplaceOperationDto = {
  ...planningOp,
  id: 'op-await',
  status: 'awaiting-permission',
};

const completedOp: MarketplaceOperationDto = {
  ...planningOp,
  id: 'op-done',
  status: 'completed',
  installed: {
    packageName: 'vestara.git-helper',
    installedVersion: '0.4.1',
    state: 'active',
    updateStatus: 'current',
    installedAt: '2026-08-05T00:00:00.000Z',
  },
};

afterEach(() => {
  fetchMock.mockReset();
});

describe('marketplaceClient — API contract integration', () => {
  it('search issues GET /api/marketplace/search with query params', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ results: { total: 1, offset: 0, limit: 50, items: [], registryErrors: [] } }),
    );
    await marketplaceClient.search({ q: 'git', type: 'plugin' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/marketplace/search');
    expect(url).toContain('q=git');
    expect(url).toContain('type=plugin');
  });

  it('install dry-run returns the planning operation with both permissions', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ operation: planningOp }));
    const operation = await marketplaceClient.install({
      reference: { packageName: 'vestara.git-helper' },
      dryRun: true,
    });
    expect(operation.status).toBe('planning');
    expect(operation.plan?.permissions).toEqual([
      { capability: 'process:execute', scope: 'workspace' },
      { capability: 'filesystem:write', scope: 'repository' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/marketplace/install');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ dryRun: true });
  });

  it('unapproved install returns awaiting-permission (gate not bypassed)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ operation: awaitingOp }));
    const operation = await marketplaceClient.install({ reference: { packageName: 'vestara.git-helper' } });
    expect(operation.status).toBe('awaiting-permission');
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.approved).toBeUndefined();
  });

  it('approved install returns completed with active/current installed state', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ operation: completedOp }));
    const operation = await marketplaceClient.install({
      reference: { packageName: 'vestara.git-helper' },
      approved: true,
    });
    expect(operation.status).toBe('completed');
    expect(operation.installed).toMatchObject({ state: 'active', updateStatus: 'current' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.approved).toBe(true);
  });

  it('uninstall posts packageName and verify posts reference', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ operation: { ...completedOp, type: 'uninstall', status: 'completed' } }),
    );
    await marketplaceClient.uninstall('vestara.git-helper');
    const [uninstallUrl, uninstallInit] = fetchMock.mock.calls[0];
    expect(uninstallUrl).toContain('/api/marketplace/uninstall');
    expect(JSON.parse((uninstallInit as RequestInit).body as string)).toMatchObject({
      packageName: 'vestara.git-helper',
    });

    fetchMock.mockResolvedValue(jsonResponse({ operation: { ...completedOp, type: 'verify', status: 'completed' } }));
    await marketplaceClient.verify('vestara.git-helper');
    const [verifyUrl, verifyInit] = fetchMock.mock.calls[1];
    expect(verifyUrl).toContain('/api/marketplace/verify');
    expect(JSON.parse((verifyInit as RequestInit).body as string)).toMatchObject({ reference: 'vestara.git-helper' });
  });

  it('rescan posts to /api/marketplace/rescan', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ operation: { ...completedOp, type: 'rescan', status: 'completed' } }));
    await marketplaceClient.rescan();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/marketplace/rescan');
    expect((init as RequestInit).method).toBe('POST');
  });
});
