import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ContentAddressedEvidenceStore, ImmutableEvidenceManifestStore } from '@vestara/engineering-event-store';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { EvidencePipeline } from '../src/pipeline';
import {
  CaptureIngestError,
  ingestCaptureBytes,
  inspectRecordingBytes,
  MAX_CAPTURE_INGEST_BYTES,
} from '../src/recording-ingest';
import { inspectVisualBytes } from '../src/visual-ingest';

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

function store(): ContentAddressedEvidenceStore {
  return new ContentAddressedEvidenceStore(path.join(tmpdir('capture-ingest-'), 'artifacts'));
}

function solidPng(): Buffer {
  const png = new PNG({ width: 2, height: 2 });
  for (let i = 0; i < 4; i += 1) {
    png.data[i * 4] = 10;
    png.data[i * 4 + 1] = 20;
    png.data[i * 4 + 2] = 30;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

/** Deterministic minimal WebM: EBML header + DocType 'webm' + inert payload. */
function webmFixture(payload: string): Uint8Array {
  return new Uint8Array([
    0x1a,
    0x45,
    0xdf,
    0xa3,
    0xa3,
    0x42,
    0x86,
    0x81,
    0x01,
    0x42,
    0xf7,
    0x81,
    0x01,
    0x42,
    0xf2,
    0x81,
    0x04,
    0x42,
    0x82,
    0x84,
    0x77,
    0x65,
    0x62,
    0x6d,
    ...Buffer.from(payload, 'utf8'),
  ]);
}

function matroskaFixture(): Uint8Array {
  const bytes = webmFixture('matroska-body');
  // Replace 'webm' DocType value with 'matroska' (same scan window).
  const ascii = Buffer.from(bytes).toString('binary');
  const at = ascii.indexOf('webm');
  const patched = Buffer.from(bytes);
  patched.write('matroska', at);
  return new Uint8Array(patched);
}

describe('inspectRecordingBytes', () => {
  it('accepts EBML with a webm DocType', () => {
    expect(inspectRecordingBytes(webmFixture('frame'))).toEqual({ mediaType: 'video/webm' });
  });

  it('rejects non-EBML bytes as unsupported', () => {
    expect(() => inspectRecordingBytes(new Uint8Array(Buffer.from('not a recording')))).toThrowError(
      CaptureIngestError,
    );
  });

  it('rejects truncated input as malformed', () => {
    expect(() => inspectRecordingBytes(new Uint8Array([0x1a, 0x45]))).toThrowError(/truncated/);
  });

  it('rejects matroska containers (canonical webm only, no generic video)', () => {
    expect(() => inspectRecordingBytes(matroskaFixture())).toThrowError(/not enabled/);
  });
});

describe('ingestCaptureBytes — screenshots', () => {
  it('ingests PNG bytes with inspected media authority', () => {
    const bytes = new Uint8Array(solidPng());
    const result = ingestCaptureBytes({
      artifacts: store(),
      bytes,
      kind: 'screenshot',
      summary: 'capture: display',
      producer: 'screen-capture-test',
      executionId: 'exec-1',
      operation: 'screenshot:display',
      captureTarget: 'display',
    });
    expect(result.mediaType).toBe('image/png');
    expect(result.reference.kind).toBe('screenshot');
    expect(result.reference.mediaType).toBe('image/png');
    expect(result.reference.size).toBe(bytes.length);
    expect(result.reference.visual?.width).toBe(2);
  });

  it('accepts a matching claimed MIME but rejects mismatches', () => {
    const bytes = new Uint8Array(solidPng());
    const ok = ingestCaptureBytes({
      artifacts: store(),
      bytes,
      kind: 'screenshot',
      claimedMediaType: 'image/png',
      summary: 's',
      producer: 'p',
      executionId: 'e',
    });
    expect(ok.mediaType).toBe('image/png');
    expect(() =>
      ingestCaptureBytes({
        artifacts: store(),
        bytes,
        kind: 'screenshot',
        claimedMediaType: 'video/webm',
        summary: 's',
        producer: 'p',
        executionId: 'e',
      }),
    ).toThrowError(/does not match inspected/);
  });
});

describe('ingestCaptureBytes — screen recordings', () => {
  it('ingests webm bytes as screen-recording evidence', () => {
    const bytes = webmFixture('recording-body');
    const result = ingestCaptureBytes({
      artifacts: store(),
      bytes,
      kind: 'screen-recording',
      summary: 'capture: recording',
      producer: 'screen-capture-test',
      executionId: 'exec-2',
      captureTarget: 'window',
      capturedAt: '2026-09-16T00:00:00.000Z',
    });
    expect(result.mediaType).toBe('video/webm');
    expect(result.reference.kind).toBe('screen-recording');
    expect(result.reference.mediaType).toBe('video/webm');
    expect(result.reference.size).toBe(bytes.length);
    expect(result.reference.provenance.producer).toBe('screen-capture-test');
    expect(result.reference.provenance.executionId).toBe('exec-2');
    expect(result.reference.provenance.contentHash).toBe(result.ref.digest);
  });

  it('rejects image bytes claimed as recordings and vice versa', () => {
    expect(() =>
      ingestCaptureBytes({
        artifacts: store(),
        bytes: new Uint8Array(solidPng()),
        kind: 'screen-recording',
        summary: 's',
        producer: 'p',
        executionId: 'e',
      }),
    ).toThrowError(CaptureIngestError);
    expect(() =>
      ingestCaptureBytes({
        artifacts: store(),
        bytes: webmFixture('x'),
        kind: 'screenshot',
        summary: 's',
        producer: 'p',
        executionId: 'e',
      }),
    ).toThrowError(CaptureIngestError);
  });
});

describe('ingestCaptureBytes — identity and safety', () => {
  it('produces deterministic digests equal to sha256(bytes)', () => {
    const bytes = webmFixture('deterministic');
    const expected = createHash('sha256').update(bytes).digest('hex');
    const first = ingestCaptureBytes({
      artifacts: store(),
      bytes,
      kind: 'screen-recording',
      summary: 's',
      producer: 'p',
      executionId: 'e',
    });
    const second = ingestCaptureBytes({
      artifacts: store(),
      bytes: new Uint8Array(bytes),
      kind: 'screen-recording',
      summary: 's',
      producer: 'p',
      executionId: 'e',
    });
    expect(first.ref.digest).toBe(expected);
    expect(second.ref.digest).toBe(expected);
  });

  it('rejects empty and oversized input', () => {
    expect(() =>
      ingestCaptureBytes({
        artifacts: store(),
        bytes: new Uint8Array(0),
        kind: 'screenshot',
        summary: 's',
        producer: 'p',
        executionId: 'e',
      }),
    ).toThrowError(/empty/);
    expect(() =>
      ingestCaptureBytes({
        artifacts: store(),
        bytes: new Uint8Array(MAX_CAPTURE_INGEST_BYTES + 1),
        kind: 'screenshot',
        summary: 's',
        producer: 'p',
        executionId: 'e',
      }),
    ).toThrowError(/exceeds/);
  });

  it('exposes no filesystem path in the durable result', () => {
    const result = ingestCaptureBytes({
      artifacts: store(),
      bytes: webmFixture('nopath'),
      kind: 'screen-recording',
      summary: 's',
      producer: 'p',
      executionId: 'e',
    });
    expect(JSON.stringify(result)).not.toMatch(/tmp|workspace|\.webm|\.png/);
    expect(result.ref.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('screenshot inspection still rejects non-image bytes (existing gate intact)', () => {
    expect(() => inspectVisualBytes(webmFixture('x'))).toThrow();
  });
});

describe('EvidencePipeline — capture kinds as first-class evidence', () => {
  it('bundles screenshot + screen-recording items for shared consumers', async () => {
    const root = tmpdir('capture-pipeline-');
    const pngBytes = new Uint8Array(solidPng());
    const webmBytes = webmFixture('pipeline');
    const pngInspection = inspectVisualBytes(pngBytes);
    const pipeline = new EvidencePipeline({
      artifacts: new ContentAddressedEvidenceStore(path.join(root, 'artifacts')),
      manifests: new ImmutableEvidenceManifestStore(path.join(root, 'manifests')),
      collectors: [
        {
          kind: 'screenshot',
          collect: async () => ({
            items: [
              {
                kind: 'screenshot',
                mediaType: pngInspection.mediaType,
                content: pngBytes,
                summary: 'capture: display screenshot',
                operation: 'screenshot:display',
                metadata: { visual: { ...pngInspection } },
              },
              {
                kind: 'screen-recording',
                mediaType: 'video/webm',
                content: webmBytes,
                summary: 'capture: window recording',
                operation: 'recording:window',
                metadata: { recording: { mediaType: 'video/webm' } },
              },
            ],
          }),
        },
      ],
      producer: 'screen-capture-test',
      environment: 'test-env',
    });
    const bundle = await pipeline.buildBundle({
      executionId: 'capture-1',
      verifierId: 'verifier',
      profileId: 'profile',
      repository: 'vestara-ai-core',
      implementationCommit: COMMIT,
      outcome: 'passed',
      workspaceRoot: root,
      checks: [
        { id: 'c1', name: 'recording present', status: 'passed', summary: 'ok', evidenceKinds: ['screen-recording'] },
        { id: 'c2', name: 'all capture', status: 'passed', summary: 'ok' },
      ],
    });
    const byKind = new Map(bundle.evidence.map((item) => [item.kind, item]));
    expect([...byKind.keys()].sort()).toEqual(['screen-recording', 'screenshot']);
    expect(byKind.get('screen-recording')?.mediaType).toBe('video/webm');
    expect(byKind.get('screenshot')?.mediaType).toBe('image/png');
    // Per-check attribution: scoped check sees only the recording digest.
    expect(bundle.checks[0]?.evidenceRefs).toEqual([byKind.get('screen-recording')?.ref]);
    expect(bundle.checks[1]?.evidenceRefs).toHaveLength(2);
    // Digests resolve server-side through the same bundle path Diagnostics reads.
    for (const item of bundle.evidence) {
      expect(item.ref).toMatch(/^[0-9a-f]{64}$/);
      expect(item.provenance.contentHash).toBe(item.ref);
    }
  });
});
