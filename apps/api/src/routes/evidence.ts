/**
 * Evidence routes — browse verification bundles and replay content-addressed
 * evidence artifacts (PCS-026).
 */

import { createHash } from 'node:crypto';
import type * as http from 'node:http';
import {
  isPlausibleStoredMediaType,
  isSvgMediaType,
  resolveArtifactAssociation,
  VisualIngestError,
} from '@vestara/evidence';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

/**
 * EVIDENCE-UX-002 M2 — original-image serving bound. Distinct from the M1
 * ingestion cap: the store may legitimately hold larger harness artifacts,
 * but a single HTTP response stays bounded to protect the event loop.
 */
const MAX_ORIGINAL_BYTES = 64 * 1024 * 1024;

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

  // GET /api/evidence/artifacts/:digest — content-addressed bytes (M2 hardened).
  //
  // Authority: digest → bundle/manifest association → store bytes. The legacy
  // ?mediaType= query is tolerated but never honored — Content-Type always
  // comes from validated stored evidence metadata. No filesystem path is ever
  // accepted; the digest regex plus server-side resolution is the isolation.
  const artifactMatch = p.match(/^\/api\/evidence\/artifacts\/([^/]+)$/);
  if (artifactMatch && method === 'GET') {
    if (!requireRole(_req, ctx, 'viewer', res)) return true;
    const digest = decodeURIComponent(artifactMatch[1]).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      json(res, 400, { error: 'invalid digest' });
      return true;
    }
    const association = resolveArtifactAssociation(ctx.evidenceBundles, ctx.evidenceManifests, digest);
    if (!association) {
      json(res, 404, { error: 'unknown evidence reference' });
      return true;
    }
    if (!isPlausibleStoredMediaType(association.mediaType)) {
      json(res, 500, { error: 'artifact has invalid stored media type' });
      return true;
    }
    if (isSvgMediaType(association.mediaType)) {
      json(res, 415, { error: 'SVG is not served inline' });
      return true;
    }
    const bytes = ctx.evidenceArtifacts.read(digest);
    if (!bytes) {
      json(res, 404, { error: 'artifact bytes missing' });
      return true;
    }
    if (bytes.byteLength > MAX_ORIGINAL_BYTES) {
      json(res, 413, { error: 'artifact exceeds serving bound' });
      return true;
    }
    if (createHash('sha256').update(bytes).digest('hex') !== digest) {
      json(res, 500, { error: 'artifact integrity failure' });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': association.mediaType,
      'Content-Length': bytes.byteLength,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(bytes);
    return true;
  }

  // GET /api/evidence/artifacts/:digest/thumbnail — bounded PNG presentation
  // derivative (M2). Deterministic from digest + spec, disk-cached, lazy. The
  // derivative is not evidence authority: the original digest is unchanged and
  // remains the identity. M2 decodes PNG only; other inline image types
  // deterministically report 415 until a vetted decoder lands.
  const thumbnailMatch = p.match(/^\/api\/evidence\/artifacts\/([^/]+)\/thumbnail$/);
  if (thumbnailMatch && method === 'GET') {
    if (!requireRole(_req, ctx, 'viewer', res)) return true;
    const digest = decodeURIComponent(thumbnailMatch[1]).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      json(res, 400, { error: 'invalid digest' });
      return true;
    }
    const association = resolveArtifactAssociation(ctx.evidenceBundles, ctx.evidenceManifests, digest);
    if (!association) {
      json(res, 404, { error: 'unknown evidence reference' });
      return true;
    }
    if (isSvgMediaType(association.mediaType)) {
      json(res, 415, { error: 'SVG thumbnails are not generated' });
      return true;
    }
    if (association.mediaType.toLowerCase() !== 'image/png') {
      json(res, 415, { error: `thumbnails support image/png in M2 (stored ${association.mediaType})` });
      return true;
    }
    const bytes = ctx.evidenceArtifacts.read(digest);
    if (!bytes) {
      json(res, 404, { error: 'artifact bytes missing' });
      return true;
    }
    try {
      const thumbnail = ctx.evidenceThumbnails.thumbnailFor(digest, new Uint8Array(bytes));
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': thumbnail.bytes.byteLength,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'X-Thumbnail-Cache': thumbnail.cached ? 'HIT' : 'MISS',
      });
      res.end(thumbnail.bytes);
    } catch (error) {
      if (error instanceof VisualIngestError) {
        const status = error.code === 'unsupported-media' ? 415 : error.code === 'too-large' ? 413 : 422;
        json(res, status, { error: error.message });
        return true;
      }
      json(res, 500, { error: 'thumbnail generation failure' });
    }
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
