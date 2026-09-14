/**
 * VES-REPO-008 — Attribution evaluation (pure policy, no I/O).
 *
 * Evaluates explicit provenance evidence over an observed change:
 *   ObservedRepositoryChange + execution context + optional correlation
 *   + explicit evidence items → AttributionResult
 *
 * PROVEN threshold (required deliverable): PROVEN requires at least one
 * `direct-write` item naming the attributed execution whose paths cover
 * every observed path, with no competing, human, or external evidence.
 * A `direct-write` item is a governed write operation binding execution
 * identity to affected paths, emitted at the mutation boundary. No current
 * Vestara producer emits such evidence (tool observations carry operation
 * ids without execution binding; capability observations carry agent — not
 * execution — identity; monitors carry paths without actors). PROVEN is
 * therefore currently unreachable. That is the truthful answer; the
 * threshold is not lowered to make it reachable.
 *
 * Decision ladder:
 * - no observed difference → UNKNOWN (`no observed difference`), no ChangeSet;
 * - PROVEN-grade direct evidence, exclusive and covering → PROVEN;
 * - at least two distinct supporting facts with zero competitors → CORRELATED;
 * - a lone supporting fact → UNKNOWN (association, not attribution);
 * - competitors, partial coverage, or conflicts → AMBIGUOUS (`mixed`);
 * - material change with no supporting evidence → UNKNOWN, no ChangeSet.
 * CORRELATED never promotes: the ladder is one-way downward only.
 *
 * Coverage rule: path coverage is verifiable only when the observed file
 * list is supplied. Direct-write evidence without a verifiable file list
 * cannot establish exclusivity and continues down the ladder.
 */
import type { AttributionConfidence, ChangeAttribution, ObservedFileChange, RepositoryChangeSet } from './changeset';
import type { ExecutionRepositoryContext } from './context';
import type { RuntimeSessionCorrelation } from './correlation';
import type { ExecutionId, RuntimeSessionId } from './identity';
import type { ObservedRepositoryChange } from './observed-change';

/**
 * Closed vocabulary of provenance facts the evaluator accepts. Every item
 * is an explicitly asserted fact from an authoritative boundary — the
 * evaluator never collects evidence itself and never invents lineage.
 */
export type AttributionEvidence =
  | { readonly kind: 'session-link'; readonly executionId: ExecutionId; readonly runtimeSessionId: RuntimeSessionId }
  | { readonly kind: 'mutate-granted'; readonly executionId: ExecutionId }
  | { readonly kind: 'intent-overlap'; readonly executionId: ExecutionId; readonly overlappingPaths: readonly string[] }
  | { readonly kind: 'tool-activity'; readonly executionId?: ExecutionId; readonly description: string }
  | { readonly kind: 'competing-execution'; readonly executionId: ExecutionId }
  | { readonly kind: 'human-activity'; readonly detail?: string }
  | { readonly kind: 'external-activity'; readonly detail?: string }
  | { readonly kind: 'direct-write'; readonly executionId: ExecutionId; readonly paths: readonly string[] };

/** Evaluator input — all links explicit and testable. */
export interface EvaluateAttributionInput {
  readonly change: ObservedRepositoryChange;
  readonly context: ExecutionRepositoryContext;
  readonly sessionCorrelation?: RuntimeSessionCorrelation;
  readonly evidence: readonly AttributionEvidence[];
  readonly observedFiles?: readonly ObservedFileChange[];
}

/** Fail-closed evaluator failures (linkage refusal, never attribution). */
export type AttributionFailureReason = 'invalid-context' | 'context-change-mismatch' | 'correlation-mismatch';

export interface AttributionFailure {
  readonly ok: false;
  readonly reason: AttributionFailureReason;
  readonly detail: string;
}

/** Attribution outcome. `changeSet` exists only for PROVEN, CORRELATED, and AMBIGUOUS. */
export interface AttributionResult {
  readonly ok: true;
  readonly attribution: ChangeAttribution;
  readonly confidence: AttributionConfidence;
  readonly reasons: readonly string[];
  readonly changeSet?: RepositoryChangeSet;
}

export type EvaluateAttributionResult = AttributionResult | AttributionFailure;

/** Injectable seams (id generation only — evaluation itself is pure). */
export interface AttributionEvaluatorDeps {
  readonly generateChangeSetId: () => RepositoryChangeSet['changeSetId'];
}

function fail(reason: AttributionFailureReason, detail: string): AttributionFailure {
  return { ok: false, reason, detail };
}

function namesExecution(item: AttributionEvidence, executionId: ExecutionId): boolean {
  return 'executionId' in item && item.executionId !== undefined && item.executionId === executionId;
}

/**
 * Evaluate attribution. Pure: same inputs always yield the same outcome.
 * Cross-wired links fail closed; insufficient evidence yields UNKNOWN —
 * never a convenient execution owner.
 */
