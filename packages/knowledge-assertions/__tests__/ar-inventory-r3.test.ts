import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type {
  Assertion,
  AssertionEvidenceLink,
  ConflictView,
  ReconciliationDisposition,
  UnresolvedQuestion,
} from '../src';

interface MaterializationFixture {
  readonly accounting: {
    readonly denominator: number;
    readonly represented: number;
    readonly unresolved: number;
    readonly excluded: number;
  };
  readonly assertions: readonly Assertion[];
  readonly unresolvedQuestions: readonly UnresolvedQuestion[];
  readonly conflicts: readonly ConflictView[];
  readonly dispositions: readonly (ReconciliationDisposition & { readonly rowId: string })[];
}

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'fixtures/ar-inventory-002b-r3.json'), 'utf8'),
) as MaterializationFixture;

const rowIds = [
  ...Array.from({ length: 25 }, (_, index) => `AR-CAP-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 23 }, (_, index) => `DEP-${String(index + 1).padStart(2, '0')}`),
];

describe('AR-INVENTORY-002B-R3 materialized fixture', () => {
  it('accounts for all 48 rows exactly once', () => {
    expect(fixture.accounting).toEqual({ denominator: 48, represented: 42, unresolved: 6, excluded: 0 });
    expect(fixture.dispositions).toHaveLength(48);
    expect(new Set(fixture.dispositions.map((disposition) => disposition.rowId)).size).toBe(48);
    expect(fixture.dispositions.map((disposition) => disposition.rowId).sort()).toEqual([...rowIds].sort());
  });

  it('uses only historical fragment links with resolvable canonical locator fields', () => {
    const links = fixture.assertions.flatMap((assertion) => assertion.evidence) as readonly AssertionEvidenceLink[];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.kind).toBe('historical-fragment');
      if (link.kind === 'historical-fragment') {
        expect(link.historicalLocator.artifactDigest).toMatch(/^[0-9a-f]{64}$/);
        expect(link.historicalLocator.anchor.kind).toEqual(expect.any(String));
        expect(link.historicalLocator.anchor.value).toEqual(expect.any(String));
      }
    }
    expect(links.some((link) => link.kind === 'evidence-reference')).toBe(false);
  });

  it('keeps historical assertions out of current-system stratum and confidence unevaluated', () => {
    expect(fixture.assertions.every((assertion) => assertion.stratum === 'design-lineage')).toBe(true);
    expect(fixture.assertions.every((assertion) => assertion.confidence === undefined)).toBe(true);
  });

  it('preserves six unresolved questions and four winnerless conflicts', () => {
    expect(fixture.unresolvedQuestions).toHaveLength(6);
    expect(fixture.conflicts).toHaveLength(4);
    expect(fixture.conflicts.every((conflict) => conflict.assertionIds.length === 2)).toBe(true);
    expect(fixture.conflicts.every((conflict) => !('winner' in conflict))).toBe(true);
  });
});
