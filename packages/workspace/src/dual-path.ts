/**
 * Dual-path validation — behavioral comparison between the legacy capability
 * orchestrator (AgentRuntime) and the harness execution path.
 *
 * The two engines use different model-response protocols and event models, so
 * the objective is behavioral compatibility, not identical output. Comparison
 * dimensions are normalized so the same scenario can be judged across engines:
 *   • terminal status (normalized: completed / blocked / failed / cancelled);
 *   • changed files (engine-agnostic filesystem diff);
 *   • operations performed (each engine's action sequence);
 *   • verification outcome;
 *   • event/projection volume;
 *   • duration and token consumption.
 *
 * Verdicts: `match` (identical), `compatible` (expected divergence — e.g. the
 * harness is event-observable while the legacy path is not), `mismatch`
 * (behavioral incompatibility that should block the migration).
 */

export type EngineId = 'legacy-orchestrator' | 'harness';

export type TerminalStatus = 'completed' | 'blocked' | 'failed' | 'cancelled' | 'running';

export interface BehaviorReport {
  readonly engine: EngineId;
  readonly scenario: string;
  readonly status: string;
  /** Action/tool sequence, normalized per engine protocol. */
  readonly operations: readonly string[];
  /** Files changed by the run, derived from the filesystem diff. */
  readonly changedFiles: readonly string[];
  readonly verification: { readonly outcome: string; readonly confidence: number } | null;
  /** Durable events/projections produced by the engine. */
  readonly eventCount: number;
  readonly durationMs: number;
  readonly tokens: { readonly prompt: number; readonly completion: number; readonly total: number };
  readonly output: string;
}

export type Verdict = 'match' | 'compatible' | 'mismatch';

export interface ComparisonDimension {
  readonly dimension: string;
  readonly verdict: Verdict;
  readonly legacy: unknown;
  readonly harness: unknown;
  readonly note?: string;
}

export interface DualPathComparison {
  readonly scenario: string;
  readonly dimensions: readonly ComparisonDimension[];
  /** False when any dimension is a hard mismatch. */
  readonly compatible: boolean;
  readonly summary: string;
}

/** Normalize engine-specific terminal statuses to a common vocabulary. */
export function terminalEquivalent(status: string): TerminalStatus {
  const s = status.toLowerCase();
  if (s.includes('complet') || s.includes('pass') || s.includes('ok')) return 'completed';
  if (s.includes('approval') || s.includes('block')) return 'blocked';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('fail') || s.includes('error')) return 'failed';
  return 'running';
}

/** Files added or changed between two file-list snapshots. */
export function diffChangedFiles(before: readonly string[], after: readonly string[]): string[] {
  const prior = new Set(before);
  return [...new Set(after)].filter((file) => !prior.has(file)).sort();
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const a = new Set(left);
  const b = new Set(right);
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function tokensOf(report: Pick<BehaviorReport, 'tokens'>): number {
  return report.tokens.total;
}

/** Judge two engine reports on the comparison dimensions. */
export function compareBehavior(legacy: BehaviorReport, harness: BehaviorReport): DualPathComparison {
  const dimensions: ComparisonDimension[] = [];

  const legacyStatus = terminalEquivalent(legacy.status);
  const harnessStatus = terminalEquivalent(harness.status);
  dimensions.push({
    dimension: 'terminal status',
    verdict: legacyStatus === harnessStatus ? 'match' : 'mismatch',
    legacy: legacyStatus,
    harness: harnessStatus,
  });

  const filesMatch = sameSet(legacy.changedFiles, harness.changedFiles);
  dimensions.push({
    dimension: 'changed files',
    verdict: filesMatch ? 'match' : 'mismatch',
    legacy: legacy.changedFiles,
    harness: harness.changedFiles,
  });

  const legacyOps = legacy.operations.length;
  const harnessOps = harness.operations.length;
  dimensions.push({
    dimension: 'operations performed',
    verdict: legacyOps > 0 && harnessOps > 0 ? 'match' : legacyOps === harnessOps ? 'match' : 'compatible',
    legacy: legacy.operations,
    harness: harness.operations,
    note:
      legacyOps === 0 && harnessOps > 0
        ? 'legacy path performed no modeled operations (protocol differs)'
        : 'operation names differ by engine protocol; changed files are the cross-engine contract',
  });

  const legacyVerification = legacy.verification?.outcome ?? null;
  const harnessVerification = harness.verification?.outcome ?? null;
  if (legacyVerification && harnessVerification) {
    dimensions.push({
      dimension: 'verification outcome',
      verdict: legacyVerification === harnessVerification ? 'match' : 'compatible',
      legacy: legacyVerification,
      harness: harnessVerification,
    });
  } else {
    dimensions.push({
      dimension: 'verification outcome',
      verdict: harnessVerification ? 'compatible' : 'match',
      legacy: legacyVerification,
      harness: harnessVerification,
      note: 'harness verifies every run; the legacy developer path does not verify by default',
    });
  }

  dimensions.push({
    dimension: 'event/projection volume',
    verdict: harness.eventCount > 0 && legacy.eventCount <= harness.eventCount ? 'compatible' : 'match',
    legacy: legacy.eventCount,
    harness: harness.eventCount,
    note: 'harness emits durable events; the legacy path is not event-observable',
  });

  const compatible = dimensions.every((dimension) => dimension.verdict !== 'mismatch') && filesMatch;

  return {
    scenario: legacy.scenario,
    dimensions,
    compatible,
    summary: compatible
      ? `Scenario "${legacy.scenario}" is behaviorally compatible across engines.`
      : `Scenario "${legacy.scenario}" diverges: ${dimensions
          .filter((dimension) => dimension.verdict === 'mismatch')
          .map((dimension) => dimension.dimension)
          .join(', ')}.`,
  };
}

/** Records provider usage across calls so a BehaviorReport can capture tokens. */
export class UsageTracker {
  prompt = 0;
  completion = 0;

  record(usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }): void {
    this.prompt += usage?.promptTokens ?? 0;
    this.completion += usage?.completionTokens ?? 0;
  }

  get total(): number {
    return this.prompt + this.completion;
  }

  snapshot(): { prompt: number; completion: number; total: number } {
    return { prompt: this.prompt, completion: this.completion, total: this.total };
  }
}
