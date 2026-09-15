/**
 * CI-OBS-001D — Stateless Reviewer kernel.
 *
 * Pure decision function implementing `docs/ci-obs-001d-001-reviewer-decision-contract.md`
 * (T1–T15, I1–I13, V1–V15):
 *
 *   review(observation, evidence, priors) -> ReviewerDecision
 *
 * Hard boundaries (non-negotiable, tested):
 *   - Deterministic: same inputs → same decision. No clock, no network, no LLM,
 *     no persistence, no ambient state. Proposal ids are input-order ordinals
 *     (`prop-1`, …) — never hashed (MINOR-3: no reviewer-side hashing at all).
 *   - Evidence consumed by reference only (`evidenceId`); the kernel mints no
 *     evidence, synthesizes none, re-extracts nothing.
 *   - Closed 001B classification vocabulary; members assigned, never extended.
 *   - Duplicate records of one signal collapse: `evidenceRefs` holds one entry
 *     per distinct signal; duplicate provenance lives in rationale/limitations.
 *   - Priors are context only — prior ids never enter ref sets.
 *   - Nonterminal CI cannot promote (MAJOR-1): verdicts stay `hold`/`unknown`.
 *   - Confidence summarizes evidence quality; it never authorizes promotion.
 *   - UNKNOWN and retrieval failure are first-class terminal outputs.
 *   - Outputs are records: no mutation, repair, notification, or execution.
 */

import {
  CI_CLASSIFICATIONS,
  type CIClassification,
  type CIFailureEvidence,
  type CIObservation,
  isRetrievalFailure,
} from '@vestara/ci-contracts';
import type {
  HypothesisProposal,
  PriorRecord,
  PromotionDecision,
  PromotionVerdict,
  ReviewerDecision,
  ScopeKeys,
} from './types';

// ─── Internal signal model ──────────────────────────────────────────

interface DistinctSignal {
  /** Representative record (first occurrence in input order). */
  readonly evidence: CIFailureEvidence;
  /** All record ids collapsing into this signal (first = representative). */
  readonly recordIds: readonly string[];
  /** Scope proxy: step identity; distinct steps are distinct scopes. */
  readonly scope: string;
  /** Specificity: exit-coded, step-named signal (discriminator-grade). */
  readonly discriminating: boolean;
  /** Assigned member, if any marker set matched. */
  readonly member: CIClassification | null;
}

function signalScope(evidence: CIFailureEvidence): string {
  return evidence.stepName ?? '';
}

function isDiscriminating(evidence: CIFailureEvidence): boolean {
  return typeof evidence.exitCode === 'number' && evidence.stepName !== undefined && evidence.stepName !== '';
}

function signalKey(evidence: CIFailureEvidence): string {
  return [
    evidence.kind,
    evidence.stepName ?? '',
    typeof evidence.exitCode === 'number' ? String(evidence.exitCode) : '',
    evidence.summary,
    evidence.logContent ?? '',
  ].join('\u0000');
}

// ─── Deterministic marker rules (ordered by member; explicit, reviewable) ──
// A signal may match several members (shared support → siblings). Matching is
// deliberately conservative: no match means UNKNOWN, never a guessed member.

const MEMBER_MARKERS: Readonly<Record<Exclude<CIClassification, 'CANCELLED' | 'UNKNOWN'>, readonly RegExp[]>> = {
  TEST: [/test-output/, /\btests?\b|\btesting\b|spec\b|jest|vitest|pytest|mocha|assert|unittest/i],
  BUILD: [/build-output/, /\bbuild\b|compil|tsc\b|webpack|linker|bundle/i],
  CONTRACT: [/\bcontract\b|schema|pact|api (mismatch|incompatible|changed)|breaking change/i],
  CONFIGURATION: [
    /invalid (config|yaml|workflow)|config.*(error|invalid|missing)|secret.*(missing|not found|invalid)/i,
  ],
  DEPENDENCY: [/EAI_AGAIN|ETIMEDOUT|ECONNRESET|package not found|unresolved dependenc|lockfile/i],
  INFRASTRUCTURE: [/\brunner\b|agent (lost|unreachable)|connection (lost|refused|reset)|infrastructure/i],
  RESOURCE: [/out of memory|\boom\b|memory exhausted|disk full|no space|exit[^0-9]*(137|134)/i],
  FLAKE: [/flak|intermittent|passed on (re)?try|retry (passed|succeeded)/i],
  CODE: [/stack-trace/, /traceback|TypeError|ReferenceError|NullPointer|segmentation fault|panic:/i],
};

