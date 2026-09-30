import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ContentAddressedEvidenceStore } from '@vestara/engineering-event-store';
import { HistoricalEvidenceStore, type HistoricalFragmentLocator } from '@vestara/evidence';
import { describe, expect, it } from 'vitest';

const originalBytes = '# Original\n\nStable history.\n';
const overlayBytes = '# Overlay\n\nDeclared historical revision.\n';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vestara-historical-'));
  const cas = new ContentAddressedEvidenceStore(join(root, 'cas'));
  const records = join(root, 'records');
  return { root, cas, records, store: new HistoricalEvidenceStore(records, cas) };
}

async function withFixture(test: (value: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const value = await fixture();
  try {
    await test(value);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
}

function ingestOriginal(store: HistoricalEvidenceStore) {
  return store.ingest({
    content: originalBytes,
    artifactKind: 'document',
    mediaType: 'text/markdown',
    summary: 'synthetic original',
    anchors: [
      { kind: 'heading', value: 'Original' },
      { kind: 'paragraph', value: 'Stable history.' },
    ],
    provenance: {},
  });
}

describe('historical evidence persistence and reconstruction', () => {
  it('ingests exact bytes through the existing CAS and reconstructs after restart', async () => {
    await withFixture(async ({ root, records, store }) => {
      const original = ingestOriginal(store);
      expect(original.size).toBe(Buffer.byteLength(originalBytes));
      expect(store.verify(original.artifactDigest)).toBe(true);

      const restarted = new HistoricalEvidenceStore(records, new ContentAddressedEvidenceStore(join(root, 'cas')));
      const resolved = restarted.resolve(original.artifactDigest);
      expect(resolved?.record).toEqual(original);
      expect(resolved?.bytes.toString()).toBe(originalBytes);
      expect(restarted.list()).toHaveLength(1);
    });
  });

  it('proves two synthetic artifacts have distinct immutable identities', async () => {
    await withFixture(async ({ store }) => {
      const original = ingestOriginal(store);
      const overlay = store.ingest({
        content: overlayBytes,
        artifactKind: 'document',
        mediaType: 'text/markdown',
        summary: 'synthetic overlay',
        anchors: [
          { kind: 'heading', value: 'Overlay' },
          { kind: 'paragraph', value: 'Declared historical revision.' },
        ],
        derivedFrom: original.artifactDigest,
        supersedesScope: 'Original',
      });

      expect(overlay.artifactDigest).not.toBe(original.artifactDigest);
      expect(store.list()).toEqual(expect.arrayContaining([original, overlay]));
      expect(store.list()).toHaveLength(2);
      expect(store.resolve(original.artifactDigest)?.bytes.toString()).toBe(originalBytes);
      expect(store.resolve(overlay.artifactDigest)?.bytes.toString()).toBe(overlayBytes);
      expect(store.resolveLineage(overlay)).toEqual({
        record: overlay,
        parentDigest: original.artifactDigest,
        parent: original,
      });
      expect(original.supersedesScope).toBeUndefined();
    });
  });

  it('preserves an unresolved declared parent without manufacturing it', async () => {
    await withFixture(async ({ store }) => {
      const missingParent = 'b'.repeat(64);
      const overlay = store.ingest({
        content: overlayBytes,
        artifactKind: 'document',
        mediaType: 'text/markdown',
        summary: 'orphan synthetic overlay',
        anchors: [],
        derivedFrom: missingParent,
      });
      expect(store.resolveLineage(overlay)).toEqual({
        record: overlay,
        parentDigest: missingParent,
        unresolvedParentDigest: missingParent,
      });
    });
  });

  it('resolves exact stable anchors and returns not-found for absent anchors', async () => {
    await withFixture(async ({ store }) => {
      const original = ingestOriginal(store);
      const locator: HistoricalFragmentLocator = {
        artifactDigest: original.artifactDigest,
        anchor: { kind: 'heading', value: 'Original' },
      };
      expect(store.resolveAnchor(locator)?.anchor).toEqual(locator.anchor);
      expect(
        store.resolveAnchor({
          artifactDigest: original.artifactDigest,
          anchor: { kind: 'heading', value: 'Not present' },
        }),
      ).toBeUndefined();
    });
  });

  it('makes duplicate same-byte ingestion idempotent and rejects conflicting records', async () => {
    await withFixture(async ({ store }) => {
      const first = ingestOriginal(store);
      const duplicate = ingestOriginal(store);
      expect(duplicate).toEqual(first);
      await expect(
        Promise.resolve().then(() => store.write({ ...first, summary: 'attempted overwrite' })),
      ).rejects.toThrow('immutable');
      expect(store.read(first.artifactDigest)).toEqual(first);
    });
  });

  it('fails closed when CAS bytes are missing or corrupted', async () => {
    await withFixture(async ({ root, store }) => {
      const original = ingestOriginal(store);
      const casPath = join(root, 'cas', 'sha256', original.artifactDigest.slice(0, 2), original.artifactDigest);
      await unlink(casPath);
      expect(store.verify(original.artifactDigest)).toBe(false);
      expect(store.resolve(original.artifactDigest)).toBeUndefined();

      const restored = new ContentAddressedEvidenceStore(join(root, 'cas'));
      restored.put({
        content: originalBytes,
        mediaType: 'text/markdown',
        kind: 'historical-document',
        summary: original.summary,
      });
      await writeFile(casPath, 'corrupted bytes');
      expect(store.verify(original.artifactDigest)).toBe(false);
      expect(store.resolve(original.artifactDigest)).toBeUndefined();
    });
  });

  it('detects a corrupted persisted record checksum without repairing it', async () => {
    await withFixture(async ({ records, store }) => {
      const original = ingestOriginal(store);
      const recordPath = join(records, `${original.artifactDigest}.json`);
      const corrupted = (await readFile(recordPath, 'utf8')).replace('synthetic original', 'corrupted record');
      await writeFile(recordPath, corrupted);
      expect(store.verify(original.artifactDigest)).toBe(false);
    });
  });

  it('does not depend on source paths for reconstruction', async () => {
    await withFixture(async ({ records, root, store }) => {
      const original = store.ingest({
        content: originalBytes,
        artifactKind: 'source-file',
        mediaType: 'text/plain',
        summary: 'synthetic source snapshot',
        anchors: [],
        provenance: { sourcePath: '/missing/original/source.txt' },
      });
      const restarted = new HistoricalEvidenceStore(records, new ContentAddressedEvidenceStore(join(root, 'cas')));
      expect(restarted.resolve(original.artifactDigest)?.bytes.toString()).toBe(originalBytes);
    });
  });
});
