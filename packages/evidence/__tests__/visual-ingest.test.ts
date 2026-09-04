import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { BaselineStore } from '../src/baseline-store';
import { CommandEvidenceCollector } from '../src/collectors';
import { EvidencePipeline } from '../src/pipeline';
import { VerifierService } from '../src/verifier/verifier-service';
import { VisualEvidenceCollector } from '../src/visual-collector';
import {
  ingestVisualFile,
  inspectVisualBytes,
  resolveVisualSource,
  VisualFileCollector,
  VisualIngestError,
} from '../src/visual-ingest';

const COMMIT = 'b'.repeat(40);
const directories: string[] = [];

function tmpdir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

function workspace(): { root: string; workspaceRoot: string } {
  const root = tmpdir('visual-ingest-');
  const workspaceRoot = path.join(root, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  return { root, workspaceRoot };
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function solidPng(width: number, height: number, rgba: [number, number, number, number] = [10, 20, 30, 255]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = rgba[0];
    png.data[i * 4 + 1] = rgba[1];
    png.data[i * 4 + 2] = rgba[2];
    png.data[i * 4 + 3] = rgba[3];
  }
  return PNG.sync.write(png);
}

function minimalJpeg(width: number, height: number): Buffer {
  const header = Buffer.from([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x10, // APP0, length 16
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
  ]);
  const sof = Buffer.from([
    0xff,
    0xc0,
    0x00,
    0x0b, // SOF0, length 11
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x01,
    0x01,
    0x11,
    0x00, // one component
  ]);
  return Buffer.concat([header, sof, Buffer.from([0xff, 0xd9])]);
}

function webpVp8x(width: number, height: number): Buffer {
  const body = Buffer.alloc(10);
  body.writeUIntLE(width - 1, 4, 3);
  body.writeUIntLE(height - 1, 7, 3);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUIntLE(12 + 8 + body.length - 8, 4, 4);
  header.write('WEBP', 8);
  const chunk = Buffer.alloc(8);
  chunk.write('VP8X', 0);
  chunk.writeUIntLE(body.length, 4, 4);
  return Buffer.concat([header, chunk, body]);
}

function webpVp8Lossy(width: number, height: number): Buffer {
  const body = Buffer.alloc(10);
  body.writeUInt8(0x9d, 3);
  body.writeUInt8(0x01, 4);
  body.writeUInt8(0x2a, 5);
  body.writeUInt16LE(width, 6);
  body.writeUInt16LE(height, 8);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUIntLE(12 + 8 + body.length - 8, 4, 4);
  header.write('WEBP', 8);
  const chunk = Buffer.alloc(8);
  chunk.write('VP8 ', 0);
  chunk.writeUIntLE(body.length, 4, 4);
  return Buffer.concat([header, chunk, body]);
}

function webpVp8Lossless(width: number, height: number): Buffer {
  const packed = (width - 1) | ((height - 1) << 14);
  const body = Buffer.alloc(5);
  body.writeUInt8(0x2f, 0);
  body.writeUIntLE(packed, 1, 4);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0);
  header.writeUIntLE(12 + 8 + body.length + (body.length % 2) - 8, 4, 4);
  header.write('WEBP', 8);
  const chunk = Buffer.alloc(8);
  chunk.write('VP8L', 0);
  chunk.writeUIntLE(body.length, 4, 4);
  return Buffer.concat([header, chunk, body, Buffer.alloc(body.length % 2)]);
}

