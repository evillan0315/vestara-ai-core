import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as zlib from 'node:zlib';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { BaselineStore, BundleStore, ThumbnailService, type VerificationEvidenceBundle } from '@vestara/evidence';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleEvidenceRoute } from '../src/routes/evidence';
import type { WorkspaceContext } from '../src/workspace-context';

// Minimal test-local PNG codec (no new dependencies): solid-color encoder plus
// an IHDR dimension reader for assertions. Thumbnails are in-memory PNGs, so
// header parsing is sufficient — pixel equality is proven at the service layer.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4);
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])), 8 + data.length);
  return out;
}

function solidPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + width * 3)] = 0; // filter byte: none
    for (let x = 0; x < width; x += 1) {
      raw[y * (1 + width * 3) + 1 + x * 3] = 200;
      raw[y * (1 + width * 3) + 1 + x * 3 + 1] = 100;
      raw[y * (1 + width * 3) + 1 + x * 3 + 2] = 50;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngDims(bytes: Uint8Array): { width: number; height: number } {
  const view = Buffer.from(bytes);
  if (view.length < 33 || view.readUInt32BE(8) !== 13 || view.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('not a PNG with an IHDR head');
  }
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const M4A_DIR = path.join('apps', 'workspace', 'tests', 'visual', '.artifacts', 'ga-ux-premium-m4a');
const M4A_FILES = ['m4a-fixture-matrix.png', 'm4a-narrow-containment.png', 'm4a-expanded-width.png'];

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

interface ResponseCapture {
  status: number;
  body: Buffer | undefined;
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
      response.body = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body);
    },
  } as unknown as http.ServerResponse;
  return { res, response };
}

function request(headers: Record<string, string> = {}): http.IncomingMessage {
  const req = new EventEmitter() as unknown as http.IncomingMessage;
  req.headers = headers;
  req.url = '';
  queueMicrotask(() => req.emit('end'));
  return req;
}