function matchText(evidence: CIFailureEvidence): string {
  return `${evidence.kind} ${evidence.stepName ?? ''} ${evidence.summary} ${evidence.logContent ?? ''}`;
}

function membersFor(evidence: CIFailureEvidence): CIClassification[] {
  const text = matchText(evidence);
  const matched: CIClassification[] = [];
  for (const member of CI_CLASSIFICATIONS) {
    if (member === 'CANCELLED' || member === 'UNKNOWN') continue;
    const patterns = MEMBER_MARKERS[member as keyof typeof MEMBER_MARKERS];
    if (patterns.some((pattern) => pattern.test(text))) matched.push(member);
  }
  return matched;
}

// ─── Scope & compatibility ──────────────────────────────────────────
// Same-scope distinct non-UNKNOWN members are incompatible (at most one can
// describe one step's failure). Distinct scopes are independent (V9).
// Incompatibility is expressed structurally through same-scope rival sets
// below, not through a predicate.

// ─── Scope keys & prior overlap (001D-001 §6.5, §7 case 9) ──────────

function currentScopeKeys(observation: CIObservation): ScopeKeys {
  // Frozen CIObservation carries runId + commitSha but no repository:
  // overlap below therefore requires run/commit linkage, never bare similarity.
  return {
    runId: observation.runId,
    commitSha: observation.commitSha,
  };
}

function scopesOverlap(prior: ScopeKeys, current: ScopeKeys): boolean {
  if (prior.runId !== undefined && current.runId !== undefined && prior.runId === current.runId) {
    return true;
  }
  if (prior.commitSha !== undefined && current.commitSha !== undefined && prior.commitSha === current.commitSha) {
    return true;
  }
  return false;
}

// ─── Collapse + support ─────────────────────────────────────────────

interface CollapsedInput {
  readonly signals: readonly DistinctSignal[];
  /** Duplicate record ids (provenance, never sufficiency). */
  readonly duplicateIds: readonly string[];
}

function collapseEvidence(evidence: readonly CIFailureEvidence[]): CollapsedInput {
  const signals: DistinctSignal[] = [];
  const duplicateIds: string[] = [];
  const seenIds = new Set<string>();
  const seenKeys = new Map<string, number>();
  for (const item of evidence) {
    if (seenIds.has(item.evidenceId)) {
      duplicateIds.push(item.evidenceId);
      continue;
    }
    seenIds.add(item.evidenceId);
    const key = signalKey(item);
    const existing = seenKeys.get(key);
    if (existing !== undefined) {
      const prior = signals[existing];
      signals[existing] = { ...prior, recordIds: [...prior.recordIds, item.evidenceId] };
      duplicateIds.push(item.evidenceId);
      continue;
    }
    seenKeys.set(key, signals.length);
    signals.push({
      evidence: item,
      recordIds: [item.evidenceId],
      scope: signalScope(item),
      discriminating: isDiscriminating(item),
      member: null,
    });
  }
  return { signals, duplicateIds };
}

interface MemberSupport {
  readonly member: CIClassification;
  readonly signals: readonly DistinctSignal[];
}

function supportByMember(signals: readonly DistinctSignal[]): MemberSupport[] {
  const supported = new Map<CIClassification, DistinctSignal[]>();
  for (const signal of signals) {
    for (const member of membersFor(signal.evidence)) {
      const list = supported.get(member) ?? [];
      list.push(signal);
      supported.set(member, list);
    }
  }
  return [...supported.entries()]
    .sort(([a], [b]) => CI_CLASSIFICATIONS.indexOf(a) - CI_CLASSIFICATIONS.indexOf(b))
    .map(([member, memberSignals]) => ({ member, signals: memberSignals }));
}

