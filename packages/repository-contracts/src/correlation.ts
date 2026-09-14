/**
 * VES-REPO-006 — RuntimeSessionCorrelation: explicit ExecutionId ↔
 * RuntimeSessionId correlation carrying the bound repository context.
 *
 * The correlation is recorded once the runtime adapter authoritatively
 * returns/assigns the session (canonical point:
 * `RuntimeExecutionPort.execute()` → `RuntimeExecutionHandle.runtimeSessionId`).
 * It never infers: session, repository, workflow, and baseline links are
 * asserted from explicit binding evidence or left absent (UNKNOWN).
 *
 * Structural guarantees (enforced by shape, not policy):
 * - No lifecycle/status fields exist — this record cannot express, and
 *   therefore cannot synthesize, session termination, execution failure,
 *   or response failure. ResponseStatus ≠ ExecutionStatus ≠
 *   RuntimeSessionStatus by construction.
 * - No path, project, conversation, actor, provider, or model fields exist —
 *   none of them can manufacture lineage through this record.
 * - The repository context is embedded whole (composition of one validated
 *   value), so baseline, mode, and intent survive correlation intact.
 */

import type { ExecutionRepositoryContext } from './context';
import { isValidExecutionRepositoryContext } from './context';
import type { ExecutionId, RuntimeSessionId, WorkflowRunId } from './identity';

/**
 * How the session came to serve this execution, asserted by the recorder
 * from authoritative signals (never defaulted):
 * - `created` — a new physical session was created for this execution;
 * - `reused` — an already-active verified session was adopted
 *   (registry hit, preferred-session verify);
 * - `resumed` — a session whose prior execution ended was re-adopted by a
 *   new execution.
 */
export type SessionOrigin = 'created' | 'reused' | 'resumed';

export const SESSION_ORIGINS: readonly SessionOrigin[] = ['created', 'reused', 'resumed'];

/** Explicit execution ↔ runtime-session correlation. Immutable value. */
export interface RuntimeSessionCorrelation {
  readonly executionId: ExecutionId;
  readonly runtimeSessionId: RuntimeSessionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly repositoryContext: ExecutionRepositoryContext;
  readonly sessionOrigin: SessionOrigin;
  readonly correlatedAt: string;
}

/**
 * Structural + agreement validity: present identifiers, explicit origin, a
 * valid embedded repository context that names the same execution.
 * A correlation whose context belongs to another execution is invalid —
 * sessions are never re-targeted silently.
 */
export function isValidRuntimeSessionCorrelation(value: unknown): value is RuntimeSessionCorrelation {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.executionId !== 'string' ||
    (record.executionId as string).length === 0 ||
    typeof record.runtimeSessionId !== 'string' ||
    (record.runtimeSessionId as string).length === 0 ||
    !(SESSION_ORIGINS as readonly string[]).includes(record.sessionOrigin as string) ||
    typeof record.correlatedAt !== 'string' ||
    (record.correlatedAt as string).length === 0
  ) {
    return false;
  }
  if (!isValidExecutionRepositoryContext(record.repositoryContext)) return false;
  const context = record.repositoryContext as ExecutionRepositoryContext;
  if (context.executionId !== record.executionId) return false;
  if (
    record.workflowRunId !== undefined &&
    (typeof record.workflowRunId !== 'string' || record.workflowRunId.length === 0)
  ) {
    return false;
  }
  return true;
}