function minimalJpeg(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

function minimalWebp(): Buffer {
  const body = Buffer.alloc(10);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUIntLE(12 + 8 + body.length - 8, 4, 4);
  header.write('WEBP', 8);
  const chunk = Buffer.alloc(8);
  chunk.write('VP8X', 0);
  chunk.writeUIntLE(body.length, 4, 4);
  return Buffer.concat([header, chunk, body]);
}

interface Fixture {
  ctx: WorkspaceContext;
  pngLandscape: string;
  pngPortrait: string;
  pngTiny: string;
  jpeg: string;
  webp: string;
  text: string;
  svg: string;
  unreferenced: string;
  missing: string;
  corrupt: string;
  oversized: string;
  malformedPng: string;
  manifestOnly: string;
  pngBytes: Buffer;
  portraitBytes: Buffer;
  tinyBytes: Buffer;
}

function writeBundle(
  bundles: BundleStore,
  executionId: string,
  refs: Array<{ digest: string; mediaType: string; kind: string; size: number; summary: string }>,
): void {
  const createdAt = new Date().toISOString();
  const bundle: VerificationEvidenceBundle = {
    id: `bundle-${executionId}`,
    executionId,
    verifierId: 'verifier',
    profileId: 'standard',
    manifestId: executionId,
    evidence: refs.map((ref) => ({
      ref: ref.digest,
      kind: ref.kind as VerificationEvidenceBundle['evidence'][number]['kind'],
      mediaType: ref.mediaType,
      size: ref.size,
      summary: ref.summary,
      provenance: {
        producer: 'fixture',
        executionId,
        createdAt,
        environment: 'test',
        contentHash: ref.digest,
      },
    })),
    checks: [],
    replay: { mode: 'artifact', steps: [], requires: {} },
    confidence: { score: 0, level: 'low', factors: [], limitations: [] },
    createdAt,
  };
  bundles.write(bundle);
}

let fixture: Fixture;

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-visual-serving-'));
  directories.push(root);
  const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
  const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
  const bundles = new BundleStore(path.join(root, 'bundles'));
  const baselines = new BaselineStore(path.join(root, 'baselines'));
  const thumbnails = new ThumbnailService(path.join(root, 'derivatives'));

  const pngBytes = solidPng(1280, 720);
  const portraitBytes = solidPng(480, 900);
  const tinyBytes = solidPng(100, 80);
  const jpegBytes = minimalJpeg(640, 480);
  const webpBytes = minimalWebp();
  const textBytes = Buffer.from('hello log output', 'utf8');
  const svgBytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
  const malformedBytes = Buffer.concat([solidPng(8, 8).slice(0, 40)]);
  const oversizedBytes = Buffer.alloc(65 * 1024 * 1024, 7);

  const put = (content: Uint8Array, mediaType: string, kind: string, summary: string) =>
    artifacts.put({ content, mediaType, kind, summary });
  const png = put(pngBytes, 'image/png', 'screenshot', 'landscape');
  const portrait = put(portraitBytes, 'image/png', 'screenshot', 'portrait');
  const tiny = put(tinyBytes, 'image/png', 'screenshot', 'tiny');
  const jpeg = put(jpegBytes, 'image/jpeg', 'screenshot', 'photo');
  const webp = put(webpBytes, 'image/webp', 'screenshot', 'anim');
  const text = put(textBytes, 'text/plain', 'command', 'log');
  const svg = put(svgBytes, 'image/svg+xml', 'screenshot', 'vector');
  const malformed = put(malformedBytes, 'image/png', 'screenshot', 'broken');
  const oversized = put(oversizedBytes, 'application/octet-stream', 'command', 'huge');
  const manifestOnlyRef = put(Buffer.from('manifest bytes', 'utf8'), 'text/plain', 'command', 'manifest-log');
  const unreferenced = put(Buffer.from('orphan bytes', 'utf8'), 'text/plain', 'command', 'orphan');

  writeBundle(bundles, 'visual-serving-1', [
    { digest: png.digest, mediaType: 'image/png', kind: 'screenshot', size: png.size, summary: 'landscape' },
    { digest: portrait.digest, mediaType: 'image/png', kind: 'screenshot', size: portrait.size, summary: 'portrait' },
    { digest: tiny.digest, mediaType: 'image/png', kind: 'screenshot', size: tiny.size, summary: 'tiny' },
    { digest: jpeg.digest, mediaType: 'image/jpeg', kind: 'screenshot', size: jpeg.size, summary: 'photo' },
    { digest: webp.digest, mediaType: 'image/webp', kind: 'screenshot', size: webp.size, summary: 'anim' },
    { digest: text.digest, mediaType: 'text/plain', kind: 'command', size: text.size, summary: 'log' },
    { digest: svg.digest, mediaType: 'image/svg+xml', kind: 'screenshot', size: svg.size, summary: 'vector' },
    {
      digest: malformed.digest,
      mediaType: 'image/png',
      kind: 'screenshot',
      size: malformed.size,
      summary: 'broken',
    },
    {
      digest: oversized.digest,
      mediaType: 'application/octet-stream',
      kind: 'command',
      size: oversized.size,
      summary: 'huge',
    },
  ]);
  manifests.write({
    runId: 'manifest-visual-1',
    repository: '/repo',
    implementationCommit: 'd'.repeat(40),
    verifiedBy: 'verifier',
    scope: [],
    limitations: [],
    commands: [],
    artifacts: [manifestOnlyRef],
    outcome: 'passed',
    correlationId: 'manifest-visual-1',
  });

  // Corrupt bytes: valid association, garbage on disk (integrity failure).
  const corruptDigest = 'a'.repeat(64);
  writeBundle(bundles, 'visual-corrupt-1', [
    { digest: corruptDigest, mediaType: 'image/png', kind: 'screenshot', size: 4, summary: 'corrupt' },
  ]);
  const corruptPath = path.join(root, 'artifacts', 'sha256', corruptDigest.slice(0, 2), corruptDigest);
  fs.mkdirSync(path.dirname(corruptPath), { recursive: true });
  fs.writeFileSync(corruptPath, Buffer.from('junk', 'utf8'));

  // Referenced but absent from the store.
  const missingDigest = 'e'.repeat(64);
  writeBundle(bundles, 'visual-missing-1', [
    { digest: missingDigest, mediaType: 'image/png', kind: 'screenshot', size: 4, summary: 'ghost' },
  ]);

  fixture = {
    ctx: {
      evidenceBundles: bundles,
      evidenceManifests: manifests,
      evidenceArtifacts: artifacts,
      evidenceBaselines: baselines,
      evidenceThumbnails: thumbnails,
    } as unknown as WorkspaceContext,
    pngLandscape: png.digest,
    pngPortrait: portrait.digest,
    pngTiny: tiny.digest,
    jpeg: jpeg.digest,
    webp: webp.digest,
    text: text.digest,
    svg: svg.digest,
    unreferenced: unreferenced.digest,
    missing: missingDigest,
    corrupt: corruptDigest,
    oversized: oversized.digest,
    malformedPng: malformed.digest,
    manifestOnly: manifestOnlyRef.digest,
    pngBytes,
    portraitBytes,
    tinyBytes,
  };
});

