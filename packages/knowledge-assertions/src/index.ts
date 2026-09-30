/**
 * @vestara/knowledge-assertions
 *
 * Structural contracts and bounded deterministic read projections for knowledge
 * semantics. This package has no workflow, observer, graph, or runtime integration.
 *
 * Invariants preserved:
 *   - Relationship != Assertion
 *   - Assertion != Evidence
 *   - Evidence identity != Verification
 *   - UNKNOWN != Missing
 *   - Conflict is derived and has no winner
 *   - Recommendation != Authority
 */

import type { EvidenceReference, HistoricalFragmentLocator } from '@vestara/evidence';

export type KnowledgeStratum = 'current-system' | 'design-lineage' | 'learned-principle' | 'proposal' | 'unresolved';

export type AssertionTarget =
  | { readonly kind: 'entity'; readonly id: string }
  | { readonly kind: 'relationship'; readonly id: string }
  | { readonly kind: 'concept'; readonly id: string }
  | { readonly kind: 'system-state'; readonly id: string };

export type EvidenceRole = 'supporting' | 'contesting' | 'contextual';

/**
 * An evidence identity plus its knowledge-layer role. The discriminator keeps
 * verification-shaped references distinct from historical semantic locators.
 */
export type AssertionEvidenceLink =
  | {
      readonly kind: 'evidence-reference';
      readonly evidenceRef: EvidenceReference['ref'];
      readonly role: EvidenceRole;
    }
  | {
      readonly kind: 'historical-fragment';
      readonly historicalLocator: HistoricalFragmentLocator;
      readonly role: EvidenceRole;
    };

/** Externally derived confidence; absent on an assertion means unevaluated. */
export interface ConfidenceSnapshot {
  readonly value: number;
  readonly derivation: {
    readonly source: string;
    readonly version: string;
  };
}

export type AssertionStatus = 'asserted' | 'superseded' | 'retracted';

export interface Assertion {
  readonly id: string;
  readonly statement: string;
  readonly target: AssertionTarget;
  readonly stratum: KnowledgeStratum;
  readonly status: AssertionStatus;
  readonly evidence: readonly AssertionEvidenceLink[];
  readonly confidence?: ConfidenceSnapshot;
  readonly assertedAt: string;
}

export type UnresolvedReason =
  | 'awaiting-evidence'
  | 'conflicting-evidence'
  | 'stale-evidence'
  | 'collection-failed'
  | 'not-collected'
  | 'out-of-scope';

export interface UnresolvedQuestion {
  readonly id: string;
  readonly question: string;
  readonly reason: UnresolvedReason;
  readonly target?: AssertionTarget;
  readonly stratum?: KnowledgeStratum;
  readonly createdAt: string;
}

/** Derived/read-only conflict view. It deliberately has no winner field. */
export interface ConflictView {
  readonly id: string;
  readonly target: AssertionTarget;
  readonly stratum: KnowledgeStratum;
  readonly assertionIds: readonly [string, string, ...string[]];
  readonly derivation: {
    readonly source: string;
    readonly version: string;
  };
}

export type DispositionState = 'represented' | 'unresolved' | 'excluded';

export type ReconciliationDisposition =
  | {
      readonly state: 'represented';
      readonly assertionIds: readonly string[];
    }
  | {
      readonly state: 'unresolved';
      readonly questionId: string;
    }
  | {
      readonly state: 'excluded';
      readonly reason: string;
      readonly decidedBy: string;
      readonly decidedAt: string;
    };

export type {
  HistoricalEvidenceLinkView,
  InventoryAssertionView,
  InventoryCategory,
  InventoryConflictView,
  InventoryDetailView,
  InventoryReadProjection,
  InventoryRowView,
  InventorySummaryView,
  InventoryUnresolvedView,
  R3Fixture,
} from './ar-inventory-r3';
export {
  InventoryMaterializationUnavailableError,
  inventoryDetail,
  loadInventoryR3Projection,
  projectInventoryR3,
} from './ar-inventory-r3';