// ─── Confidence calibration (summary only — never authorizes) ───────

type Confidence = 'low' | 'medium' | 'high';

function calibrate(
  support: readonly DistinctSignal[],
  contradictionCount: number,
  outOfScopePriorCited: boolean,
): Confidence {
  const strong = support.filter((signal) => signal.discriminating).length;
  const intact = support.every((signal) => signal.evidence.url !== undefined && signal.evidence.url !== '');
  let level: Confidence =
    strong >= 1 || support.length >= 2 ? (support.length >= 2 && strong >= 1 ? 'high' : 'medium') : 'low';
  if (contradictionCount > 0 && level === 'high') level = 'medium';
  if (!intact || outOfScopePriorCited) level = 'low';
  return level;
}

// ─── Review entry point ─────────────────────────────────────────────

export interface ReviewInputs {
  readonly observation: CIObservation | null | undefined;
  readonly evidence: readonly CIFailureEvidence[];
  readonly priors?: readonly PriorRecord[];
}

/**
 * Pure reviewer decision function (001D-001 §1).
 * Same inputs → same decision. No IO, no clock, no ambient state.
 */
export function review(inputs: ReviewInputs): ReviewerDecision {
  const { observation } = inputs;
  const evidence = inputs.evidence ?? [];
  const priors = inputs.priors ?? [];

  // T1 — absent observation.
  if (observation === null || observation === undefined) {
    return unknownDecision(
      { kind: 'no-observation' },
      'No observation supplied: nothing was seen, so nothing is claimed.',
      ['Supply a CIObservation to enable review.'],
    );
  }

  // T2 — retrieval failure is detected canonically, never inferred.
  if (isRetrievalFailure(observation)) {
    const reason = observation.provenance.length > 0 ? observation.provenance[0] : 'unspecified retrieval failure';
    return unknownDecision(
      { kind: 'retrieval-failure', reason },
      `Retrieval failure (${reason}): the CI failure itself was not observed and is not classified.`,
      ['Re-establish observation of the run before review.'],
    );
  }

  const terminal = observation.status === 'completed';
  const { signals, duplicateIds } = collapseEvidence(evidence);
  const support = supportByMember(signals);
  const scope = currentScopeKeys(observation);

  // Nonterminal CI: hypotheses may form, promotion is impossible (MAJOR-1, T3/T4).
  if (!terminal) {
    return nonterminalDecision(observation, signals, support, duplicateIds, priors, scope);
  }

  // Terminal CI by conclusion family.
  if (observation.conclusion === 'failed') {
    return failedDecision(observation, signals, support, duplicateIds, priors, scope);
  }
  if (observation.conclusion === 'cancelled') {
    return cancelledDecision(observation, signals, support, duplicateIds, priors, scope);
  }
  // T13 literal: passed / timed_out / skipped / unknown — nothing failed to classify.
  return unknownDecision(
    { kind: 'ci-terminal', conclusion: observation.conclusion },
    `Terminal conclusion '${observation.conclusion}': no failure to classify.`,
    [],
    'UNKNOWN',
  );
}

// ─── Terminal branches ──────────────────────────────────────────────