async function call(pathValue: string, headers: Record<string, string> = {}, ctx?: WorkspaceContext) {
  const { res, response } = capture();
  const req = request(headers);
  req.url = pathValue;
  const handled = await handleEvidenceRoute('GET', pathValue.split('?')[0], req, res, ctx ?? fixture.ctx);
  return { handled, response };
}

function bodyJson(response: ResponseCapture): { error?: string } {
  return JSON.parse((response.body ?? Buffer.alloc(0)).toString('utf8')) as { error?: string };
}

describe('original artifact serving (EVIDENCE-UX-002 M2)', () => {
  it('serves PNG originals with stored Content-Type, nosniff, and immutable cache', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.pngLandscape}`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('image/png');
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(response.headers['Cache-Control']).toBe('public, max-age=31536000, immutable');
    expect(response.body).toEqual(fixture.pngBytes);
  });

  it('serves JPEG and WebP originals with their stored types', async () => {
    const jpeg = await call(`/api/evidence/artifacts/${fixture.jpeg}`);
    expect(jpeg.response.status).toBe(200);
    expect(jpeg.response.headers['Content-Type']).toBe('image/jpeg');
    const webp = await call(`/api/evidence/artifacts/${fixture.webp}`);
    expect(webp.response.status).toBe(200);
    expect(webp.response.headers['Content-Type']).toBe('image/webp');
  });

  it('ignores spoofed query media types — stored metadata is the authority', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.pngLandscape}?mediaType=text/html`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('image/png');
  });

  it('leaves existing nonvisual evidence serving unaffected', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.text}?mediaType=text/plain`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/plain');
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(response.body?.toString('utf8')).toContain('hello log output');
  });

  it('serves manifest-only associations', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.manifestOnly}`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('text/plain');
  });

  it('refuses SVG inline rendering', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.svg}`);
    expect(response.status).toBe(415);
    expect(bodyJson(response).error).toContain('SVG');
  });

  it('rejects malformed and traversal-shaped digests', async () => {
    const bad = await call('/api/evidence/artifacts/not-a-digest');
    expect(bad.response.status).toBe(400);
    const traversal = await call('/api/evidence/artifacts/..%2F..%2Fetc');
    expect(traversal.response.status).toBe(400);
  });

  it('makes raw filesystem paths impossible (no route match)', async () => {
    const { handled } = await call('/api/evidence/artifacts/abc/def');
    expect(handled).toBe(false);
  });

  it('rejects unknown digests without oracle detail', async () => {
    const { response } = await call(`/api/evidence/artifacts/${'f'.repeat(64)}`);
    expect(response.status).toBe(404);
    expect(bodyJson(response).error).toBe('unknown evidence reference');
  });

  it('rejects stored-but-unreferenced digests (hash oracle closed)', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.unreferenced}`);
    expect(response.status).toBe(404);
    expect(bodyJson(response).error).toBe('unknown evidence reference');
  });

  it('reports referenced-but-missing bytes distinctly', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.missing}`);
    expect(response.status).toBe(404);
    expect(bodyJson(response).error).toBe('artifact bytes missing');
  });

  it('fails closed on digest mismatch without serving bytes', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.corrupt}`);
    expect(response.status).toBe(500);
    expect(bodyJson(response).error).toBe('artifact integrity failure');
  });

  it('rejects oversized originals with 413', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.oversized}`);
    expect(response.status).toBe(413);
  });

  it('rejects callers below the viewer role', async () => {
    const revoked = {
      ...fixture.ctx,
      users: { findByToken: () => ({ id: 'x', username: 'x', role: 'revoked' }) },
    } as unknown as WorkspaceContext;
    const { response } = await call(
      `/api/evidence/artifacts/${fixture.pngLandscape}`,
      { authorization: 'Bearer revoked-token' },
      revoked,
    );
    expect(response.status).toBe(403);
  });

  it('serves original bytes byte-identical to the store source', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.pngPortrait}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(fixture.portraitBytes);
  });
});

describe('thumbnail derivatives (EVIDENCE-UX-002 M2)', () => {
  it('generates a bounded aspect-preserving PNG thumbnail', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.pngLandscape}/thumbnail`);
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('image/png');
    expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(response.headers['X-Thumbnail-Cache']).toBe('MISS');
    const decoded = pngDims(response.body ?? Buffer.alloc(0));
    expect(decoded.width).toBe(480);
    expect(decoded.height).toBe(270);
  });

  it('keeps portraits portrait without cropping', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.pngPortrait}/thumbnail`);
    expect(response.status).toBe(200);
    const decoded = pngDims(response.body ?? Buffer.alloc(0));
    expect(decoded.width).toBe(256);
    expect(decoded.height).toBe(480);
    expect(decoded.height).toBeGreaterThan(decoded.width);
  });

  it('does not upscale tiny images', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.pngTiny}/thumbnail`);
    expect(response.status).toBe(200);
    const decoded = pngDims(response.body ?? Buffer.alloc(0));
    expect(decoded.width).toBe(100);
    expect(decoded.height).toBe(80);
  });

  it('hits the cache deterministically on repeat requests', async () => {
    const first = await call(`/api/evidence/artifacts/${fixture.pngLandscape}/thumbnail`);
    const second = await call(`/api/evidence/artifacts/${fixture.pngLandscape}/thumbnail`);
    expect(second.response.status).toBe(200);
    expect(second.response.headers['X-Thumbnail-Cache']).toBe('HIT');
    expect(second.response.body).toEqual(first.response.body);
    expect(first.response.headers['Content-Length']).toBe(second.response.headers['Content-Length']);
  });

  it('rejects JPEG and SVG thumbnails deterministically in M2', async () => {
    const jpeg = await call(`/api/evidence/artifacts/${fixture.jpeg}/thumbnail`);
    expect(jpeg.response.status).toBe(415);
    const svg = await call(`/api/evidence/artifacts/${fixture.svg}/thumbnail`);
    expect(svg.response.status).toBe(415);
    expect(bodyJson(svg.response).error).toContain('SVG');
  });

  it('fails closed on malformed images without placeholder bytes', async () => {
    const { response } = await call(`/api/evidence/artifacts/${fixture.malformedPng}/thumbnail`);
    expect(response.status).toBe(422);
    expect(bodyJson(response).error).toBeTruthy();
  });

  it('ignores remote-fetch-looking query parameters', async () => {
    const { response } = await call(
      `/api/evidence/artifacts/${fixture.pngTiny}/thumbnail?url=https://example.com/evil.png&src=/etc/passwd`,
    );
    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('image/png');
    const decoded = pngDims(response.body ?? Buffer.alloc(0));
    expect(decoded.width).toBe(100);
    expect(decoded.height).toBe(80);
  });

  it('rejects unknown digests for thumbnails', async () => {
    const { response } = await call(`/api/evidence/artifacts/${'f'.repeat(64)}/thumbnail`);
    expect(response.status).toBe(404);
  });
});

