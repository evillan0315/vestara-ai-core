/**
 * Marketplace (Engineering Exchange) HTTP adapter.
 *
 * A thin layer over `MarketplaceService`. It never reimplements search,
 * resolution, compatibility, or lifecycle logic; mutations return operation
 * records so the UI and future WebSocket progress share one model.
 */

import type * as http from 'node:http';
import type {
  InstalledMarketplaceAsset,
  MarketplaceAsset,
  MarketplaceAssetDetails,
  MarketplaceError,
  MarketplaceOperation,
  MarketplaceSearchQuery,
  MarketplaceUpdateCandidate,
  PublishIntoRootResult,
} from '@vestara/marketplace';
import { MarketplacePublisher } from '@vestara/marketplace';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export type MarketplaceOperationStatus =
  | 'requested'
  | 'planning'
  | 'awaiting-permission'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface MarketplaceOperationDto {
  id: string;
  type: MarketplaceOperation['operation'] | 'publish';
  status: MarketplaceOperationStatus;
  asset?: { publisherId?: string; packageName: string };
  plan?: {
    installOrder: Array<{ packageName: string; version: string; source: 'catalog' | 'installed' }>;
    satisfiedByInstalled: Array<{ packageName: string; version: string }>;
    permissions: Array<{ capability: string; scope: string }>;
    warnings: string[];
  };
  installed?: InstalledMarketplaceAsset;
  published?: PublishIntoRootResult;
  error?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
}

interface MutationBody {
  reference?: string | { publisherId?: string; packageName: string };
  packageName?: string;
  version?: string;
  workspaceId?: string;
  dryRun?: boolean;
  approved?: boolean;
  enabled?: boolean;
  /** Absolute path to a package directory to publish into the marketplace. */
  sourcePath?: string;
  /** PEM-encoded Ed25519 private key used to sign the published package. */
  key?: string;
  /** Directory to scan for detectable packages. */
  directory?: string;
  /** Publisher ID for detected packages. */
  publisherId?: string;
  /** Publisher display name for detected packages. */
  publisherName?: string;
  /** Maximum directory depth for detection. */
  maxDepth?: number;
  /** Skip directories that already have vestara-package.json. */
  skipExisting?: boolean;
}

function now(): string {
  return new Date().toISOString();
}

