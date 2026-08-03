import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { BaselineStore, BundleStore, CommandEvidenceCollector, EvidencePipeline } from '@vestara/evidence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleEvidenceRoute } from '../src/routes/evidence';
import type { WorkspaceContext } from '../src/workspace-context';

const COMMIT = 'b'.repeat(40);
const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

interface ResponseCapture {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

function capture(): { res: http.ServerResponse; response: ResponseCapture } {
  const response: ResponseCapture = { status: 0, body: undefined, headers: {} };
  const res = {
    writeHead(status: number, headers?: Record<string, string>) {
      response.status = status;
      response.headers = headers ?? {};
    },
    end(body?: string | Uint8Array) {
      if (body === undefined) return;
      const text = typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
      try {
        response.body = JSON.parse(text);
      } catch {
        response.body = text;
      }
    },
  } as unknown as http.ServerResponse;
  return { res, response };
}

function request(): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.headers = {};
  req.url = '';
  queueMicrotask(() => req.emit('end'));
  return req;
}

describe('evidence routes', () => {
  let ctx: WorkspaceContext;
  let executionId: string;
  let digest: string;
  let mediaType: string;

  beforeAll(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-evidence-routes-'));
    directories.push(root);
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const bundles = new BundleStore(path.join(root, 'bundles'));
    const baselines = new BaselineStore(path.join(root, 'baselines'));
    const pipeline = new EvidencePipeline({
      artifacts,
      manifests,
      bundles,
      collectors: [new CommandEvidenceCollector({ command: 'printf', args: ['evidence-bytes'] })],
    });
    const bundle = await pipeline.buildBundle({
      executionId: 'verification-route-1',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      checks: [{ id: 'cmd', name: 'Command', status: 'passed', summary: 'ok' }],
      workspaceRoot: root,
    });
    executionId = bundle.executionId;
    digest = bundle.evidence[0].ref;
    mediaType = bundle.evidence[0].mediaType;

    ctx = {
      evidenceBundles: bundles,
      evidenceManifests: manifests,
      evidenceArtifacts: artifacts,
      evidenceBaselines: baselines,
    } as unknown as WorkspaceContext;
  });

  async function call(pathValue: string) {
    const { res, response } = capture();
    const req = request();
    req.url = pathValue;
    const handled = await handleEvidenceRoute('GET', pathValue.split('?')[0], req, res, ctx);
    return { handled, response };
  }

  it('lists verification bundles', async () => {
    const { response } = await call('/api/evidence/bundles');
    expect(response.status).toBe(200);
    const bundles = (response.body as { bundles: Array<{ executionId: string }> }).bundles;
    expect(bundles.some((bundle) => bundle.executionId === executionId)).toBe(true);
  });

  it('returns a bundle with its manifest', async () => {
    const { response } = await call(`/api/evidence/bundles/${executionId}`);
    expect(response.status).toBe(200);
    const body = response.body as {
      bundle: { confidence: { score: number } };
      manifest: { checksum: { digest: string } };
    };
    expect(body.bundle.confidence.score).toBeGreaterThan(0);
    expect(body.manifest.checksum.digest).toBeTruthy();
  });

  it('returns 404 for an unknown bundle', async () => {
    const { response } = await call('/api/evidence/bundles/missing');
    expect(response.status).toBe(404);
  });

  it('serves content-addressed artifact bytes', async () => {
    const { response } = await call(`/api/evidence/artifacts/${digest}?mediaType=${encodeURIComponent(mediaType)}`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe(mediaType);
    expect(String(response.body)).toContain('evidence-bytes');
  });

  it('rejects a malformed digest', async () => {
    const { response } = await call('/api/evidence/artifacts/not-a-digest');
    expect(response.status).toBe(400);
  });

  it('lists visual baselines', async () => {
    const { response } = await call('/api/evidence/baselines');
    expect(response.status).toBe(200);
  });

  it('approves and rejects a baseline candidate (governance)', async () => {
    // record a candidate first
    const { response: recorded } = await call('/api/evidence/baselines');
    expect(recorded.status).toBe(200);

    async function post(pathValue: string, body: unknown) {
      const { res, response } = capture();
      const req = new EventEmitter() as unknown as http.IncomingMessage;
      req.headers = {};
      req.url = pathValue;
      queueMicrotask(() => {
        req.emit('data', Buffer.from(JSON.stringify(body)));
        req.emit('end');
      });
      const handled = await handleEvidenceRoute('POST', pathValue, req, res, ctx);
      return { handled, response };
    }

    const approved = await post('/api/evidence/baselines/dashboard/approve', {
      artifactDigest: 'c'.repeat(64),
      approvedBy: 'tester',
    });
    expect(approved.response.status).toBe(200);
    expect((approved.response.body as { baseline: { status: string } }).baseline.status).toBe('approved');

    const rejected = await post('/api/evidence/baselines/dashboard/reject', { approvedBy: 'tester' });
    expect(rejected.response.status).toBe(200);
    expect((rejected.response.body as { baseline: { status: string } }).baseline.status).toBe('rejected');
  });
});
