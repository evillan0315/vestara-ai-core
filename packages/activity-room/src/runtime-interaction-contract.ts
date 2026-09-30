/**
 * AR-TOOL-ASK-003A — Durable Runtime Question Interaction Contract.
 *
 * Canonical question interaction lifecycle for Activity Room human-claim
 * authority:
 *
 *   pending → presented → claimed
 *
 * plus the contract-defined terminal states needed by the persistence model:
 *
 *   answered | rejected | expired | orphaned | delivery-unknown
 *
 * For 003A, runtime delivery transitions (answered, rejected,
 * delivery-unknown) are REPRESENTABLE by the contract/store but are NOT
 * driven by OpenCode: no path in this milestone performs the OpenCode
 * question reply/reject calls, or any network delivery. Claimed is the terminal
 * human-claim authority state; delivery (003B) moves claimed → answered /
 * rejected / delivery-unknown later.
 *
 * Identity rules (frozen):
 * - conversationId, openCodeSessionId, openCodeRequestId are persisted
 *   BYTE-FOR-BYTE. No trimming, no case folding, no inference. Empty or
 *   non-string identities are rejected (fail closed).
 * - Deterministic interaction identity derives ONLY from the exact
 *   (openCodeSessionId, openCodeRequestId) pair — the pair that carries the
 *   UNIQUE constraint. conversationId is correlated, never part of the id.
 * - Execution/turn/provider identities are carried ONLY where actually
 *   supplied by the runtime. Absent stays absent — never fabricated.
 * - Persisted question/options render data is BOUNDED (counts + lengths).
 */

import { createHash } from 'node:crypto';

/** Canonical lifecycle states for a runtime question interaction. */
export type RuntimeQuestionStatus =
  | 'pending'
  | 'presented'
  | 'claimed'
  | 'answered'
  | 'rejected'
  | 'expired'
  | 'orphaned'
  | 'delivery-unknown';

/** Terminal states: no further lifecycle transition is legal from these. */
export const RUNTIME_QUESTION_TERMINAL_STATES: readonly RuntimeQuestionStatus[] = [
  'claimed',
  'answered',
  'rejected',
  'expired',
  'orphaned',
  'delivery-unknown',
];

/** Answerable states: a human claim may be attempted only from these. */
export const RUNTIME_QUESTION_ANSWERABLE_STATES: readonly RuntimeQuestionStatus[] = ['presented'];

// ─── Bounded render data ─────────────────────────────────────

export const RUNTIME_QUESTION_BOUNDS = {
  /** Maximum questions per ask. */
  maxQuestions: 8,
  /** Maximum options per question. */
  maxOptionsPerQuestion: 8,
  /** Maximum characters per question header. */
  maxHeaderChars: 500,
  /** Maximum characters per question body. */
  maxQuestionChars: 2000,
  /** Maximum characters per option label. */
  maxOptionLabelChars: 300,
  /** Maximum characters per option description. */
  maxOptionDescriptionChars: 1000,
  /** Maximum serialized questions JSON bytes persisted. */
  maxQuestionsJsonBytes: 32 * 1024,
  /** Maximum persisted answers (outer = per-question groups). */
  maxAnswerGroups: 8,
  /** Maximum answers per group. */
  maxAnswersPerGroup: 8,
  /** Maximum characters per single answer string. */
  maxAnswerChars: 1000,
} as const;

export interface RuntimeQuestionOption {
  readonly label: string;
  readonly description?: string;
}

export interface RuntimeQuestion {
  readonly header: string;
  readonly question: string;
  readonly options: readonly RuntimeQuestionOption[];
}

/** Unknown-shape question payload from the OpenCode runtime event. */
export type RuntimeQuestionInput = Readonly<Record<string, unknown>>;

/**
 * Bound an unknown runtime question payload into canonical render data.
 * Truncates over-long strings and drops over-count entries. Never throws
 * for shape problems — returns the bounded best-effort projection.
 * An ask with zero usable questions yields an empty array (the caller
 * decides whether an empty ask is ingestible; the store rejects it).
 */
export function boundRuntimeQuestions(input: unknown): readonly RuntimeQuestion[] {
  if (!Array.isArray(input)) return [];
  const out: RuntimeQuestion[] = [];
  for (const entry of input.slice(0, RUNTIME_QUESTION_BOUNDS.maxQuestions)) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const header = boundString(record.header, RUNTIME_QUESTION_BOUNDS.maxHeaderChars);
    const question = boundString(
      record.question ?? record.text ?? record.prompt,
      RUNTIME_QUESTION_BOUNDS.maxQuestionChars,
    );
    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const options: RuntimeQuestionOption[] = [];
    for (const raw of rawOptions.slice(0, RUNTIME_QUESTION_BOUNDS.maxOptionsPerQuestion)) {
      if (raw === null || typeof raw !== 'object') continue;
      const option = raw as Record<string, unknown>;
      const label = boundString(
        option.label ?? option.title ?? option.value,
        RUNTIME_QUESTION_BOUNDS.maxOptionLabelChars,
      );
      if (!label) continue;
      const description = boundString(option.description, RUNTIME_QUESTION_BOUNDS.maxOptionDescriptionChars);
      options.push(description ? { label, description } : { label });
    }
    if (!header && !question && options.length === 0) continue;
    out.push({ header, question, options });
  }
  return out;
}