function writeFile(workspaceRoot: string, name: string, bytes: Uint8Array): string {
  const target = path.join(workspaceRoot, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  return name;
}

describe('visual media inspection (EVIDENCE-UX-002 M1)', () => {
  it('inspects PNG bytes with content-derived MIME and dimensions', () => {
    expect(inspectVisualBytes(new Uint8Array(solidPng(7, 9)))).toEqual({
      width: 7,
      height: 9,
      mediaType: 'image/png',
    });
  });

  it('inspects JPEG start-of-frame dimensions', () => {
    expect(inspectVisualBytes(new Uint8Array(minimalJpeg(320, 200)))).toEqual({
      width: 320,
      height: 200,
      mediaType: 'image/jpeg',
    });
  });

  it('inspects WebP VP8X, VP8 lossy, and VP8L dimensions', () => {
    expect(inspectVisualBytes(new Uint8Array(webpVp8x(5, 7)))).toEqual({
      width: 5,
      height: 7,
      mediaType: 'image/webp',
    });
    expect(inspectVisualBytes(new Uint8Array(webpVp8Lossy(11, 13)))).toEqual({
      width: 11,
      height: 13,
      mediaType: 'image/webp',
    });
    expect(inspectVisualBytes(new Uint8Array(webpVp8Lossless(17, 19)))).toEqual({
      width: 17,
      height: 19,
      mediaType: 'image/webp',
    });
  });

  it('ignores the file extension — content is the MIME authority', () => {
    const { workspaceRoot } = workspace();
    const name = writeFile(workspaceRoot, 'capture.bin', solidPng(3, 4));
    const artifacts = new ContentAddressedEvidenceStore(path.join(workspaceRoot, '..', 'store'));
    const result = ingestVisualFile({
      artifacts,
      sourceFile: name,
      workspaceRoot,
      producer: 'playwright',
      executionId: 'exec-extension',
    });
    expect(result.inspection.mediaType).toBe('image/png');
    expect(result.reference.mediaType).toBe('image/png');
  });

  it('takes dimensions from content, never filename conventions', () => {
    const { workspaceRoot } = workspace();
    writeFile(workspaceRoot, '320.png', solidPng(7, 9));
    const resolved = resolveVisualSource('320.png', workspaceRoot);
    const inspection = inspectVisualBytes(new Uint8Array(fs.readFileSync(resolved)));
    expect(inspection.width).toBe(7);
    expect(inspection.height).toBe(9);
  });

  it('rejects SVG without a security review, even misnamed', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>', 'utf8');
    expect(() => inspectVisualBytes(new Uint8Array(svg))).toThrowError(VisualIngestError);
    try {
      inspectVisualBytes(new Uint8Array(svg));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('unsupported-media');
    }
    const xml = Buffer.from('<?xml version="1.0"?><svg></svg>', 'utf8');
    expect(() => inspectVisualBytes(new Uint8Array(xml))).toThrowError(VisualIngestError);
  });

  it('rejects non-image bytes as unsupported media', () => {
    expect(() => inspectVisualBytes(new Uint8Array(Buffer.from('just some text', 'utf8')))).toThrowError(
      VisualIngestError,
    );
    expect(() => inspectVisualBytes(new Uint8Array(0))).toThrowError(VisualIngestError);
  });

  it('rejects truncated and structurally invalid images as malformed', () => {
    const full = solidPng(4, 4);
    // Truncated before IHDR completes.
    expect(() => inspectVisualBytes(new Uint8Array(full.slice(0, 20)))).toThrowError(VisualIngestError);
    // PNG signature but no IHDR.
    const noIhdr = Buffer.concat([full.slice(0, 8), Buffer.from([0, 0, 0, 13]), Buffer.from('IDAT')]);
    try {
      inspectVisualBytes(new Uint8Array(noIhdr));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('malformed-image');
    }
    // JPEG with SOI + EOI but no start-of-frame.
    const sofLess = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    expect(() => inspectVisualBytes(new Uint8Array(sofLess))).toThrowError(VisualIngestError);
    // RIFF container with no image chunk.
    const emptyWebp = Buffer.from('RIFF\x16\x00\x00\x00WEBPXXXX\x00\x00\x00\x00', 'binary');
    expect(() => inspectVisualBytes(new Uint8Array(emptyWebp))).toThrowError(VisualIngestError);
  });
});

describe('visual source boundary (EVIDENCE-UX-002 M1)', () => {
  it('rejects traversal outside the workspace root', () => {
    const { workspaceRoot } = workspace();
    expect(() => resolveVisualSource('../outside.png', workspaceRoot)).toThrowError(VisualIngestError);
    try {
      resolveVisualSource('sub/../../outside.png', workspaceRoot);
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('traversal');
    }
  });

  it('rejects absolute paths outside the workspace root', () => {
    const { workspaceRoot } = workspace();
    try {
      resolveVisualSource('/etc/hostname', workspaceRoot);
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('outside-workspace');
    }
  });

  it('rejects URLs and other external paths', () => {
    const { workspaceRoot } = workspace();
    for (const external of ['https://example.com/shot.png', 'data:image/png;base64,AAA', 'file:///tmp/x.png']) {
      try {
        resolveVisualSource(external, workspaceRoot);
        expect.unreachable(`accepted ${external}`);
      } catch (error) {
        expect((error as VisualIngestError).code).toBe('external-path');
      }
    }
  });

  it('rejects missing files and directories', () => {
    const { workspaceRoot } = workspace();
    try {
      ingestVisualFile({
        artifacts: new ContentAddressedEvidenceStore(path.join(workspaceRoot, '..', 'store')),
        sourceFile: 'nope.png',
        workspaceRoot,
        producer: 'playwright',
        executionId: 'exec-missing',
      });
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('missing-file');
    }
    fs.mkdirSync(path.join(workspaceRoot, 'adir'));
    expect(() => resolveVisualSource('adir', workspaceRoot)).toThrowError(VisualIngestError);
  });
});