function failedDecision(
  observation: CIObservation,
  signals: readonly DistinctSignal[],
  support: MemberSupport[],
  duplicateIds: readonly string[],
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): ReviewerDecision {
  const state = { kind: 'ci-terminal', conclusion: observation.conclusion } as const;

  // T5 — terminal failed, empty evidence.
  if (signals.length === 0) {
    return unknownDecision(
      state,
      'Terminal failure with no evidence: absence of evidence is not evidence of any classification.',
      ['Failed-step logs for the failed job(s) would enable review.'],
    );
  }

  // Partition support into per-scope groups for compatibility (V9).
  const scopes = distinctScopes(support);
  const proposals: HypothesisProposal[] = [];
  let ordinal = 0;
  const nextId = () => `prop-${++ordinal}`;

  for (const scopeName of scopes) {
    const inScope = support.filter((entry) => entry.signals.some((signal) => signal.scope === scopeName));
    if (inScope.length === 0) continue;
    if (inScope.length === 1) {
      const entry = inScope[0];
      // Single-signal support promotes ONLY when it is one discriminating record
      // (V3). Duplicates-only (T10) or single weak signals (V2/case 2) hold.
      if (isSoleSufficient(entry)) {
        proposals.push(promoteProposal(nextId(), entry, [], priors, scope));
      } else {
        proposals.push(weakHoldProposal(nextId(), entry, priors, scope));
      }
      continue;
    }
    // Same-scope rivals: incompatible — discriminate or hold all (case 7/8, V7/V8).
    const discriminated = inScope.filter(
      (entry) =>
        entry.signals.some((signal) => signal.discriminating) &&
        inScope.every((other) => other === entry || !other.signals.some((signal) => signal.discriminating)),
    );
    if (discriminated.length === 1) {
      const winner = discriminated[0];
      const losers = inScope.filter((entry) => entry !== winner);
      const loserIds = losers.flatMap((entry) => entry.signals.map((signal) => signal.evidence.evidenceId));
      proposals.push(promoteProposal(nextId(), winner, loserIds, priors, scope));
      for (const loser of losers) {
        const rivalIds = inScope
          .filter((entry) => entry !== loser)
          .flatMap((entry) => entry.signals.map((signal) => signal.evidence.evidenceId));
        const rivalLabel = inScope
          .filter((entry) => entry !== loser)
          .map((entry) => entry.member)
          .join('/');
        proposals.push(holdProposal(nextId(), loser, rivalIds, rivalLabel, priors, scope));
      }
      continue;
    }
    for (const entry of inScope) {
      const rivals = inScope.filter((other) => other !== entry);
      const rivalIds = rivals.flatMap((rival) => rival.signals.map((signal) => signal.evidence.evidenceId));
      const rivalLabel = rivals.map((rival) => rival.member).join('/');
      proposals.push(holdProposal(nextId(), entry, rivalIds, rivalLabel, priors, scope));
    }
  }

  // T9/T10 — support exists but nothing matched any member: single UNKNOWN hold.
  if (proposals.length === 0) {
    const refs = signals.map((signal) => signal.evidence.evidenceId);
    const overlapping = priors.filter((prior) => scopesOverlap(prior.scopeKeys, scope));
    const limitations = [
      'Observed signal(s) match no canonical classification member; specificity missing.',
      ...(duplicateIds.length > 0
        ? [`${duplicateIds.length} duplicate record(s) collapse to the cited signal(s) and add no support.`]
        : []),
    ];
    const proposal: HypothesisProposal = {
      proposalId: 'prop-1',
      statement: `Unclassified failure evidence (${refs.length} distinct signal(s)) — specificity missing.`,
      classification: 'UNKNOWN',
      status: 'proposed',
      evidenceRefs: refs,
      contradictionRefs: [],
      confidence: 'low',
      verdict: 'hold',
      ...(overlapping.length > 0 ? { reconsiders: overlapping[0].priorId } : {}),
    };
    return {
      classification: 'UNKNOWN',
      hypotheses: [proposal],
      promotion: {
        verdict: 'hold',
        evidenceRefs: [],
        contradictionRefs: [],
        rationale: `Terminal failure with genuine but nonspecific evidence (${refs.length} distinct signal(s)). No promotable claim; specificity pending.`,
        limitations,
        confidence: 'low',
        verificationState: state,
      },
    };
  }

  const promoted = proposals.filter((proposal) => proposal.verdict === 'promote');
  const promotedMembers = [...new Set(promoted.map((proposal) => proposal.classification))];
  const reviewVerdict = promoted.length > 0 ? 'promote' : 'hold';
  // Multi-cause compatible promotion carries no single category (V9);
  // held-only reviews claim no member (T7/T9/T10/T11).
  const classification: CIClassification = promotedMembers.length === 1 ? promotedMembers[0] : 'UNKNOWN';
  const unionRefs = [...new Set(promoted.flatMap((proposal) => proposal.evidenceRefs))];
  const unionContra = [...new Set(proposals.flatMap((proposal) => proposal.contradictionRefs))];
  return {
    classification,
    hypotheses: proposals,
    promotion: {
      verdict: reviewVerdict,
      evidenceRefs: unionRefs,
      contradictionRefs: unionContra,
      rationale:
        reviewVerdict === 'promote'
          ? `Terminal failure: ${promoted.length} compatible proposal(s) promote on distinct sufficient signals.`
          : `Terminal failure: no proposal satisfies the promotion rule; ${proposals.length} proposal(s) held.`,
      limitations:
        reviewVerdict === 'promote'
          ? [
              ...duplicateNote(duplicateIds),
              ...(unionContra.length > 0
                ? [
                    `Rival support dispositioned: ${unionContra.join(', ')} explained as same-scope incompatibility resolved by discriminating signal.`,
                  ]
                : []),
            ]
          : ['No proposal satisfied affirmative sufficiency with zero unresolved contradiction.'],
      confidence: promoted.length > 0 ? promoted[0].confidence : 'low',
      verificationState: state,
    },
  };
}

