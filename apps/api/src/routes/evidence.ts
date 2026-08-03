/**
 * Evidence routes — browse verification bundles and replay content-addressed
 * evidence artifacts (PCS-026).
 */

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

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

  // GET /api/evidence/baselines — visual baseline records awaiting/passed review.
  if (method === 'GET' && p === '/api/evidence/baselines') {
    json(res, 200, { baselines: ctx.evidenceBaselines.list() });
    return true;
  }

  // POST /api/evidence/baselines/:scenario/approve — promote a candidate baseline.
  const approveMatch = p.match(/^\/api\/evidence\/baselines\/([^/]+)\/approve$/);
  if (approveMatch && method === 'POST') {
    const scenarioKey = decodeURIComponent(approveMatch[1]);
    const raw = await readBody(_req);
    const body = raw ? ((JSON.parse(raw) as { artifactDigest?: string; approvedBy?: string }) ?? {}) : {};
    const artifactDigest = String(body.artifactDigest ?? '');
    const approvedBy = String(body.approvedBy ?? 'governance');
    if (!artifactDigest) {
      json(res, 400, { error: 'artifactDigest is required' });
      return true;
    }
    const record = ctx.evidenceBaselines.approve(scenarioKey, artifactDigest, approvedBy);
    json(res, 200, { baseline: record });
    return true;
  }

  // POST /api/evidence/baselines/:scenario/reject — reject a candidate baseline.
  const rejectMatch = p.match(/^\/api\/evidence\/baselines\/([^/]+)\/reject$/);
  if (rejectMatch && method === 'POST') {
    const scenarioKey = decodeURIComponent(rejectMatch[1]);
    const raw = await readBody(_req);
    const body = raw ? ((JSON.parse(raw) as { approvedBy?: string }) ?? {}) : {};
    const approvedBy = String(body.approvedBy ?? 'governance');
    const record = ctx.evidenceBaselines.reject(scenarioKey, approvedBy);
    json(res, 200, { baseline: record });
    return true;
  }

  return false;
}
