import type { GraphRelationship } from '@vestara/engineering-graph';
import type { EvidenceReference, HistoricalFragmentLocator } from '@vestara/evidence';
import { describe, expect, it } from 'vitest';

import type {
  Assertion,
  AssertionEvidenceLink,
  AssertionTarget,
  ConfidenceSnapshot,
  ConflictView,
  ReconciliationDisposition,
  UnresolvedQuestion,
} from '../src/index';

const evidenceRef = 'a'.repeat(64) as EvidenceReference['ref'];
const originalDigest = 'b'.repeat(64);
const overlayDigest = 'c'.repeat(64);
const originalAnchor = { kind: 'inventory-capability', value: 'AR-CAP-23' } as const;
const overlayAnchor = { kind: 'semantic-status', value: 'AR-CAP-23', label: 'UNKNOWN' } as const;

const evidenceReferenceLink: AssertionEvidenceLink = {
  kind: 'evidence-reference',
  evidenceRef,
  role: 'supporting',
};

const historicalLink = (artifactDigest: string, anchor: HistoricalFragmentLocator['anchor'], role: EvidenceRole) => ({
  kind: 'historical-fragment' as const,
  historicalLocator: { artifactDigest, anchor },
  role,
});

describe('knowledge assertion contract', () => {
  it('preserves engineering graph contracts without adding epistemic fields', () => {
    const relationship: GraphRelationship = { from: 'entity:a', to: 'entity:b', type: 'depends-on' };

    expect(Object.keys(relationship)).toEqual(['from', 'to', 'type']);
    expect(relationship).toEqual({ from: 'entity:a', to: 'entity:b', type: 'depends-on' });
  });

  it('keeps assertion targets distinct', () => {
    const targets: AssertionTarget[] = [
      { kind: 'entity', id: 'e1' },
      { kind: 'relationship', id: 'r1' },
      { kind: 'concept', id: 'c1' },
      { kind: 'system-state', id: 's1' },
    ];

    expect(targets.map((target) => target.kind)).toEqual(['entity', 'relationship', 'concept', 'system-state']);
  });

  it('links evidence identity and does not carry evidence content', () => {
    const link = evidenceReferenceLink;
    const assertion: Assertion = {
      id: 'a1',
      statement: 'X owns S',
      target: { kind: 'system-state', id: 'S' },
      stratum: 'current-system',
      status: 'asserted',
      evidence: [link],
      assertedAt: '2026-09-27T00:00:00Z',
    };

    expect(assertion.evidence).toEqual([{ kind: 'evidence-reference', evidenceRef, role: 'supporting' }]);
    expect(link).not.toHaveProperty('summary');
    expect(link).not.toHaveProperty('mediaType');
    expect(link).not.toHaveProperty('provenance');
  });

  it('preserves all evidence roles', () => {
    const links: AssertionEvidenceLink[] = [
      { kind: 'evidence-reference', evidenceRef, role: 'supporting' },
      { kind: 'evidence-reference', evidenceRef, role: 'contesting' },
      { kind: 'evidence-reference', evidenceRef, role: 'contextual' },
    ];

    expect(links.map((link) => link.role)).toEqual(['supporting', 'contesting', 'contextual']);
  });

  it('represents a canonical historical fragment without EvidenceProvenance', () => {
    const link: AssertionEvidenceLink = historicalLink(originalDigest, originalAnchor, 'contextual');

    expect(link.kind).toBe('historical-fragment');
    expect(link.historicalLocator.artifactDigest).toBe(originalDigest);
    expect(link.historicalLocator.anchor).toEqual(originalAnchor);
    expect(link).not.toHaveProperty('evidenceRef');
    expect(link).not.toHaveProperty('provenance');
  });

  it('keeps original and overlay digests distinguishable', () => {
    const original = historicalLink(originalDigest, originalAnchor, 'supporting');
    const overlay = historicalLink(overlayDigest, overlayAnchor, 'contesting');

    expect(original.historicalLocator.artifactDigest).not.toBe(overlay.historicalLocator.artifactDigest);
    expect(original.historicalLocator.anchor).not.toEqual(overlay.historicalLocator.anchor);
  });

  it('keeps different anchors on one artifact distinguishable', () => {
    const capability = historicalLink(originalDigest, originalAnchor, 'supporting');
    const section = historicalLink(
      originalDigest,
      { kind: 'document-section', value: 'required-capability-matrix' },
      'contextual',
    );

    expect(capability.historicalLocator.artifactDigest).toBe(section.historicalLocator.artifactDigest);
    expect(capability.historicalLocator.anchor).not.toEqual(section.historicalLocator.anchor);
  });

  it('narrows deterministically through the explicit discriminator', () => {
    const links: AssertionEvidenceLink[] = [
      evidenceReferenceLink,
      historicalLink(originalDigest, originalAnchor, 'contextual'),
    ];
    const refs = links.map((link) =>
      link.kind === 'evidence-reference' ? link.evidenceRef : link.historicalLocator.artifactDigest,
    );

    expect(refs).toEqual([evidenceRef, originalDigest]);
  });

  it('reuses HistoricalFragmentLocator rather than duplicating its contract', () => {
    const locator: HistoricalFragmentLocator = { artifactDigest: originalDigest, anchor: originalAnchor };
    const link: AssertionEvidenceLink = { kind: 'historical-fragment', historicalLocator: locator, role: 'supporting' };

    expect(link.historicalLocator).toBe(locator);
    expect(link.historicalLocator).not.toHaveProperty('fragmentDigest');
  });

  it('applies every evidence role identically to historical links', () => {
    const roles: EvidenceRole[] = ['supporting', 'contesting', 'contextual'];
    const links = roles.map((role) => historicalLink(originalDigest, originalAnchor, role));

    expect(links.map((link) => link.role)).toEqual(roles);
  });

  it('allows unevaluated confidence and records derivation identity/version', () => {
    const withoutConfidence: Assertion = {
      id: 'a1',
      statement: 'X owns S',
      target: { kind: 'system-state', id: 'S' },
      stratum: 'current-system',
      status: 'asserted',
      evidence: [],
      assertedAt: '2026-09-27T00:00:00Z',
    };
    const confidence: ConfidenceSnapshot = {
      value: 0.8,
      derivation: { source: 'reviewer-derived', version: 'v1' },
    };

    expect(withoutConfidence.confidence).toBeUndefined();
    expect(confidence).toEqual({ value: 0.8, derivation: { source: 'reviewer-derived', version: 'v1' } });
    expect(confidence).not.toHaveProperty('verified');
    expect(confidence).not.toHaveProperty('verdict');
  });

  it('represents lifecycle states without destructive replacement helpers', () => {
    const statuses: Assertion['status'][] = ['asserted', 'superseded', 'retracted'];
    expect(statuses).toEqual(['asserted', 'superseded', 'retracted']);
  });

  it('keeps UNKNOWN reasons explicit and graph-independent', () => {
    const reasons: UnresolvedQuestion['reason'][] = [
      'awaiting-evidence',
      'conflicting-evidence',
      'stale-evidence',
      'collection-failed',
      'not-collected',
      'out-of-scope',
    ];
    const question: UnresolvedQuestion = {
      id: 'q1',
      question: 'Who owns S?',
      reason: 'awaiting-evidence',
      createdAt: '2026-09-27T00:00:00Z',
    };

    expect(reasons).toHaveLength(6);
    expect(question).not.toHaveProperty('relationship');
    expect(question).not.toHaveProperty('graphEdge');
  });

  it('derives same-stratum conflicts without a winner', () => {
    const conflict: ConflictView = {
      id: 'conflict-1',
      target: { kind: 'system-state', id: 'S' },
      stratum: 'current-system',
      assertionIds: ['a1', 'a2'],
      derivation: { source: 'conflict-projector', version: 'v1' },
    };

    expect(conflict.assertionIds).toEqual(['a1', 'a2']);
    expect(conflict).not.toHaveProperty('winner');
    expect(conflict).not.toHaveProperty('authority');
  });

  it('represents different strata without constructing a conflict', () => {
    const current: Assertion = {
      id: 'a1',
      statement: 'X owns S',
      target: { kind: 'system-state', id: 'S' },
      stratum: 'current-system',
      status: 'asserted',
      evidence: [],
      assertedAt: '2026-09-27T00:00:00Z',
    };
    const proposal: Assertion = { ...current, id: 'a2', stratum: 'proposal' };

    expect(current.stratum).not.toBe(proposal.stratum);
  });

  it('requires exclusion rationale and decision provenance in the contract', () => {
    const dispositions: ReconciliationDisposition[] = [
      { state: 'represented', assertionIds: ['a1'] },
      { state: 'unresolved', questionId: 'q1' },
      { state: 'excluded', reason: 'out of scope', decidedBy: 'inventory-review', decidedAt: '2026-09-27' },
    ];

    expect(dispositions.map((disposition) => disposition.state)).toEqual(['represented', 'unresolved', 'excluded']);
    expect(dispositions[2]).toMatchObject({
      reason: 'out of scope',
      decidedBy: 'inventory-review',
      decidedAt: '2026-09-27',
    });
  });

  it('does not change assertion, UNKNOWN, conflict, or disposition semantics', () => {
    const assertion: Assertion = {
      id: 'historical-a1',
      statement: 'AR-CAP-23 is represented in historical inventory evidence',
      target: { kind: 'concept', id: 'AR-CAP-23' },
      stratum: 'design-lineage',
      status: 'asserted',
      evidence: [historicalLink(originalDigest, originalAnchor, 'supporting')],
      assertedAt: '2026-09-27T00:00:00Z',
    };
    const question: UnresolvedQuestion = {
      id: 'q-ar-cap-23',
      question: 'Is AR-CAP-23 currently recoverable?',
      reason: 'awaiting-evidence',
      target: { kind: 'concept', id: 'AR-CAP-23' },
      stratum: 'unresolved',
      createdAt: '2026-09-27T00:00:00Z',
    };
    const conflict: ConflictView = {
      id: 'conflict-ar-cap-23',
      target: assertion.target,
      stratum: 'design-lineage',
      assertionIds: ['historical-a1', 'historical-a2'],
      derivation: { source: 'contract-test', version: 'v1' },
    };
    const disposition: ReconciliationDisposition = { state: 'unresolved', questionId: question.id };

    expect(assertion.evidence[0].kind).toBe('historical-fragment');
    expect(question.reason).toBe('awaiting-evidence');
    expect(conflict).not.toHaveProperty('winner');
    expect(disposition).toEqual({ state: 'unresolved', questionId: question.id });
  });
});
