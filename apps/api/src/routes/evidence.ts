/**
 * Evidence routes — browse verification bundles and replay content-addressed
 * evidence artifacts (PCS-026).
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleEvidenceRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  // GET /api/evidence/bundles — recent verification bundles.
  if (method === 'GET' && p === '/api/evidence/bundles') {
    const limit = Number(new URL(_req.url ?? '', 'http://x').searchParams.get('limit') ?? 50) || 50;
    json(res, 200, { bundles: ctx.evidenceBundles.list().slice(0, limit) });
    return true;
  }

  // GET /api/evidence/bundles/:executionId — one bundle.
  const bundleMatch = p.match(/^\/api\/evidence\/bundles\/([^/]+)$/);
  if (bundleMatch && method === 'GET') {
    const executionId = decodeURIComponent(bundleMatch[1]);
    const bundle = ctx.evidenceBundles.read(executionId);
    if (!bundle) {
      json(res, 404, { error: 'bundle not found' });
      return true;
    }
    const manifest = ctx.evidenceManifests.read(bundle.manifestId);
    json(res, 200, { bundle, manifest });
    return true;
  }

  // GET /api/evidence/artifacts/:digest?mediaType= — content-addressed bytes.
  const artifactMatch = p.match(/^\/api\/evidence\/artifacts\/([^/]+)$/);
  if (artifactMatch && method === 'GET') {
    const digest = decodeURIComponent(artifactMatch[1]);
    if (!/^[0-9a-f]{64}$/i.test(digest)) {
      json(res, 400, { error: 'invalid digest' });
      return true;
    }
    const bytes = ctx.evidenceArtifacts.read(digest);
    if (!bytes) {
      json(res, 404, { error: 'artifact not found' });
      return true;
    }
    const mediaType = new URL(_req.url ?? '', 'http://x').searchParams.get('mediaType') ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mediaType,
      'Content-Length': bytes.byteLength,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.end(bytes);
    return true;
  }

  return false;
}