describe('M4A serving proof from an isolated store (EVIDENCE-UX-002 M2)', () => {
  it('serves 3/3 M4A originals byte-identical without the producer source', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-m4a-serving-'));
    directories.push(root);
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const bundles = new BundleStore(path.join(root, 'bundles'));
    const baselines = new BaselineStore(path.join(root, 'baselines'));
    const thumbnails = new ThumbnailService(path.join(root, 'derivatives'));

    // Ingest copies bytes in; from here only the isolated store is consulted.
    const sources = M4A_FILES.map((file) => fs.readFileSync(path.join(REPO_ROOT, M4A_DIR, file)));
    const refs = sources.map((bytes, index) =>
      artifacts.put({
        content: bytes,
        mediaType: 'image/png',
        kind: 'screenshot',
        summary: `screenshot: ${M4A_FILES[index]}`,
      }),
    );
    writeBundle(
      bundles,
      'm4a-serving-1',
      refs.map((ref, index) => ({
        digest: ref.digest,
        mediaType: 'image/png',
        kind: 'screenshot',
        size: ref.size,
        summary: `screenshot: ${M4A_FILES[index]}`,
      })),
    );
    const isolated = {
      evidenceBundles: bundles,
      evidenceManifests: manifests,
      evidenceArtifacts: artifacts,
      evidenceBaselines: baselines,
      evidenceThumbnails: thumbnails,
    } as unknown as WorkspaceContext;

    expect(refs.map((ref) => ref.digest)).toHaveLength(3);
    for (const [index, ref] of refs.entries()) {
      const { response } = await call(`/api/evidence/artifacts/${ref.digest}`, {}, isolated);
      expect(response.status).toBe(200);
      expect(response.headers['Content-Type']).toBe('image/png');
      expect(response.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(response.body).toEqual(sources[index]);
    }
  });

  it('serves 3/3 M4A thumbnails bounded and aspect-preserving', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-m4a-thumbs-'));
    directories.push(root);
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const bundles = new BundleStore(path.join(root, 'bundles'));
    const baselines = new BaselineStore(path.join(root, 'baselines'));
    const thumbnails = new ThumbnailService(path.join(root, 'derivatives'));

    const sources = M4A_FILES.map((file) => fs.readFileSync(path.join(REPO_ROOT, M4A_DIR, file)));
    const refs = sources.map((bytes, index) =>
      artifacts.put({ content: bytes, mediaType: 'image/png', kind: 'screenshot', summary: M4A_FILES[index] ?? 'm4a' }),
    );
    writeBundle(
      bundles,
      'm4a-thumbs-1',
      refs.map((ref) => ({
        digest: ref.digest,
        mediaType: 'image/png',
        kind: 'screenshot',
        size: ref.size,
        summary: 'm4a',
      })),
    );
    const isolated = {
      evidenceBundles: bundles,
      evidenceManifests: manifests,
      evidenceArtifacts: artifacts,
      evidenceBaselines: baselines,
      evidenceThumbnails: thumbnails,
    } as unknown as WorkspaceContext;

    // Source dimensions: matrix 1280x720, narrow 480x900, expanded 1280x900.
    const expected = [
      [480, 270],
      [256, 480],
      [480, 337],
    ] as const;
    for (const [index, ref] of refs.entries()) {
      const first = await call(`/api/evidence/artifacts/${ref.digest}/thumbnail`, {}, isolated);
      expect(first.response.status).toBe(200);
      expect(first.response.headers['Content-Type']).toBe('image/png');
      const decoded = pngDims(first.response.body ?? Buffer.alloc(0));
      expect([decoded.width, decoded.height]).toEqual([expected[index]?.[0], expected[index]?.[1]]);
      const second = await call(`/api/evidence/artifacts/${ref.digest}/thumbnail`, {}, isolated);
      expect(second.response.headers['X-Thumbnail-Cache']).toBe('HIT');
      expect(second.response.body).toEqual(first.response.body);
    }
  });
});
