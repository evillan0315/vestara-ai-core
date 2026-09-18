import type { ActivityBase } from '@vestara/activity-room';
import { describe, expect, it } from 'vitest';

const {
  attachEvidenceRefs,
  finalizeTempCapture,
  fromEvidenceReference,
  isDurableCaptureRef,
} = require('../dist/index.js');

const DIGEST = 'a'.repeat(64);

function activityBase(): ActivityBase {
  return {
    id: 'act-1',
    sequence: 1,
    timestamp: '2026-09-16T00:00:00.000Z',
    actor: { type: 'human', id: 'u-1', displayName: 'Operator' },
    evidenceRefs: [],
  };
}

describe('fromEvidenceReference', () => {
  it('adopts screenshot digests with inspected metadata', () => {
    const { artifact, durableRef } = fromEvidenceReference(
      {
        ref: DIGEST,
        kind: 'screenshot',
        mediaType: 'image/png',
        size: 128,
        width: 800,
        height: 600,
        producer: 'x11-adapter',
        capturedAt: '2026-09-16T00:00:00.000Z',
      },
      { captureTarget: 'display' },
    );
    expect(durableRef).toBe(DIGEST);
    expect(artifact.ref).toBe(DIGEST);
    expect(artifact.kind).toBe('screenshot');
    expect(artifact.width).toBe(800);
    expect(artifact.captureTarget).toBe('display');
    expect(artifact.provenance.producer).toBe('x11-adapter');
  });

  it('adopts screen-recording digests without inventing track metadata', () => {
    const { artifact } = fromEvidenceReference({
      ref: DIGEST,
      kind: 'screen-recording',
      mediaType: 'video/webm',
      size: 1024,
      producer: 'portal-adapter',
      capturedAt: '2026-09-16T00:00:00.000Z',
    });
    expect(artifact.kind).toBe('screen-recording');
    expect(artifact.mediaType).toBe('video/webm');
    expect(artifact.codec).toBeUndefined();
  });

  it('rejects non-capture kinds and non-digest refs', () => {
    expect(() =>
      fromEvidenceReference({
        ref: DIGEST,
        kind: 'command',
        mediaType: 'text/plain',
        size: 1,
        producer: 'p',
        capturedAt: '2026-09-16T00:00:00.000Z',
      }),
    ).toThrow(/not a capture artifact/);
    expect(() =>
      fromEvidenceReference({
        ref: '/tmp/capture-123.webm',
        kind: 'screen-recording',
        mediaType: 'video/webm',
        size: 1,
        producer: 'p',
        capturedAt: '2026-09-16T00:00:00.000Z',
      }),
    ).toThrow(/not a content-addressed digest/);
  });
});

describe('temporary-to-durable transition', () => {
  it('mints durable refs only from FINALIZING temps with real digests', () => {
    const temp = { tempId: 'tmp-1', kind: 'screen-recording', state: 'FINALIZING', createdAt: 'x' };
    expect(finalizeTempCapture(temp, DIGEST)).toBe(DIGEST);
    expect(isDurableCaptureRef(DIGEST)).toBe(true);
    expect(isDurableCaptureRef('/tmp/capture.webm')).toBe(false);
  });

  it('fails closed for non-finalizing temps and pathname digests', () => {
    const capturing = { tempId: 'tmp-2', kind: 'screenshot', state: 'CAPTURING', createdAt: 'x' };
    expect(() => finalizeTempCapture(capturing, DIGEST)).toThrow(/not FINALIZING/);
    const fin = { tempId: 'tmp-3', kind: 'screenshot', state: 'FINALIZING', createdAt: 'x' };
    expect(() => finalizeTempCapture(fin, '/tmp/shot.png')).toThrow(/not a content-addressed digest/);
  });
});

describe('Activity Room evidenceRefs compatibility', () => {
  it('attaches durable digests through the existing evidenceRefs mechanism', () => {
    const base = activityBase();
    const updated: ActivityBase = { ...base, evidenceRefs: attachEvidenceRefs(base.evidenceRefs, DIGEST) };
    expect(updated.evidenceRefs).toEqual([DIGEST]);
    expect(base.evidenceRefs).toEqual([]);
  });

  it('carries no bytes and transfers no ownership', () => {
    const refs = attachEvidenceRefs([], DIGEST);
    expect(refs).toHaveLength(1);
    expect(typeof refs[0]).toBe('string');
  });
});

describe('artifact safety invariants', () => {
  it('exposes no filesystem path field and no audio surface', () => {
    const { artifact } = fromEvidenceReference({
      ref: DIGEST,
      kind: 'screen-recording',
      mediaType: 'video/webm',
      size: 10,
      producer: 'p',
      capturedAt: '2026-09-16T00:00:00.000Z',
    });
    const keys = Object.keys(artifact);
    expect(keys.some((key) => key.toLowerCase().includes('path'))).toBe(false);
    expect(keys.some((key) => key.toLowerCase().includes('audio'))).toBe(false);
    expect('audio' in artifact).toBe(false);
  });
});
