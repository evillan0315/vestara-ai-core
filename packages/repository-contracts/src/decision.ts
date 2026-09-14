/**
 * VES-REPO-002 — RepositoryCoordinationDecision (REPO-INV-005).
 *
 * ALLOW | HOLD | DENY | UNKNOWN with reasons and conflict references.
 * UNKNOWN never implies ALLOW: {@link decisionPermitsMutation} returns false
 * for every decision except an explicit ALLOW.
 */
import type { RepositoryConflict } from './conflict';
import { isValidRepositoryConflict } from './conflict';

/** Closed vocabulary of coordination outcomes. */
export type CoordinationOutcome = 'allow' | 'hold' | 'deny' | 'unknown';

export type RepositoryCoordinationDecision =
  | { readonly decision: 'allow'; readonly reason: string }
  | { readonly decision: 'hold'; readonly conflicts: readonly RepositoryConflict[] }
  | { readonly decision: 'deny'; readonly conflicts: readonly RepositoryConflict[] }
  | { readonly decision: 'unknown'; readonly reason: string };

/**
 * The single mutation gate. Only an explicit ALLOW permits mutation.
 * HOLD, DENY, and UNKNOWN all refuse — UNKNOWN is a hold, never a pass.
 */
export function decisionPermitsMutation(decision: RepositoryCoordinationDecision): boolean {
  return decision.decision === 'allow';
}

/** Construct an ALLOW decision. A reason is required — bare allows decide nothing. */
export function allowMutation(reason: string): RepositoryCoordinationDecision {
  return { decision: 'allow', reason };
}

/** Construct an UNKNOWN decision. Records why compatibility is unestablished. */
export function unknownCompatibility(reason: string): RepositoryCoordinationDecision {
  return { decision: 'unknown', reason };
}

/**
 * Structural validity: ALLOW/UNKNOWN carry a non-empty reason;
 * HOLD/DENY carry at least one valid conflict.
 */
export function isValidCoordinationDecision(value: unknown): value is RepositoryCoordinationDecision {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  switch (record.decision) {
    case 'allow':
    case 'unknown':
      return typeof record.reason === 'string' && (record.reason as string).length > 0;
    case 'hold':
    case 'deny': {
      const conflicts = record.conflicts;
      return Array.isArray(conflicts) && conflicts.length > 0 && conflicts.every(isValidRepositoryConflict);
    }
    default:
      return false;
  }
}