function identifier(type: string): string {
  return `marketplace-${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function assetRef(reference: unknown): { publisherId?: string; packageName: string } {
  if (typeof reference === 'string') {
    const slash = reference.indexOf('/');
    return slash > 0
      ? { publisherId: reference.slice(0, slash), packageName: reference.slice(slash + 1) }
      : { packageName: reference };
  }
  const record = reference as { publisherId?: string; packageName?: string };
  return { publisherId: record?.publisherId, packageName: record?.packageName ?? '' };
}

function planDto(operation: MarketplaceOperation): MarketplaceOperationDto['plan'] {
  return {
    installOrder: (operation.resolution?.installOrder ?? []).map((pkg) => ({
      packageName: pkg.packageName,
      version: pkg.version,
      source: pkg.source,
    })),
    satisfiedByInstalled: (operation.resolution?.satisfiedByInstalled ?? []).map((pkg) => ({
      packageName: pkg.packageName,
      version: pkg.version,
    })),
    permissions: (operation.permissions ?? []).map((permission) => ({
      capability: permission.capability,
      scope: permission.scope,
    })),
    warnings: [...(operation.resolution?.warnings ?? [])],
  };
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof Error && 'code' in error) {
    const marketplaceError = error as unknown as MarketplaceError;
    return { code: marketplaceError.code, message: error.message };
  }
  return { code: 'marketplace.operation-failed', message: error instanceof Error ? error.message : String(error) };
}

export async function handleMarketplaceRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  // ─── Reads ────────────────────────────────────────────────────────────────

  if (method === 'GET' && p === '/api/marketplace/search') {
    const query = searchQueryFromUrl(req);
    const result = await ctx.marketplace.search(query);
    json(res, 200, { results: result });
    return true;
  }

  if (method === 'GET' && p === '/api/marketplace/assets') {
    const assets = await listAssets(ctx, req);
    json(res, 200, { assets });
    return true;
  }

  const assetMatch = p.match(/^\/api\/marketplace\/assets\/([^/]+)\/([^/]+)(?:\/(versions))?$/);
  if (assetMatch && method === 'GET') {
    const publisherId = decodeURIComponent(assetMatch[1]);
    const packageName = decodeURIComponent(assetMatch[2]);
    const versionsOnly = assetMatch[3] === 'versions';
    try {
      const details = await ctx.marketplace.getAsset({ publisherId, packageName });
      if (versionsOnly) json(res, 200, { versions: details.asset.versions });
      else json(res, 200, { asset: details });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as unknown as MarketplaceError).code === 'marketplace.not-found'
      ) {
        json(res, 404, { code: 'marketplace.not-found', error: `Asset not found: ${publisherId}/${packageName}` });
        return true;
      }
      throw error;
    }
    return true;
  }

  if (method === 'GET' && p === '/api/marketplace/categories') {
    const result = await ctx.marketplace.search({ query: undefined, limit: 1000 });
    const byType = new Map<string, number>();
    for (const hit of result.items) byType.set(hit.asset.type, (byType.get(hit.asset.type) ?? 0) + 1);
    const categories = [...byType.entries()]
      .map(([name, assetCount]) => ({ name, assetCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
    json(res, 200, { categories });
    return true;
  }

  if (method === 'GET' && p === '/api/marketplace/registries') {
    const registries = await ctx.marketplace.registryStatuses();
    json(res, 200, { registries });
    return true;
  }

  if (method === 'GET' && p === '/api/marketplace/installed') {
    const installed = await ctx.marketplace.listInstalled();
    json(res, 200, { installed });
    return true;
  }

  if (method === 'GET' && p === '/api/marketplace/updates') {
    const updates = await ctx.marketplace.listUpdates();
    json(res, 200, { updates });
    return true;
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  if (method === 'POST' && p === '/api/marketplace/rescan') {
    const operation = await ctx.marketplace.rescan();
    json(res, 200, { operation: toDto(operation, 'rescan', undefined, operation.correlationId) });
    return true;
  }

  // PATCH /api/marketplace/installed/:packageId — enable or disable an installed extension
  const installedMatch = p.match(/^\/api\/marketplace\/installed\/([^/]+)$/);
  if (installedMatch && method === 'PATCH') {
    const packageId = decodeURIComponent(installedMatch[1]);
    const body = parseBody(await readBody(req));
    if (typeof body.enabled !== 'boolean') {
      json(res, 400, { code: 'marketplace.invalid-body', error: 'enabled boolean is required' });
      return true;
    }
    try {
      const result = await ctx.marketplace.setEnabled({
        packageName: packageId,
        enabled: body.enabled,
        workspaceId: body.workspaceId,
      });
      json(res, 200, {
        operation: {
          id: result.correlationId ?? identifier('set-enabled'),
          type: 'update' as const,
          status: 'completed' as const,
          asset: { packageName: packageId },
          installed: result.installed,
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        'code' in error &&
        (error as unknown as MarketplaceError).code === 'marketplace.not-found';
      json(res, isNotFound ? 404 : 500, {
        code: isNotFound ? 'marketplace.not-found' : 'marketplace.set-enabled-failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  // POST /api/marketplace/detect — scan a directory for packages and register them
  if (method === 'POST' && p === '/api/marketplace/detect') {
    const body = parseBody(await readBody(req));
    if (!body.directory) {
      json(res, 400, { code: 'marketplace.invalid-directory', error: 'directory is required' });
      return true;
    }
    try {
      const report = await ctx.marketplace.detectAndRegister(body.directory, {
        publisherId: body.publisherId ?? 'local',
        publisherName: body.publisherName,
        maxDepth: body.maxDepth,
        skipExisting: body.skipExisting,
      });
      json(res, 200, {
        report: {
          directory: report.directory,
          scanned: report.scanned,
          detected: report.detected,
          registered: report.registered,
          skipped: report.skipped,
          errors: report.errors,
          packages: report.results.map((r) => ({
            name: r.detected.name,
            version: r.detected.version,
            type: r.manifest.type,
            packageDir: r.packageDir,
            registered: r.registered,
          })),
        },
      });
      return true;
    } catch (error) {
      json(res, 500, {
        code: 'marketplace.detect-failed',
        error: error instanceof Error ? error.message : String(error),
      });
      return true;
    }
  }

  // POST /api/marketplace/publish — validate + digest + sign a package directory
  // and register it into the marketplace root so a scan indexes it as an asset.
  if (method === 'POST' && p === '/api/marketplace/publish') {
    const body = parseBody(await readBody(req));
    const id = identifier('publish');
    if (!body.sourcePath) {
      json(res, 400, { code: 'marketplace.invalid-source', error: 'sourcePath is required' });
      return true;
    }
    try {
      const result = new MarketplacePublisher().publishIntoRoot({
        source: { packagePath: body.sourcePath },
        ...(body.key ? { signing: { privateKeyPem: body.key } } : {}),
        root: ctx.marketplacePublishRoot,
      });
      await ctx.marketplace.rescan();
      json(res, 200, {
        operation: {
          id,
          type: 'publish' as const,
          status: 'completed' as const,
          asset: { publisherId: result.publisherId, packageName: result.packageName },
          published: result,
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    } catch (error) {
      json(res, 200, {
        operation: {
          id,
          type: 'publish' as const,
          status: 'failed' as const,
          asset: { packageName: String(body.sourcePath) },
          error: errorDetails(error),
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    }
  }

  if (method === 'POST' && p === '/api/marketplace/install') {
    const body = parseBody(await readBody(req));
    const id = identifier('install');
    const ref = assetRef(body.reference);
    if (!ref.packageName) {
      json(res, 400, { code: 'marketplace.invalid-reference', error: 'reference is required' });
      return true;
    }
    try {
      const planOp = await ctx.marketplace.install({
        reference: ref,
        version: body.version,
        workspaceId: body.workspaceId,
        dryRun: true,
      });
      const plan = planDto(planOp);
      if (body.dryRun === true) {
        json(res, 200, {
          operation: {
            id,
            type: 'install' as const,
            status: 'planning' as const,
            asset: ref,
            plan,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        return true;
      }
      if ((plan?.permissions.length ?? 0) > 0 && body.approved !== true) {
        json(res, 200, {
          operation: {
            id,
            type: 'install' as const,
            status: 'awaiting-permission' as const,
            asset: ref,
            plan,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        return true;
      }
      const result = await ctx.marketplace.install({
        reference: ref,
        version: body.version,
        workspaceId: body.workspaceId,
      });
      json(res, 200, {
        operation: {
          id: result.correlationId ?? id,
          type: 'install' as const,
          status: 'completed' as const,
          asset: ref,
          plan,
          installed: result.installed,
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    } catch (error) {
      json(res, 200, {
        operation: {
          id,
          type: 'install' as const,
          status: 'failed' as const,
          asset: ref,
          error: errorDetails(error),
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    }
  }

  if (method === 'POST' && p === '/api/marketplace/update') {
    const body = parseBody(await readBody(req));
    const id = identifier('update');
    if (!body.packageName) {
      json(res, 400, { code: 'marketplace.invalid-reference', error: 'packageName is required' });
      return true;
    }
    try {
      const planOp = await ctx.marketplace.update({
        packageName: body.packageName,
        version: body.version,
        workspaceId: body.workspaceId,
        dryRun: true,
      });
      const plan = planDto(planOp);
      if (body.dryRun === true) {
        json(res, 200, {
          operation: {
            id,
            type: 'update' as const,
            status: 'planning' as const,
            asset: { packageName: body.packageName },
            plan,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        return true;
      }
      if ((plan?.permissions.length ?? 0) > 0 && body.approved !== true) {
        json(res, 200, {
          operation: {
            id,
            type: 'update' as const,
            status: 'awaiting-permission' as const,
            asset: { packageName: body.packageName },
            plan,
            createdAt: now(),
            updatedAt: now(),
          },
        });
        return true;
      }
      const result = await ctx.marketplace.update({
        packageName: body.packageName,
        version: body.version,
        workspaceId: body.workspaceId,
      });
      json(res, 200, {
        operation: {
          id: result.correlationId ?? id,
          type: 'update' as const,
          status: 'completed' as const,
          asset: { packageName: body.packageName },
          plan,
          installed: result.installed,
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    } catch (error) {
      json(res, 200, {
        operation: {
          id,
          type: 'update' as const,
          status: 'failed' as const,
          asset: { packageName: body.packageName },
          error: errorDetails(error),
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    }
  }

  if (method === 'POST' && p === '/api/marketplace/uninstall') {
    const body = parseBody(await readBody(req));
    const id = identifier('uninstall');
    if (!body.packageName) {
      json(res, 400, { code: 'marketplace.invalid-reference', error: 'packageName is required' });
      return true;
    }
    try {
      const result = await ctx.marketplace.uninstall({
        packageName: body.packageName,
        workspaceId: body.workspaceId,
        dryRun: body.dryRun === true,
      });
      json(res, 200, {
        operation: {
          id: result.correlationId ?? id,
          type: 'uninstall' as const,
          status: result.status === 'planned' ? ('planning' as const) : ('completed' as const),
          asset: { packageName: body.packageName },
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    } catch (error) {
      json(res, 200, {
        operation: {
          id,
          type: 'uninstall' as const,
          status: 'failed' as const,
          asset: { packageName: body.packageName },
          error: errorDetails(error),
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    }
  }

  if (method === 'POST' && p === '/api/marketplace/verify') {
    const body = parseBody(await readBody(req));
    const id = identifier('verify');
    const ref = assetRef(body.reference ?? body.packageName);
    if (!ref.packageName) {
      json(res, 400, { code: 'marketplace.invalid-reference', error: 'reference is required' });
      return true;
    }
    try {
      const result = await ctx.marketplace.verify({ reference: ref });
      json(res, 200, {
        operation: {
          id: result.correlationId ?? id,
          type: 'verify' as const,
          status: 'completed' as const,
          asset: ref,
          error: result.message?.includes('mismatch')
            ? { code: 'marketplace.verify-failed', message: result.message }
            : undefined,
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    } catch (error) {
      json(res, 200, {
        operation: {
          id,
          type: 'verify' as const,
          status: 'failed' as const,
          asset: ref,
          error: errorDetails(error),
          createdAt: now(),
          updatedAt: now(),
        },
      });
      return true;
    }
  }

  return false;
}

function toDto(
  operation: MarketplaceOperation,
  type: MarketplaceOperation['operation'],
  asset: { publisherId?: string; packageName: string } | undefined,
  id: string | undefined,
): MarketplaceOperationDto {
  return {
    id: id ?? identifier(type),
    type,
    status: operation.status === 'planned' ? 'planning' : operation.status,
    asset,
    plan: operation.resolution ? planDto(operation) : undefined,
    createdAt: now(),
    updatedAt: now(),
  };
}

function parseBody(raw: string): MutationBody {
  try {
    return JSON.parse(raw || '{}') as MutationBody;
  } catch {
    return {};
  }
}

function searchQueryFromUrl(req: http.IncomingMessage): MarketplaceSearchQuery {
  const url = new URL(req.url ?? '', 'http://127.0.0.1');
  const typeValue = url.searchParams.get('type');
  const publisherValue = url.searchParams.get('publisher');
  const tagValue = url.searchParams.get('tag');
  const limit = Number(url.searchParams.get('limit') ?? '50');
  return {
    query: url.searchParams.get('q') ?? undefined,
    filters: {
      types: typeValue ? [typeValue as MarketplaceAsset['type']] : undefined,
      publisherIds: publisherValue ? [publisherValue] : undefined,
      tags: tagValue ? [tagValue] : undefined,
    },
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number(url.searchParams.get('offset') ?? '0') || undefined,
    sort: (url.searchParams.get('sort') as MarketplaceSearchQuery['sort']) ?? undefined,
  };
}

async function listAssets(ctx: WorkspaceContext, req: http.IncomingMessage): Promise<readonly MarketplaceAsset[]> {
  const url = new URL(req.url ?? '', 'http://127.0.0.1');
  const query: MarketplaceSearchQuery = {
    query: url.searchParams.get('q') ?? undefined,
    filters: undefined,
    limit: 1000,
  };
  const result = await ctx.marketplace.search(query);
  return result.items.map((hit) => hit.asset);
}

export type { MarketplaceAssetDetails, MarketplaceUpdateCandidate };
