/**
 * CI-OBS-001D — Reviewer kernel record types.
 *
 * Decision-record vocabulary for the stateless reviewer function defined by
 * `docs/ci-obs-001d-001-reviewer-decision-contract.md`. These types are OWNED
 * by 001D (decision records); the domain vocabularies they reference
 * (`CIClassification`, `CIConclusion`, evidence/observation shapes) remain
 * frozen 001B contracts and are never extended here.
 *
 * Invariants (from 001D-001 §10):
 *   - Decision is record, not mutation — outputs imply no state change.
 *   - Priors are context only — prior ids never appear in ref sets.
 *   - LLM output never enters the evidence channel (no LLM exists here).
 */

import type { CIClassification, CIConclusion } from '@vestara/ci-contracts';

/** Promotion verdict for one proposal or a whole review. */
export type PromotionVerdict = 'promote' | 'hold' | 'reject' | 'unknown';

/** Closed vocabulary — all valid promotion verdicts. */
export const PROMOTION_VERDICTS: readonly PromotionVerdict[] = ['promote', 'hold', 'reject', 'unknown'];

/** Where the underlying CI state stands at review time. */
export type VerificationState =
  | { readonly kind: 'ci-terminal'; readonly conclusion: CIConclusion }
  | { readonly kind: 'ci-nonterminal' }
  | { readonly kind: 'retrieval-failure'; readonly reason: string }
  | { readonly kind: 'no-observation' };

/**
 * Canonical scope keys for hypothesis-memory matching (001D-001 §6.5).
 *
 * NOTE: frozen `CIObservation` carries no repository identity — only `runId`
 * and `commitSha`. The kernel therefore scopes overlap on run/commit linkage
 * alone and can never match across unrelated runs. `repository` stays on the
 * prior side for 001E durable joins (via `CIVerificationRun.repository`,
 * which the observation does not carry). This is recorded, not repaired:
 * widening the observation contract is forbidden.
 */
export interface ScopeKeys {
  /** Owner/name repository reference (prior side; absent on live observations). */
  readonly repository?: string;
  /** Workflow/run identity, when known. */
  readonly runId?: string;
  /** Workflow name, when known. */
  readonly workflowName?: string;
  /** Commit tested, when known (history, never scope-identity alone). */
  readonly commitSha?: string;
  /** Attempt number, when known. */
  readonly attempt?: number;
}

/**
 * Minimum prior-record input shape for reconsideration (001D-001 §1.4).
 * Priors are read-only context: cited in rationale/`reconsiders`, never refs.
 */
export interface PriorRecord {
  /** Durable 001E hypothesis/finding id. */
  readonly priorId: string;
  /** Kind of prior record. */
  readonly kind: 'hypothesis' | 'finding';
  /** Status as recorded by 001E (cited, never re-resolved). */
  readonly recordedStatus: string;
  /** Canonical scope keys (compared, never mutated). */
  readonly scopeKeys: ScopeKeys;
  /** Human-readable summary or durable reference. */
  readonly summaryOrRef: string;
}

/** A proposed hypothesis within one review (001D-001 §5). */
export interface HypothesisProposal {
  /** Stable within the review (`prop-1`, `prop-2`, … — ordinal, never hashed). */
  readonly proposalId: string;
  /** The claim. */
  readonly statement: string;
  /** Proposed assignment for this hypothesis. */
  readonly classification: CIClassification;
  /** Proposals are always born `proposed`; lifecycle is 001E's. */
  readonly status: 'proposed';
  /** Supporting refs — one entry per distinct signal (deduped). */
  readonly evidenceRefs: readonly string[];
  /** Contradicting refs known to this proposal (input evidence ids only). */
  readonly contradictionRefs: readonly string[];
  /** Per-proposal evidence-quality summary (never authorizes promotion). */
  readonly confidence: 'low' | 'medium' | 'high';
  /** Per-proposal promotion verdict. */
  readonly verdict: PromotionVerdict;
  /** Optional intra-review link; durable supersession is 001E's. */
  readonly supersedesProposal?: string;
  /** Prior reconsideration link (001D-001 §7 case 9); rationale carries the recommendation. */
  readonly reconsiders?: string;
}

/** A promotion decision record — decision, not mutation (001D-001 §3). */
export interface PromotionDecision {
  /** The verdict. */
  readonly verdict: PromotionVerdict;
  /** Affirmative evidence sufficient for the claim — deduped distinct signals. */
  readonly evidenceRefs: readonly string[];
  /** Material contradictory evidence considered (possibly empty). */
  readonly contradictionRefs: readonly string[];
  /** Human-readable: what was claimed, why, on what basis. */
  readonly rationale: string;
  /** Explicit bounds: what was NOT established, what could overturn this. */
  readonly limitations: readonly string[];
  /** Evidence-quality summary ONLY — never authorizes promotion. */
  readonly confidence: 'low' | 'medium' | 'high';
  /** Where the underlying CI state stands. */
  readonly verificationState: VerificationState;
}

/** One review's complete decision output. */
export interface ReviewerDecision {
  /** Assigned classification (frozen 001B member). */
  readonly classification: CIClassification;
  /** Sibling proposals — all considered, none silently dropped. */
  readonly hypotheses: readonly HypothesisProposal[];
  /** Review-level promotion record. */
  readonly promotion: PromotionDecision;
}