describe('generic visual ingestion (EVIDENCE-UX-002 M1)', () => {
  it('creates an ordinary screenshot EvidenceReference with provenance and visual metadata', () => {
    const { root, workspaceRoot } = workspace();
    const name = writeFile(workspaceRoot, 'shots/narrow.png', solidPng(6, 8));
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'store'));
    const result = ingestVisualFile({
      artifacts,
      sourceFile: name,
      workspaceRoot,
      producer: 'playwright',
      executionId: 'exec-proof',
      operation: 'contract-fixture visual acceptance',
    });

    expect(result.ref.kind).toBe('screenshot');
    expect(result.ref.mediaType).toBe('image/png');
    expect(result.ref.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(result.ref.size).toBe(solidPng(6, 8).byteLength);
    expect(result.ref.metadata).toEqual({ visual: { width: 6, height: 8, mediaType: 'image/png' } });

    expect(result.reference.kind).toBe('screenshot');
    expect(result.reference.ref).toBe(result.ref.digest);
    expect(result.reference.provenance.producer).toBe('playwright');
    expect(result.reference.provenance.executionId).toBe('exec-proof');
    expect(result.reference.provenance.operation).toBe('contract-fixture visual acceptance');
    expect(result.reference.provenance.contentHash).toBe(result.ref.digest);
    expect(result.reference.visual).toEqual({ width: 6, height: 8, mediaType: 'image/png' });
    expect(result.repositoryRelativePath).toBe(path.join('shots', 'narrow.png'));
  });

  it('copies immutable bytes — the store survives deletion of the producer file', () => {
    const { root, workspaceRoot } = workspace();
    const bytes = solidPng(5, 5);
    const name = writeFile(workspaceRoot, 'shot.png', bytes);
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'store'));
    const result = ingestVisualFile({
      artifacts,
      sourceFile: name,
      workspaceRoot,
      producer: 'playwright',
      executionId: 'exec-persist',
    });

    // Stored bytes are exactly the producer bytes (authority transfer proof).
    expect(Buffer.from(artifacts.read(result.ref.digest) ?? [])).toEqual(Buffer.from(bytes));
    expect(artifacts.verify(result.ref)).toBe(true);

    // Deleting the producer file leaves the evidence intact.
    fs.rmSync(path.join(workspaceRoot, name));
    expect(artifacts.has(result.ref.digest)).toBe(true);
    expect(Buffer.from(artifacts.read(result.ref.digest) ?? [])).toEqual(Buffer.from(bytes));
    expect(artifacts.verify(result.ref)).toBe(true);
  });

  it('keeps digests stable for identical bytes — metadata never alters identity', () => {
    const { root, workspaceRoot } = workspace();
    const bytes = solidPng(4, 6);
    writeFile(workspaceRoot, 'a.png', bytes);
    writeFile(workspaceRoot, 'b.png', bytes);
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'store'));
    const first = ingestVisualFile({
      artifacts,
      sourceFile: 'a.png',
      workspaceRoot,
      producer: 'playwright',
      executionId: 'exec-a',
      operation: 'first context',
    });
    const second = ingestVisualFile({
      artifacts,
      sourceFile: 'b.png',
      workspaceRoot,
      producer: 'other-producer',
      executionId: 'exec-b',
      operation: 'second context',
    });
    expect(second.ref.digest).toBe(first.ref.digest);
    expect(second.reference.ref).toBe(first.reference.ref);
    // Same bytes put directly with unrelated metadata hash identically.
    const direct = artifacts.put({
      content: bytes,
      mediaType: 'image/png',
      kind: 'screenshot',
      summary: 'unrelated summary',
      metadata: { note: 'different metadata entirely' },
    });
    expect(direct.digest).toBe(first.ref.digest);
  });

  it('rejects oversized sources before reading them as images', () => {
    const { workspaceRoot } = workspace();
    const target = path.join(workspaceRoot, 'huge.png');
    fs.writeFileSync(target, Buffer.alloc(26 * 1024 * 1024));
    try {
      resolveVisualSource('huge.png', workspaceRoot);
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('too-large');
    }
  });
});