function isSoleSufficient(entry: MemberSupport): boolean {
  if (entry.signals.length !== 1) return true;
  const sole = entry.signals[0];
  return sole.recordIds.length === 1 && sole.discriminating;
}

function weakHoldProposal(
  proposalId: string,
  entry: MemberSupport,
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): HypothesisProposal {
  const refs = entry.signals.map((signal) => signal.evidence.evidenceId);
  const { rationaleExtra, reconsiderId } = priorContext(priors, scope);
  const duplicate = entry.signals[0].recordIds.length > 1;
  return {
    proposalId,
    statement: duplicate
      ? `Possible ${entry.member} failure resting on copies of a single signal — held as single-signal.${rationaleExtra}`
      : `Possible ${entry.member} failure on a single weak signal — held pending corroboration.${rationaleExtra}`,
    classification: entry.member,
    status: 'proposed',
    evidenceRefs: refs,
    contradictionRefs: [],
    confidence: 'low',
    verdict: 'hold',
    ...(reconsiderId !== undefined ? { reconsiders: reconsiderId } : {}),
  };
}

function distinctScopes(support: MemberSupport[]): string[] {
  const scopes = new Set<string>();
  for (const entry of support) {
    for (const signal of entry.signals) scopes.add(signal.scope);
  }
  return [...scopes].sort();
}

function duplicateNote(duplicateIds: readonly string[]): string[] {
  return duplicateIds.length > 0
    ? [`${duplicateIds.length} duplicate record(s) collapse to cited signals and add no support.`]
    : [];
}

function promoteProposal(
  proposalId: string,
  entry: MemberSupport,
  contradictionIds: readonly string[],
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): HypothesisProposal {
  const refs = entry.signals.map((signal) => signal.evidence.evidenceId);
  const { rationaleExtra, outOfScope, reconsiderId } = priorContext(priors, scope);
  const confidence = calibrate(entry.signals, contradictionIds.length, outOfScope);
  return {
    proposalId,
    statement: `Suspected ${entry.member} failure (${refs.length} distinct signal(s)).${rationaleExtra}`,
    classification: entry.member,
    status: 'proposed',
    evidenceRefs: refs,
    contradictionRefs: [...contradictionIds],
    confidence,
    verdict: 'promote',
    ...(reconsiderId !== undefined ? { reconsiders: reconsiderId } : {}),
  };
}