function boundString(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return '';
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

/** Bound persisted answer groups (per-question arrays of answer strings). */
export function boundRuntimeAnswers(input: unknown): readonly (readonly string[])[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, RUNTIME_QUESTION_BOUNDS.maxAnswerGroups).map((group) => {
    if (!Array.isArray(group)) return [];
    return group
      .slice(0, RUNTIME_QUESTION_BOUNDS.maxAnswersPerGroup)
      .filter((answer): answer is string => typeof answer === 'string' && answer.length > 0)
      .map((answer) =>
        answer.length > RUNTIME_QUESTION_BOUNDS.maxAnswerChars
          ? answer.slice(0, RUNTIME_QUESTION_BOUNDS.maxAnswerChars)
          : answer,
      );
  });
}

// ─── Identity ────────────────────────────────────────────────

export const RUNTIME_QUESTION_ID_PREFIX = 'rq-';

/**
 * Derive the deterministic interaction id from the EXACT
 * (openCodeSessionId, openCodeRequestId) byte pair.
 * NUL-joined SHA-256, truncated to 32 hex chars. The inputs are used
 * byte-for-byte (UTF-8): no trim, no fold, no normalization.
 */
export function deriveRuntimeQuestionInteractionId(openCodeSessionId: string, openCodeRequestId: string): string {
  const digest = createHash('sha256')
    .update(openCodeSessionId, 'utf8')
    .update('\0', 'utf8')
    .update(openCodeRequestId, 'utf8')
    .digest('hex');
  return `${RUNTIME_QUESTION_ID_PREFIX}${digest.slice(0, 32)}`;
}

/**
 * Exact-identity validation: non-empty strings only. No coercion, no
 * trimming, no defaults. Returns the identity unchanged on success.
 * Throws on anything else (fail closed — never infer missing IDs).
 */
export function requireExactIdentity(
  name: 'conversationId' | 'openCodeSessionId' | 'openCodeRequestId',
  value: unknown,
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeQuestionIdentityError(`${name} must be a non-empty string; missing identities are never inferred`);
  }
  return value;
}

export class RuntimeQuestionIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuntimeQuestionIdentityError';
  }
}

export class RuntimeQuestionTransitionError extends Error {
  readonly interactionId: string;
  readonly from: RuntimeQuestionStatus;
  readonly reason: string;

  constructor(interactionId: string, from: RuntimeQuestionStatus, reason: string) {
    super(`Runtime question ${interactionId} cannot transition from ${from}: ${reason}`);
    this.name = 'RuntimeQuestionTransitionError';
    this.interactionId = interactionId;
    this.from = from;
    this.reason = reason;
  }
}

// ─── Durable shape ───────────────────────────────────────────

/**
 * The durable runtime question interaction row.
 * claimToken is present ONLY while presented (single-use, rotated on
 * re-presentation, consumed — NULL — on successful claim). answers,
 * decidedBy, decidedAt are set only by a successful claim. decidedBy is
 * present only where an authoritative actor identity was supplied.
 */
export interface RuntimeQuestionInteraction {
  readonly interactionId: string;
  readonly conversationId: string;
  readonly openCodeSessionId: string;
  readonly openCodeRequestId: string;
  readonly executionId?: string;
  readonly turnId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly questions: readonly RuntimeQuestion[];
  readonly status: RuntimeQuestionStatus;
  /** Monotonic version: 0 at ingest, +1 per presentation/rotation/claim. */
  readonly version: number;
  /** Single-use claim token; null unless status is presented. */
  readonly claimToken: string | null;
  readonly expiresAt: string;
  readonly presentedAt?: string;
  readonly claimedAt?: string;
  readonly answers?: readonly (readonly string[])[];
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Input for durable ingestion of a runtime `question.asked` event. */
export interface IngestRuntimeQuestionInput {
  readonly conversationId: string;
  readonly openCodeSessionId: string;
  readonly openCodeRequestId: string;
  readonly questions: unknown;
  /** Authoritative identities ONLY where the runtime actually supplied them. */
  readonly executionId?: string;
  readonly turnId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  /** TTL for unclaimed interactions (ms). Defaults to 10 minutes. */
  readonly ttlMs?: number;
  /** Injection point for now (tests). Defaults to Date.now(). */
  readonly nowMs?: number;
}

/** Input for the single-use human claim (presented → claimed CAS). */
export interface ClaimRuntimeQuestionInput {
  readonly interactionId: string;
  readonly claimToken: string;
  readonly expectedVersion: number;
  readonly answers: unknown;
  /** Authoritative actor identity ONLY where one exists (auth principal). */
  readonly decidedBy?: string;
  readonly nowMs?: number;
}

/** Input for the governed presented → claimed rejection transition. */
export interface ClaimRuntimeQuestionRejectionInput {
  readonly interactionId: string;
  readonly claimToken: string;
  readonly expectedVersion: number;
  /** Authoritative actor identity ONLY where one exists. */
  readonly decidedBy?: string;
  readonly nowMs?: number;
}

/** Default TTL for unclaimed interactions: 10 minutes (fail-closed expiry). */
export const RUNTIME_QUESTION_DEFAULT_TTL_MS = 10 * 60 * 1000;
