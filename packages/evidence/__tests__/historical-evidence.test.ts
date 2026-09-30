import type {
  EvidenceKind,
  HistoricalAnchor,
  HistoricalArtifactKind,
  HistoricalEvidenceRecord,
  HistoricalFragmentLocator,
  HistoricalProvenance,
  HistoricalWorktreeState,
} from '@vestara/evidence';
import { describe, expect, it } from 'vitest';

const digest = 'a'.repeat(64);

function record(overrides: Partial<HistoricalEvidenceRecord> = {}): HistoricalEvidenceRecord {
  return {
    artifactDigest: digest,
    artifactKind: 'document',
    mediaType: 'text/markdown',
    size: 12,
    summary: 'historical document',
    anchors: [],
    ...overrides,
  };
}

describe('neutral historical evidence contracts', () => {
  it('keeps historical artifact kinds generic', () => {
    const kinds: HistoricalArtifactKind[] = ['document', 'source-file', 'custom-neutral-kind'];
    expect(kinds).toContain('custom-neutral-kind');
  });

  it('accepts the single historical EvidenceKind literal', () => {
    const kind: EvidenceKind = 'historical-document';
    expect(kind).toBe('historical-document');
  });

  it('preserves unknown optional provenance instead of manufacturing facts', () => {
    const provenance: HistoricalProvenance = {};
    const historical = record({ provenance });
    expect(historical.provenance).toEqual({});
    expect(historical.provenance?.observedAt).toBeUndefined();
    expect(historical.provenance?.sourceCommit).toBeUndefined();
  });

  it('supports zero anchors', () => {
    expect(record({ anchors: [] }).anchors).toHaveLength(0);
  });

  it('supports stable semantic anchors', () => {
    const anchor: HistoricalAnchor = { kind: 'heading', value: '## Contract Foundation' };
    expect(record({ anchors: [anchor] }).anchors).toEqual([anchor]);
  });

  it('keeps derivedFrom as declared lineage without mutating or owning the parent', () => {
    const parent = record();
    const child = record({ artifactDigest: 'b'.repeat(64), derivedFrom: parent.artifactDigest });
    expect(child.derivedFrom).toBe(parent.artifactDigest);
    expect(child).not.toBe(parent);
    expect(parent.derivedFrom).toBeUndefined();
  });

  it('keeps supersedesScope as scoped metadata without creating a verdict', () => {
    const historical = record({ supersedesScope: 'same-document-lineage' });
    expect(historical.supersedesScope).toBe('same-document-lineage');
    expect(historical).not.toHaveProperty('status');
    expect(historical).not.toHaveProperty('winner');
  });

  it('distinguishes artifact identity from semantic fragment location', () => {
    const locator: HistoricalFragmentLocator = {
      artifactDigest: digest,
      anchor: { kind: 'symbol', value: 'HistoricalEvidenceRecord' },
    };
    expect(locator.artifactDigest).toBe(digest);
    expect(locator.anchor.value).toBe('HistoricalEvidenceRecord');
    expect(locator).not.toHaveProperty('fragmentDigest');
  });

  it('does not introduce a knowledge-assertions dependency', async () => {
    const packageJson = await import('../package.json', { with: { type: 'json' } });
    expect(packageJson.default.dependencies).not.toHaveProperty('@vestara/knowledge-assertions');
  });

  it('keeps worktree state explicit when unknown', () => {
    const state: HistoricalWorktreeState = { status: 'unknown' };
    expect(state).toEqual({ status: 'unknown' });
  });
});