function holdProposal(
  proposalId: string,
  entry: MemberSupport,
  rivalIds: readonly string[],
  rivalLabel: string,
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): HypothesisProposal {
  const refs = entry.signals.map((signal) => signal.evidence.evidenceId);
  const { rationaleExtra, outOfScope, reconsiderId } = priorContext(priors, scope);
  const rivalNote =
    rivalIds.length > 0
      ? ` Same-scope rival(s) ${rivalLabel} block promotion pending a discriminator.`
      : ' Awaiting discriminating evidence.';
  return {
    proposalId,
    statement: `Possible ${entry.member} failure (${refs.length} distinct signal(s)) — held.${rivalNote}${rationaleExtra}`,
    classification: entry.member,
    status: 'proposed',
    evidenceRefs: refs,
    contradictionRefs: [...rivalIds],
    confidence: calibrate(entry.signals, rivalIds.length, outOfScope),
    verdict: 'hold',
    ...(reconsiderId !== undefined ? { reconsiders: reconsiderId } : {}),
  };
}

function priorContext(
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): { rationaleExtra: string; outOfScope: boolean; reconsiderId: string | undefined } {
  if (priors.length === 0) return { rationaleExtra: '', outOfScope: false, reconsiderId: undefined };
  const overlapping = priors.filter((prior) => scopesOverlap(prior.scopeKeys, scope));
  if (overlapping.length > 0) {
    return {
      rationaleExtra: ` Reconsiders prior(s) ${overlapping.map((prior) => prior.priorId).join(', ')} within overlapping scope; 001E owns standing updates.`,
      outOfScope: false,
      reconsiderId: overlapping[0].priorId,
    };
  }
  return {
    rationaleExtra: ` ${priors.length} prior(s) cited as context only (scope differs); they contribute no support.`,
    outOfScope: true,
    reconsiderId: undefined,
  };
}

// ─── Cancelled terminal (T13 + MINOR-1) ─────────────────────────────

function cancelledDecision(
  observation: CIObservation,
  signals: readonly DistinctSignal[],
  support: MemberSupport[],
  duplicateIds: readonly string[],
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): ReviewerDecision {
  const state = { kind: 'ci-terminal', conclusion: observation.conclusion } as const;
  if (support.length === 0) {
    return unknownDecision(
      state,
      `Terminal conclusion 'cancelled' with no affirmative failure evidence: classification CANCELLED, no failure to classify.`,
      [],
      'CANCELLED',
    );
  }
  // MINOR-1: affirmative failure evidence decides the member; cancellation is context.
  const decision = failedDecision(observation, signals, support, duplicateIds, priors, scope);
  const premise = `Run cancelled, but affirmative failure evidence supports ${decision.classification}; cancellation recorded as context, not as the classification.`;
  return {
    ...decision,
    promotion: {
      ...decision.promotion,
      rationale: `${premise} ${decision.promotion.rationale}`,
      limitations: [`Cancellation context: run did not complete normally.`, ...decision.promotion.limitations],
    },
  };
}

// ─── Nonterminal + unknown constructors ─────────────────────────────