export function evaluateAttribution(
  input: EvaluateAttributionInput,
  deps: AttributionEvaluatorDeps,
): EvaluateAttributionResult {
  const { change, context } = input;
  if (
    change.executionId !== context.executionId ||
    change.repositoryId !== context.repositoryId ||
    change.baselineSnapshotId !== context.baselineSnapshotId
  ) {
    return fail(
      'context-change-mismatch',
      'Observed change does not belong to this execution context; links are refused, never re-targeted.',
    );
  }
  if (input.sessionCorrelation !== undefined) {
    const correlation = input.sessionCorrelation;
    if (
      correlation.executionId !== context.executionId ||
      correlation.repositoryContext.baselineSnapshotId !== context.baselineSnapshotId
    ) {
      return fail('correlation-mismatch', 'Session correlation names another execution or baseline.');
    }
  }

  if (!change.comparison.materialChange) {
    return {
      ok: true,
      attribution: 'unknown',
      confidence: 'UNKNOWN',
      reasons: ['no observed difference between baseline and observed snapshots'],
    };
  }

  const executionId = context.executionId;
  const reasons: string[] = ['baseline S0 agrees with execution context'];
  const forExecution = input.evidence.filter((item) => namesExecution(item, executionId));
  const competing = input.evidence.filter(
    (item) =>
      item.kind === 'competing-execution' ||
      item.kind === 'human-activity' ||
      item.kind === 'external-activity' ||
      (item.kind === 'tool-activity' && !namesExecution(item, executionId)) ||
      (item.kind === 'direct-write' && !namesExecution(item, executionId)),
  );
  const directWrites = forExecution.filter(
    (item): item is Extract<AttributionEvidence, { kind: 'direct-write' }> => item.kind === 'direct-write',
  );

  const observedPaths = (input.observedFiles ?? []).map((file) => file.path);
  const granular = input.evidence.some(
    (item) => item.kind === 'direct-write' || (item.kind === 'intent-overlap' && namesExecution(item, executionId)),
  );
  const coveredPaths = new Set<string>();
  for (const item of forExecution) {
    if (item.kind === 'direct-write') for (const path of item.paths) coveredPaths.add(path);
    if (item.kind === 'intent-overlap') for (const path of item.overlappingPaths) coveredPaths.add(path);
  }
  const uncovered = granular ? observedPaths.filter((path) => !coveredPaths.has(path)) : [];

  const supportKinds = new Set(forExecution.map((item) => item.kind));
  if (input.sessionCorrelation !== undefined) {
    supportKinds.add('session-link');
    reasons.push(`runtime session ${input.sessionCorrelation.runtimeSessionId} explicitly linked`);
  }
  if (context.accessMode === 'MUTATE') {
    supportKinds.add('mutate-granted');
    reasons.push('MUTATE access mode granted (authority, not proof of use)');
  }
  for (const item of forExecution) {
    if (item.kind === 'intent-overlap') {
      reasons.push(`${item.overlappingPaths.length} declared intent paths overlap observed changes`);
    }
    if (item.kind === 'tool-activity') reasons.push(`bound runtime activity observed: ${item.description}`);
    if (item.kind === 'direct-write') reasons.push(`direct write evidence covers ${item.paths.length} paths`);
  }

  const files = input.observedFiles ?? [];
  const buildChangeSet = (
    attribution: ChangeAttribution,
    confidence: AttributionConfidence,
    withIdentity: boolean,
  ): RepositoryChangeSet => ({
    changeSetId: deps.generateChangeSetId(),
    repositoryId: context.repositoryId,
    ...(withIdentity
      ? {
          executionId: context.executionId,
          ...(input.sessionCorrelation ? { runtimeSessionId: input.sessionCorrelation.runtimeSessionId } : {}),
        }
      : {}),
    baselineSnapshotId: context.baselineSnapshotId,
    files,
    declaredScope: context.changeIntent.scopes,
    observedScope: [],
    startedAt: context.boundAt,
    observedAt: change.observedAt,
    attribution,
    confidence,
  });

  // PROVEN: direct-write evidence, verifiable full path coverage, zero
  // competitors. Coverage requires the observed file list — without it,
  // exclusivity cannot be established and the ladder continues downward.
  const coverageVerifiable = input.observedFiles !== undefined;
  if (directWrites.length > 0 && coverageVerifiable && competing.length === 0 && uncovered.length === 0) {
    return {
      ok: true,
      attribution: 'vestara-execution',
      confidence: 'PROVEN',
      reasons,
      changeSet: buildChangeSet('vestara-execution', 'PROVEN', true),
    };
  }

  // CORRELATED: at least two distinct supporting facts, zero competitors,
  // full coverage where verifiable. A lone fact (MUTATE alone, intent alone,
  // session link alone) is association, not attribution → UNKNOWN.
  const hasSupport = supportKinds.size >= 2;
  if (competing.length > 0 || uncovered.length > 0) {
    for (const item of competing) {
      if (item.kind === 'competing-execution') reasons.push(`competing execution ${item.executionId} present`);
      if (item.kind === 'human-activity') reasons.push('human activity evidence present');
      if (item.kind === 'external-activity') reasons.push('external activity evidence present');
      if (item.kind === 'tool-activity') reasons.push('unattributable runtime activity present');
      if (item.kind === 'direct-write') reasons.push(`foreign direct-write evidence from ${item.executionId} present`);
    }
    if (uncovered.length > 0) reasons.push(`${uncovered.length} observed paths lack supporting evidence`);
    return {
      ok: true,
      attribution: 'mixed',
      confidence: 'AMBIGUOUS',
      reasons,
      changeSet: buildChangeSet('mixed', 'AMBIGUOUS', false),
    };
  }

  if (hasSupport) {
    return {
      ok: true,
      attribution: 'vestara-execution',
      confidence: 'CORRELATED',
      reasons,
      changeSet: buildChangeSet('vestara-execution', 'CORRELATED', true),
    };
  }

  return {
    ok: true,
    attribution: 'unknown',
    confidence: 'UNKNOWN',
    reasons: ['material change observed with no supporting provenance evidence'],
  };
}
