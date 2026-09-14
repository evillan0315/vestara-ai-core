/**
 * VES-REPO-006 — Runtime session correlation recorder (record only).
 *
 * The caller performs the adapter call and asserts the outcome; this
 * recorder validates and freezes the correlation. It performs no I/O, opens
 * no sessions, and terminates nothing.
 *
 * Canonical binding point: `RuntimeExecutionPort.execute()` returns
 * `RuntimeExecutionHandle { executionId, runtimeSessionId? }`. The adapter
 * (e.g. OpenCode `createSession`, or a verified preferred-session reuse)
 * is the authority that makes the session id known; this function records
 * the resulting pair. Origin mapping for callers:
 *   new physical session            → 'created'
 *   registry hit / verified reuse   → 'reused'
 *   re-adoption after a prior ended → 'resumed'
 *
 * Lifecycle semantics (documented invariants, no policy implemented):
 * - created: session begins serving this execution; prior state: none.
 * - reused: session continues serving; other executions may share it under
 *   the runtime's own continuity rules — sharing is observed, not governed.
 * - resumed: a new execution continues a session whose prior execution
 *   ended; the ended execution's outcome is unchanged by resumption.
 * - execution completes/fails/cancelled: the correlation is historical fact;
 *   nothing here retires the session.
 * - Vestara response/UI disconnect: severs observation, not execution and
 *   not the session. A failed response (e.g. tool-call budget) while the
 *   session continues working is representable precisely because this
 *   record carries no status — response failure cannot terminate the
 *   session through this contract.
 * - runtime session alive after Vestara-facing failure: expected and
 *   recordable; session liveness is the runtime's fact, not ours to deny.
 * - session termination: never recorded here and never implied (see the
 *   contract shape). Repository effects of a terminated session persist
 *   (REPO-INV-011) and are observed by later snapshots, not by this record.
 * - execution with no session yet: no correlation exists (absent, UNKNOWN).
 * - session with unproven lineage: no correlation exists (absent, UNKNOWN).
 */
import type {
  ExecutionId,
  ExecutionRepositoryContext,
  RuntimeSessionCorrelation,
  RuntimeSessionId,
  SessionOrigin,
  WorkflowRunId,
} from '@vestara/repository-contracts';
import { isValidExecutionRepositoryContext, SESSION_ORIGINS } from '@vestara/repository-contracts';

/** Recorder input — every link explicit. Nothing is inferred. */
export interface RecordSessionCorrelationInput {
  readonly executionId: ExecutionId;
  readonly runtimeSessionId: RuntimeSessionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly repositoryContext: ExecutionRepositoryContext;
  readonly sessionOrigin: SessionOrigin;
}

/** Fail-closed recorder failures. */
export type CorrelationRecordFailureReason =
  | 'execution-required'
  | 'session-required'
  | 'origin-required'
  | 'invalid-repository-context'
  | 'execution-mismatch';

export interface CorrelationRecordFailure {
  readonly ok: false;
  readonly reason: CorrelationRecordFailureReason;
  readonly detail: string;
}

export type RecordSessionCorrelationResult =
  | { readonly ok: true; readonly correlation: RuntimeSessionCorrelation }
  | CorrelationRecordFailure;

/** Injectable seams. */
export interface SessionCorrelationRecorderDeps {
  readonly now: () => string;
}

const defaultDeps: SessionCorrelationRecorderDeps = {
  now: () => new Date().toISOString(),
};

function fail(reason: CorrelationRecordFailureReason, detail: string): CorrelationRecordFailure {
  return { ok: false, reason, detail };
}

/**
 * Record an explicit execution ↔ runtime-session correlation. Pure
 * construction plus validation; the caller's binding evidence is trusted
 * as asserted, never derived.
 */
export function recordRuntimeSessionCorrelation(
  input: RecordSessionCorrelationInput,
  deps: SessionCorrelationRecorderDeps = defaultDeps,
): RecordSessionCorrelationResult {
  if (!input.executionId || (input.executionId as string).length === 0) {
    return fail('execution-required', 'ExecutionId must be explicitly provided; sessions never imply executions.');
  }
  if (!input.runtimeSessionId || (input.runtimeSessionId as string).length === 0) {
    return fail('session-required', 'RuntimeSessionId must come from the authoritative adapter return.');
  }
  if (!input.sessionOrigin || !(SESSION_ORIGINS as readonly string[]).includes(input.sessionOrigin)) {
    return fail(
      'origin-required',
      'Session origin must be an explicit created, reused, or resumed assertion — never defaulted.',
    );
  }
  if (!isValidExecutionRepositoryContext(input.repositoryContext)) {
    return fail('invalid-repository-context', 'The embedded repository context must itself be valid.');
  }
  if (input.repositoryContext.executionId !== input.executionId) {
    return fail(
      'execution-mismatch',
      'Repository context names a different execution; sessions are never re-targeted silently.',
    );
  }
  return {
    ok: true,
    correlation: {
      executionId: input.executionId,
      runtimeSessionId: input.runtimeSessionId,
      ...(input.workflowRunId ? { workflowRunId: input.workflowRunId } : {}),
      repositoryContext: input.repositoryContext,
      sessionOrigin: input.sessionOrigin,
      correlatedAt: deps.now(),
    },
  };
}
