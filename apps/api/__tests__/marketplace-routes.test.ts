import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  InstalledMarketplaceAsset,
  MarketplaceOperation,
  MarketplaceSearchResult,
  MarketplaceService,
  MarketplaceUpdateCandidate,
} from '@vestara/marketplace';
import type { WorkspaceContext } from '../src/workspace-context.js';
import { handleMarketplaceRoute } from '../src/routes/marketplace.js';

const OPERATION_ID = 'marketplace-install-1';

function operation(patch: Partial<MarketplaceOperation> = {}): MarketplaceOperation {
  return {
    operation: 'install',
    status: 'completed',
    dryRun: false,
    ...patch,
  };
}

/** Minimal fake of the marketplace surface the routes use. */
class FakeMarketplace {
  search = async (): Promise<MarketplaceSearchResult> => ({
    total: 1,
    offset: 0,
    limit: 50,
    items: [
      {
        asset: {
          id: 'vestara/demo',
          slug: 'demo',
          publisherId: 'vestara',
          packageName: 'demo',
          displayName: 'Demo',
          summary: 'Demo asset',
          type: 'plugin',
          tags: [],
          visibility: 'local',
          latestVersion: '1.0.0',
          versions: [],
          verification: { signed: false, signatureValidated: false, checksumVerified: true, runtimeVerified: false },
          createdAt: '2026-08-02T00:00:00.000Z',
          updatedAt: '2026-08-02T00:00:00.000Z',
        },
        registryId: 'local',
        score: 1,
      },
    ],
  });

  getAsset = async () => {
    throw Object.assign(new Error('not found'), { code: 'marketplace.not-found' });
  };

  listInstalled = async (): Promise<InstalledMarketplaceAsset[]> => [];
  listUpdates = async (): Promise<MarketplaceUpdateCandidate[]> => [];
  registryStatuses = async () => [
    { id: 'local', kind: 'local', displayName: 'Local', health: { status: 'healthy', assetCount: 1 } },
  ];
  rescan = async () => operation({ operation: 'rescan', status: 'completed' });
  verify = async () => operation({ operation: 'verify', status: 'completed', message: 'sha256 abc — verified' });

  install = async (request: { dryRun?: boolean; approved?: boolean }) => {
    if (request.dryRun) {
      return operation({
        operation: 'install',
        status: 'planned',
        dryRun: true,
        permissions: [{ capability: 'network.outbound', scope: 'provider-api' }],
        resolution: {
          target: { packageName: 'demo', version: '1.0.0', source: 'catalog', manifest: {} as never },
          installOrder: [{ packageName: 'demo', version: '1.0.0', source: 'catalog', manifest: {} as never }],
          satisfiedByInstalled: [],
          warnings: [],
        },
      });
    }
    return operation({ operation: 'install', status: 'completed', correlationId: OPERATION_ID });
  };

  update = async () => operation({ operation: 'update', status: 'completed', correlationId: OPERATION_ID });
  uninstall = async () => operation({ operation: 'uninstall', status: 'completed', correlationId: OPERATION_ID });
}

function makeContext(): WorkspaceContext {
  return { marketplace: new FakeMarketplace() as unknown as MarketplaceService } as unknown as WorkspaceContext;
}

function fakeResponse(): { res: http.ServerResponse; body: () => unknown; status: () => number } {
  let status = 0;
  let body: unknown = null;
  const res = new EventEmitter() as unknown as http.ServerResponse;
  res.writeHead = (code: number) => {
    status = code;
    return res as unknown as http.ServerResponse;
  };
  res.end = (data?: unknown) => {
    body = typeof data === 'string' ? JSON.parse(data) : data;
    return res as unknown as http.ServerResponse;
  };
  return { res, body: () => body, status: () => status };
}

function fakeRequest(method: string, url: string, body?: string): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage & { method: string; url: string };
  req.method = method;
  req.url = url;
  if (body) {
    queueMicrotask(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    queueMicrotask(() => req.emit('end'));
  }
  return req;
}

afterEach(() => {
  // Drain queued microtasks so readBody resolvers settle before the next test.
});

describe('marketplace routes', () => {
  it('serves search results', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleMarketplaceRoute('GET', '/api/marketplace/search', fakeRequest('GET', '/api/marketplace/search?q=demo'), res, makeContext());
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    expect((body() as { results: MarketplaceSearchResult }).results.total).toBe(1);
  });

  it('returns 404 for unknown assets', async () => {
    const { res, status } = fakeResponse();
    const handled = await handleMarketplaceRoute('GET', '/api/marketplace/assets/vestara/demo', fakeRequest('GET', '/api/marketplace/assets/vestara/demo'), res, makeContext());
    expect(handled).toBe(true);
    expect(status()).toBe(404);
  });

  it('returns planning for dry-run installs', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleMarketplaceRoute('POST', '/api/marketplace/install', fakeRequest('POST', '/api/marketplace/install', JSON.stringify({ reference: 'demo', dryRun: true })), res, makeContext());
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const operation = (body() as { operation: { status: string; plan?: unknown } }).operation;
    expect(operation.status).toBe('planning');
    expect(operation.plan).toBeDefined();
  });

  it('returns awaiting-permission when permissions require approval', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleMarketplaceRoute('POST', '/api/marketplace/install', fakeRequest('POST', '/api/marketplace/install', JSON.stringify({ reference: 'demo' })), res, makeContext());
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const operation = (body() as { operation: { status: string } }).operation;
    expect(operation.status).toBe('awaiting-permission');
  });

  it('completes approved installs with the correlation id', async () => {
    const { res, body, status } = fakeResponse();
    const handled = await handleMarketplaceRoute('POST', '/api/marketplace/install', fakeRequest('POST', '/api/marketplace/install', JSON.stringify({ reference: 'demo', approved: true })), res, makeContext());
    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const operation = (body() as { operation: { status: string; id: string } }).operation;
    expect(operation.status).toBe('completed');
    expect(operation.id).toBe(OPERATION_ID);
  });

  it('handles rescan and verify operations', async () => {
    const rescanResponse = fakeResponse();
    await handleMarketplaceRoute('POST', '/api/marketplace/rescan', fakeRequest('POST', '/api/marketplace/rescan'), rescanResponse.res, makeContext());
    expect(rescanResponse.status()).toBe(200);
    expect((rescanResponse.body() as { operation: { type: string } }).operation.type).toBe('rescan');

    const verifyResponse = fakeResponse();
    await handleMarketplaceRoute('POST', '/api/marketplace/verify', fakeRequest('POST', '/api/marketplace/verify', JSON.stringify({ reference: 'demo' })), verifyResponse.res, makeContext());
    expect(verifyResponse.status()).toBe(200);
    expect((verifyResponse.body() as { operation: { type: string } }).operation.type).toBe('verify');
  });
});
