import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { BundleStore } from '../src/bundle-store';
import { EvidencePipeline } from '../src/pipeline';
import type { VerificationEvidenceBundle } from '../src/types';
import type { VisualIngestError } from '../src/visual-ingest';
import {
  DEFAULT_THUMBNAIL_SPEC,
  isInlineImageMediaType,
  isPlausibleStoredMediaType,
  isSvgMediaType,
  resolveArtifactAssociation,
  ThumbnailService,
  thumbnailSpecId,
} from '../src/visual-serve';

const COMMIT = 'c'.repeat(40);
const directories: string[] = [];

function tmpdir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  directories.push(dir);
  return dir;
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function solidPng(width: number, height: number): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i += 1) {
    png.data[i * 4] = 10;
    png.data[i * 4 + 1] = 20;
    png.data[i * 4 + 2] = 30;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** PNG header claiming enormous dimensions with no body behind it. */
function bombHeaderPng(): Buffer {
  const out = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out, 0);
  out.writeUInt32BE(13, 8);
  out.write('IHDR', 12);
  out.writeUInt32BE(10000, 16);
  out.writeUInt32BE(10000, 20);
  return out;
}

function stores() {
  const root = tmpdir('visual-serve-');
  return {
    root,
    artifacts: new ContentAddressedEvidenceStore(path.join(root, 'artifacts')),
    manifests: new ImmutableEvidenceManifestStore(path.join(root, 'manifests')),
    bundles: new BundleStore(path.join(root, 'bundles')),
    thumbnails: new ThumbnailService(path.join(root, 'derivatives')),
  };
}

describe('artifact association (EVIDENCE-UX-002 M2)', () => {
  it('resolves bundle references with stored media authority', async () => {
    const { root, artifacts, manifests, bundles } = stores();
    const pipeline = new EvidencePipeline({
      artifacts,
      manifests,
      bundles,
      collectors: [],
    });
    const bundle = await pipeline.buildBundle({
      executionId: 'assoc-1',
      verifierId: 'verifier',
      profileId: 'standard',
      repository: '/repo',
      implementationCommit: COMMIT,
      outcome: 'passed',
      checks: [],
      workspaceRoot: root,
    });
    expect(bundle.evidence).toHaveLength(0);
    const ref = artifacts.put({
      content: solidPng(4, 4),
      mediaType: 'image/png',
      kind: 'screenshot',
      summary: 'shot',
    });
    const withEvidence: VerificationEvidenceBundle = {
      ...bundle,
      evidence: [
        {
          ref: ref.digest,
          kind: 'screenshot',
          mediaType: 'image/png',
          size: ref.size,
          summary: 'shot',
          provenance: {
            producer: 'p',
            executionId: 'assoc-1',
            createdAt: new Date().toISOString(),
            environment: 'test',
            contentHash: ref.digest,
          },
        },
      ],
    };
    bundles.write({ ...withEvidence, executionId: 'assoc-2', id: 'bundle-assoc-2' });
    const found = resolveArtifactAssociation(bundles, manifests, ref.digest);
    expect(found).toMatchObject({
      mediaType: 'image/png',
      kind: 'screenshot',
      size: ref.size,
      executionId: 'assoc-2',
      source: 'bundle',
    });
  });

  it('falls back to manifest entries and matches digests case-insensitively', () => {
    const { artifacts, manifests, bundles } = stores();
    const ref = artifacts.put({ content: 'log bytes', mediaType: 'text/plain', kind: 'command', summary: 'log' });
    manifests.write({
      runId: 'manifest-only',
      repository: '/repo',
      implementationCommit: COMMIT,
      verifiedBy: 'verifier',
      scope: [],
      limitations: [],
      commands: [],
      artifacts: [ref],
      outcome: 'passed',
      correlationId: 'manifest-only',
    });
    const found = resolveArtifactAssociation(bundles, manifests, ref.digest.toUpperCase());
    expect(found).toMatchObject({ mediaType: 'text/plain', kind: 'command', source: 'manifest' });
  });

  it('returns undefined for unreferenced digests (no hash oracle)', () => {
    const { artifacts, manifests, bundles } = stores();
    const ref = artifacts.put({ content: 'orphan', mediaType: 'text/plain', kind: 'command', summary: 'orphan' });
    expect(resolveArtifactAssociation(bundles, manifests, ref.digest)).toBeUndefined();
    expect(resolveArtifactAssociation(bundles, manifests, 'f'.repeat(64))).toBeUndefined();
  });
});

describe('stored media policy (EVIDENCE-UX-002 M2)', () => {
  it('allows the inline image set', () => {
    expect(isInlineImageMediaType('image/png')).toBe(true);
    expect(isInlineImageMediaType('image/jpeg')).toBe(true);
    expect(isInlineImageMediaType('image/webp')).toBe(true);
    expect(isInlineImageMediaType('IMAGE/PNG')).toBe(true);
    expect(isInlineImageMediaType('text/plain')).toBe(false);
    expect(isInlineImageMediaType('image/svg+xml')).toBe(false);
  });

  it('detects SVG media', () => {
    expect(isSvgMediaType('image/svg+xml')).toBe(true);
    expect(isSvgMediaType('image/svg+xml; charset=utf-8')).toBe(true);
    expect(isSvgMediaType('image/png')).toBe(false);
  });

  it('rejects implausible stored media types', () => {
    expect(isPlausibleStoredMediaType('image/png')).toBe(true);
    expect(isPlausibleStoredMediaType('application/octet-stream')).toBe(true);
    expect(isPlausibleStoredMediaType('')).toBe(false);
    expect(isPlausibleStoredMediaType('not a type')).toBe(false);
    expect(isPlausibleStoredMediaType('image/png; evil=1')).toBe(false);
  });
});

