import { describe, expect, it } from 'vitest';
import { type InventoryDetailView, inventoryDetail, loadInventoryR3Projection, projectInventoryR3 } from '../src';

const expectedRows = [
  ...Array.from({ length: 25 }, (_, index) => `AR-CAP-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 23 }, (_, index) => `DEP-${String(index + 1).padStart(2, '0')}`),
];

describe('Inventory R3 read projection', () => {
  it('projects the accepted summary without inventing current state', () => {
    const projection = loadInventoryR3Projection();
    expect(projection.summary).toEqual({
      totalTargets: 48,
      capabilities: 25,
      dependencies: 23,
      represented: 42,
      unresolved: 6,
      excluded: 0,
      conflicts: 4,
      assertions: 52,
      historicalEvidenceLinks: 85,
      stratum: 'design-lineage',
    });
    expect(projection.rows.map((row) => row.targetId)).toEqual(expectedRows);
    expect(projection.rows.every((row) => !('current' in row) && !('verified' in row))).toBe(true);
  });

  it('preserves target traceability, unresolved state, and conflicts', () => {
    const projection = loadInventoryR3Projection();
    expect(projection.rows).toHaveLength(48);
    expect(new Set(projection.rows.map((row) => row.targetId)).size).toBe(48);
    expect(projection.rows.filter((row) => row.hasUnresolvedQuestion).map((row) => row.targetId)).toEqual([
      'AR-CAP-08',
      'AR-CAP-14',
      'AR-CAP-23',
      'DEP-18',
      'DEP-19',
      'DEP-23',
    ]);
    expect(projection.rows.filter((row) => row.hasConflict).map((row) => row.targetId)).toEqual([
      'AR-CAP-08',
      'AR-CAP-14',
      'DEP-18',
      'DEP-19',
    ]);
    expect(projection.rows.reduce((count, row) => count + row.assertionCount, 0)).toBe(52);
    expect(projection.rows.reduce((count, row) => count + row.historicalEvidenceLinkCount, 0)).toBe(85);
  });

  it('projects represented, unresolved, and conflicting details', () => {
    const projection = loadInventoryR3Projection();
    const represented = inventoryDetail(projection, 'AR-CAP-01') as InventoryDetailView;
    const unresolved = inventoryDetail(projection, 'AR-CAP-23') as InventoryDetailView;
    const conflicting = inventoryDetail(projection, 'AR-CAP-08') as InventoryDetailView;

    expect(represented.assertions[0]).toMatchObject({ id: 'r3-original-ar-cap-01', status: 'asserted' });
    expect(represented.assertions[0]?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact: 'original', artifactDigest: expect.stringMatching(/^[0-9a-f]{64}$/) }),
        expect.objectContaining({ artifact: 'overlay' }),
      ]),
    );
    expect(unresolved.unresolvedQuestion).toMatchObject({ id: 'r3-unresolved-ar-cap-23', reason: 'awaiting-evidence' });
    expect(conflicting.conflict).toMatchObject({
      id: 'r3-conflict-ar-cap-08',
      assertionIds: ['r3-original-ar-cap-08', 'r3-overlay-ar-cap-08'],
    });
    expect(conflicting.conflict).not.toHaveProperty('winner');
  });

  it('rejects an unavailable or mismatched materialization instead of returning zeroes', () => {
    expect(() =>
      projectInventoryR3({
        sourceEvidence: { originalArtifactDigest: 'missing', overlayArtifactDigest: 'missing' },
        stratum: 'design-lineage',
        assertions: [],
        unresolvedQuestions: [],
        conflicts: [],
        dispositions: [],
        accounting: { denominator: 0, represented: 0, unresolved: 0, excluded: 0 },
      }),
    ).toThrow(/accepted materialization/);
  });
});