describe('pipeline + verification separation (EVIDENCE-UX-002 M1)', () => {
  it('associates collector screenshots with a bundle while keeping manifest integrity', async () => {
    const { root, workspaceRoot } = workspace();
    writeFile(workspaceRoot, 'matrix.png', solidPng(8, 8));
    writeFile(workspaceRoot, 'narrow.png', minimalJpeg(16, 12));
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const pipeline = new EvidencePipeline({
      artifacts,
      manifests,
      collectors: [new VisualFileCollector({ files: ['matrix.png', 'narrow.png'], operation: 'visual acceptance' })],
      producer: 'harness-verifier',
      environment: 'test-env',
    });

    const bundle = await pipeline.buildBundle({
      executionId: 'visual-bundle-1',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'inconclusive',
      checks: [{ id: 'visual', name: 'Visual', status: 'skipped', summary: 'viewing only' }],
      workspaceRoot,
    });

    expect(bundle.evidence).toHaveLength(2);
    const kinds = new Set(bundle.evidence.map((ref) => ref.kind));
    expect(kinds).toEqual(new Set(['screenshot']));
    expect(bundle.evidence.map((ref) => ref.visual)).toEqual([
      { width: 8, height: 8, mediaType: 'image/png' },
      { width: 16, height: 12, mediaType: 'image/jpeg' },
    ]);
    expect(manifests.verify('visual-bundle-1')).toBe(true);
    expect(manifests.verifyArtifacts('visual-bundle-1', artifacts).valid).toBe(true);
    const manifest = manifests.read('visual-bundle-1');
    expect(manifest?.artifacts.map((artifact) => artifact.metadata)).toEqual([
      expect.objectContaining({ visual: { width: 8, height: 8, mediaType: 'image/png' } }),
      expect.objectContaining({ visual: { width: 16, height: 12, mediaType: 'image/jpeg' } }),
    ]);
  });

  it('leaves existing non-visual evidence untouched', async () => {
    const { root, workspaceRoot } = workspace();
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const pipeline = new EvidencePipeline({
      artifacts,
      manifests,
      collectors: [new CommandEvidenceCollector({ command: 'printf', args: ['evidence-bytes'] })],
    });
    const bundle = await pipeline.buildBundle({
      executionId: 'non-visual-1',
      verifierId: 'verifier',
      profileId: 'focused',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      checks: [{ id: 'cmd', name: 'Command', status: 'passed', summary: 'ok' }],
      workspaceRoot,
    });
    expect(bundle.evidence).toHaveLength(1);
    expect(bundle.evidence[0].kind).toBe('command');
    expect(bundle.evidence[0].visual).toBeUndefined();
    const manifest = manifests.read('non-visual-1');
    expect(manifest?.artifacts[0]?.metadata).toEqual({
      operation: 'printf',
      relatedTo: undefined,
      producer: 'evidence-pipeline',
    });
  });

  it('never lets a screenshot imply verification PASS', async () => {
    const { root, workspaceRoot } = workspace();
    writeFile(workspaceRoot, 'shot.png', solidPng(4, 4));
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const manifests = new ImmutableEvidenceManifestStore(path.join(root, 'manifests'));
    const pipeline = new EvidencePipeline({
      artifacts,
      manifests,
      collectors: [new VisualFileCollector({ files: ['shot.png'] })],
    });
    const bundle = await pipeline.buildBundle({
      executionId: 'visual-no-pass',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'failed',
      checks: [{ id: 'visual-check', name: 'Visual check', status: 'failed', summary: 'human review pending' }],
      workspaceRoot,
    });

    // Structural: references carry no verdict/status of their own.
    for (const ref of bundle.evidence) {
      expect('status' in ref).toBe(false);
      expect('verdict' in ref).toBe(false);
    }
    // Semantic: a required criterion over the failed check cannot verify.
    const service = new VerifierService();
    const verdict = service.evaluate(
      bundle,
      [
        {
          id: 'visual-human-review',
          description: 'human reviews the screenshot',
          required: true,
          expectEvidenceKinds: ['screenshot'],
          requireChecksPassed: ['visual-check'],
        },
      ],
      'screenshots look right',
    );
    expect(verdict.status).not.toBe('VERIFIED');
    expect(verdict.status).toBe('FAILED');
  });

  it('keeps visual-comparison compatible with ingested screenshots', async () => {
    const { root, workspaceRoot } = workspace();
    const bytes = solidPng(4, 4);
    writeFile(workspaceRoot, 'candidate.png', bytes);
    const artifacts = new ContentAddressedEvidenceStore(path.join(root, 'artifacts'));
    const baselines = new BaselineStore(path.join(root, 'baselines'));

    const ingested = ingestVisualFile({
      artifacts,
      sourceFile: 'candidate.png',
      workspaceRoot,
      producer: 'playwright',
      executionId: 'exec-baseline',
    });
    baselines.approve('/shots@4x4@dark', ingested.ref.digest, 'human-reviewer');

    const collector = new VisualEvidenceCollector({
      source: { name: 'mock-browser', captureScreenshot: async () => new Uint8Array(bytes) },
      baselines,
      artifacts,
      scenario: { url: '/shots', viewport: { width: 4, height: 4 }, theme: 'dark' },
    });
    const { items } = await collector.collect({ executionId: 'exec-compare', workspaceRoot });
    expect(items.map((item) => item.kind).sort()).toEqual(['screenshot', 'visual-comparison']);
    expect(JSON.parse(String(items[1]?.content)) as { status: string }).toMatchObject({ status: 'pass' });
  });
});
