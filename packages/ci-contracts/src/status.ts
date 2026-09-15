/**
 * CI-OBS-001B — CI lifecycle status.
 *
 * The progression from discovery through completion. Status is orthogonal
 * to conclusion — a run can be RUNNING with no conclusion yet, or
 * COMPLETED with a conclusion of PASSED.
 *
 * Closed vocabulary. Adapter maps provider-native status into this set;
 * provider-native status is preserved separately on the domain object.
 *
 * Lifecycle:
 *   discovered — we know this run exists but the provider has not yet
 *                acknowledged it. Pre-active. No provider-side resources
 *                are allocated.
 *   queued     — the provider has acknowledged the run and it is waiting
 *                for resources. Provider-side active.
 *   running    — the provider is actively executing the run.
 *   completed  — terminal. The run has reached a conclusion.
 */

/** CI observation lifecycle position. */
export type CIStatus = 'discovered' | 'queued' | 'running' | 'completed';

/** Closed vocabulary — all valid lifecycle statuses. */
export const CI_STATUSES: readonly CIStatus[] = ['discovered', 'queued', 'running', 'completed'];

/** True when the status is terminal (completed). Pure. */
export function isTerminalStatus(status: CIStatus): boolean {
  return status === 'completed';
}

/**
 * True when the status is non-terminal (discovered | queued | running).
 * Covers every status except the terminal state. Pure.
 */
export function isNonTerminalStatus(status: CIStatus): boolean {
  return status !== 'completed';
}

/**
 * True when the provider is actively processing the run (queued | running).
 *
 * `discovered` is deliberately excluded: it means "we know the run exists"
 * but the provider has not yet acknowledged or allocated resources.
 * Discovered is non-terminal but not active — it is a pre-active
 * observation state, not a provider-side execution state.
 */
export function isActiveStatus(status: CIStatus): boolean {
  return status === 'queued' || status === 'running';
}
