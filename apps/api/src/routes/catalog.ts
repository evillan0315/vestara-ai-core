/**
 * VES-LEAN-003C: Capability Catalog API (read-only)
 *
 * Serves the read-only capability catalog.
 * Projects from RuntimeProfile + enrichment metadata.
 *
 * This is NOT an activation authority.
 * ActivationPlan remains the runtime activation authority.
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleCatalogRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: WorkspaceContext,
): Promise<boolean> {
  // Own only /api/catalog paths. The sequential dispatcher calls every handler;
  // returning true for non-catalog paths would swallow unrelated requests.
  if (!p.startsWith('/api/catalog')) return false;

  // Only GET is allowed — read-only catalog
  if (method !== 'GET') {
    json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Catalog is read-only.' } });
    return true;
  }

  // Lazy import to avoid loading catalog at boot
  const workspacePkg = await import('@vestara/workspace');
  const buildCapabilityCatalog = workspacePkg.buildCapabilityCatalog;
  const getCapability = workspacePkg.getCapability;
  const getCapabilitiesByParkingState = workspacePkg.getCapabilitiesByParkingState;
  const searchCapabilities = workspacePkg.searchCapabilities;

  // GET /api/catalog — full catalog
  if (p === '/api/catalog') {
    const profileId = extractQuery(req, 'profile') ?? 'dogfood';
    const catalog = buildCapabilityCatalog(profileId);
    json(res, 200, catalog);
    return true;
  }

  // GET /api/catalog/search?q=... — search (must come before /:id)
  if (p === '/api/catalog/search') {
    const query = extractQuery(req, 'q');
    if (!query) {
      json(res, 400, { error: { code: 'INVALID_ARGUMENT', message: 'Query parameter q is required.' } });
      return true;
    }
    const results = searchCapabilities(query);
    json(res, 200, { results, count: results.length });
    return true;
  }

  // GET /api/catalog/parked — parked capabilities (must come before /:id)
  if (p === '/api/catalog/parked') {
    const parked = getCapabilitiesByParkingState('parked');
    json(res, 200, { capabilities: parked, count: parked.length });
    return true;
  }

  // GET /api/catalog/:id — single capability (must come last)
  const idMatch = p.match(/^\/api\/catalog\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    const capability = getCapability(id);
    if (!capability) {
      json(res, 404, { error: { code: 'NOT_FOUND', message: `Capability '${id}' not found.` } });
      return true;
    }
    json(res, 200, capability);
    return true;
  }

  return false;
}

function extractQuery(req: http.IncomingMessage, key: string): string | undefined {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  return url.searchParams.get(key) ?? undefined;
}