describe('thumbnail service (EVIDENCE-UX-002 M2)', () => {
  it('downscales with a fixed spec id and preserves aspect ratio', () => {
    const { artifacts, thumbnails } = stores();
    expect(thumbnailSpecId(DEFAULT_THUMBNAIL_SPEC)).toBe('v1-480');
    const landscape = solidPng(1280, 720);
    const ref = artifacts.put({ content: landscape, mediaType: 'image/png', kind: 'screenshot', summary: 'wide' });
    const thumb = thumbnails.thumbnailFor(ref.digest, new Uint8Array(landscape));
    expect(thumb.cached).toBe(false);
    expect(thumb.mediaType).toBe('image/png');
    expect(thumb.width).toBe(480);
    expect(thumb.height).toBe(270);
    // Decoded thumbnail keeps the source aspect ratio (16:9).
    const decoded = PNG.sync.read(Buffer.from(thumb.bytes));
    expect(decoded.width).toBe(480);
    expect(decoded.height).toBe(270);

    const portrait = solidPng(480, 900);
    const portraitThumb = thumbnails.thumbnailFor('b'.repeat(64), new Uint8Array(portrait));
    expect(portraitThumb.width).toBe(256);
    expect(portraitThumb.height).toBe(480);
  });

  it('never upscales tiny images', () => {
    const { thumbnails } = stores();
    const tiny = solidPng(100, 80);
    const thumb = thumbnails.thumbnailFor('c'.repeat(64), new Uint8Array(tiny));
    expect(thumb.width).toBe(100);
    expect(thumb.height).toBe(80);
    // Same pixels (re-encoding may differ byte-wise; dimensions and content do not).
    expect(Buffer.from(PNG.sync.read(Buffer.from(thumb.bytes)).data)).toEqual(
      Buffer.from(PNG.sync.read(Buffer.from(tiny)).data),
    );
  });

  it('caches deterministically — identical evidence never reprocesses', () => {
    const { root, thumbnails } = stores();
    const bytes = solidPng(640, 480);
    const first = thumbnails.thumbnailFor('d'.repeat(64), new Uint8Array(bytes));
    expect(first.cached).toBe(false);
    const second = thumbnails.thumbnailFor('d'.repeat(64), new Uint8Array(bytes));
    expect(second.cached).toBe(true);
    expect(Buffer.from(second.bytes)).toEqual(Buffer.from(first.bytes));
    // A fresh service over the same directory hits the same cache identity.
    const reopened = new ThumbnailService(path.join(root, 'derivatives'));
    const third = reopened.thumbnailFor('d'.repeat(64), new Uint8Array(bytes));
    expect(third.cached).toBe(true);
    expect(Buffer.from(third.bytes)).toEqual(Buffer.from(first.bytes));
  });

  it('leaves the original digest untouched', () => {
    const { artifacts, thumbnails } = stores();
    const bytes = solidPng(900, 600);
    const ref = artifacts.put({ content: bytes, mediaType: 'image/png', kind: 'screenshot', summary: 'orig' });
    thumbnails.thumbnailFor(ref.digest, new Uint8Array(bytes));
    expect(artifacts.verify(ref)).toBe(true);
    expect(Buffer.from(artifacts.read(ref.digest) ?? [])).toEqual(Buffer.from(bytes));
  });

  it('rejects malformed images without producing bytes', () => {
    const { thumbnails } = stores();
    try {
      thumbnails.thumbnailFor('e'.repeat(64), new Uint8Array(Buffer.from('not an image')));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('unsupported-media');
    }
    const truncated = solidPng(8, 8).slice(0, 40);
    try {
      thumbnails.thumbnailFor('e'.repeat(64), new Uint8Array(truncated));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('malformed-image');
    }
    try {
      thumbnails.thumbnailFor('not-a-digest', new Uint8Array(solidPng(4, 4)));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('malformed-image');
    }
  });

  it('rejects decompression-bomb dimensions before decoding', () => {
    const { thumbnails } = stores();
    try {
      thumbnails.thumbnailFor('f'.repeat(64), new Uint8Array(bombHeaderPng()));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('too-large');
    }
  });

  it('rejects non-PNG inline types for M2 derivatives', () => {
    const { thumbnails } = stores();
    // Minimal structurally valid JPEG (SOI + SOF0 claiming 16x12 + EOI).
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x0c, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
    ]);
    try {
      thumbnails.thumbnailFor('a'.repeat(64), new Uint8Array(jpeg));
      expect.unreachable();
    } catch (error) {
      expect((error as VisualIngestError).code).toBe('unsupported-media');
    }
  });
});