function nonterminalDecision(
  observation: CIObservation,
  signals: readonly DistinctSignal[],
  support: MemberSupport[],
  duplicateIds: readonly string[],
  priors: readonly PriorRecord[],
  scope: ScopeKeys,
): ReviewerDecision {
  const state = { kind: 'ci-nonterminal' } as const;
  const status = String(observation.status);
  const reconsiderId =
    priors.length > 0 && priors.some((prior) => scopesOverlap(prior.scopeKeys, scope))
      ? priors.filter((prior) => scopesOverlap(prior.scopeKeys, scope))[0].priorId
      : undefined;
  const link = reconsiderId !== undefined ? { reconsiders: reconsiderId } : {};
  if (signals.length === 0) {
    return unknownDecision(state, `CI state '${status}' with no evidence: nothing to propose and nothing to promote.`, [
      'Evidence from the running CI would enable interim hypotheses.',
    ]);
  }
  // T4: hold proposals may narrate leading suspicion; verdicts stay hold (MAJOR-1).
  const proposals: HypothesisProposal[] = [];
  let ordinal = 0;
  for (const entry of support) {
    const refs = entry.signals.map((signal) => signal.evidence.evidenceId);
    proposals.push({
      proposalId: `prop-${++ordinal}`,
      statement: `Interim suspicion of ${entry.member} failure (${refs.length} distinct signal(s)) — CI still ${status}.`,
      classification: entry.member,
      status: 'proposed',
      evidenceRefs: refs,
      contradictionRefs: [],
      confidence: 'low',
      verdict: 'hold',
      ...link,
    });
  }
  if (proposals.length === 0) {
    const refs = signals.map((signal) => signal.evidence.evidenceId);
    proposals.push({
      proposalId: 'prop-1',
      statement: `Interim unclassified evidence (${refs.length} distinct signal(s)) — CI still ${status}.`,
      classification: 'UNKNOWN',
      status: 'proposed',
      evidenceRefs: refs,
      contradictionRefs: [],
      confidence: 'low',
      verdict: 'hold',
      ...link,
    });
  }
  return {
    classification: 'UNKNOWN',
    hypotheses: proposals,
    promotion: {
      verdict: 'hold',
      evidenceRefs: [],
      contradictionRefs: [],
      rationale: `Nonterminal CI state ('${status}'): ${proposals.length} interim proposal(s) held. Promotion requires terminal CI state.`,
      limitations: ['Promotion held pending terminal CI observation.', ...duplicateNote(duplicateIds)],
      confidence: 'low',
      verificationState: state,
    },
  };
}

function unknownDecision(
  verificationState: PromotionDecision['verificationState'],
  rationale: string,
  limitations: readonly string[],
  classification: CIClassification = 'UNKNOWN',
): ReviewerDecision {
  return {
    classification,
    hypotheses: [],
    promotion: {
      verdict: 'unknown',
      evidenceRefs: [],
      contradictionRefs: [],
      rationale,
      limitations: [...limitations],
      confidence: 'low',
      verificationState,
    },
  };
}

// ─── Output validation (T15, V10, V11, V13) ─────────────────────────
// Static checks over an emitted decision. Needs the input id sets because
// dangling/prior-as-evidence violations are relative to what was supplied.

export interface ValidationContext {
  /** All evidenceIds supplied to the review. */
  readonly evidenceIds: readonly string[];
  /** All priorIds supplied to the review. */
  readonly priorIds: readonly string[];
}

/**
 * Validate a ReviewerDecision. Returns violation codes; empty means valid.
 * Codes: unknown-classification | invalid-verdict | promotion-without-evidence |
 * dangling-ref | prior-as-evidence.
 */
export function validateReviewerDecision(decision: ReviewerDecision, context: ValidationContext): readonly string[] {
  const violations: string[] = [];
  const knownEvidence = new Set(context.evidenceIds);
  const knownPriors = new Set(context.priorIds);
  if (!CI_CLASSIFICATIONS.includes(decision.classification)) violations.push('unknown-classification');
  const verdicts: PromotionVerdict[] = [
    decision.promotion.verdict,
    ...decision.hypotheses.map((proposal) => proposal.verdict),
  ];
  if (
    verdicts.some(
      (verdict) => verdict !== 'promote' && verdict !== 'hold' && verdict !== 'reject' && verdict !== 'unknown',
    )
  ) {
    violations.push('invalid-verdict');
  }
  const checkRefs = (refs: readonly string[], verdict: PromotionVerdict) => {
    if (verdict === 'promote' && refs.length === 0) violations.push('promotion-without-evidence');
    for (const ref of refs) {
      if (knownPriors.has(ref)) violations.push('prior-as-evidence');
      else if (!knownEvidence.has(ref)) violations.push('dangling-ref');
    }
  };
  checkRefs(decision.promotion.evidenceRefs, decision.promotion.verdict);
  checkRefs(decision.promotion.contradictionRefs, 'hold');
  for (const proposal of decision.hypotheses) {
    if (!CI_CLASSIFICATIONS.includes(proposal.classification)) violations.push('unknown-classification');
    checkRefs(proposal.evidenceRefs, proposal.verdict);
    checkRefs(proposal.contradictionRefs, 'hold');
  }
  return [...new Set(violations)];
}
