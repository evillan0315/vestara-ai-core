/**
 * VES-REPO-002 — RepositoryAccessMode (REPO-INV-003, REPO-INV-007).
 *
 * Every repository-bound execution declares one mode. Concurrent reasoning
 * (OBSERVE/ANALYZE/VERIFY) is always allowed; only MUTATE carries mutation
 * authority, and observation never confers it.
 */
export type RepositoryAccessMode = 'OBSERVE' | 'ANALYZE' | 'VERIFY' | 'MUTATE';

export const REPOSITORY_ACCESS_MODES: readonly RepositoryAccessMode[] = ['OBSERVE', 'ANALYZE', 'VERIFY', 'MUTATE'];

/**
 * True only for MUTATE. The single predicate that gates mutation authority —
 * callers must never infer authority from OBSERVE, ANALYZE, or VERIFY.
 */
export function isMutationMode(mode: RepositoryAccessMode): boolean {
  return mode === 'MUTATE';
}

/** True for modes that permit concurrent reasoning without coordination. */
export function isReadOnlyMode(mode: RepositoryAccessMode): boolean {
  return mode === 'OBSERVE' || mode === 'ANALYZE' || mode === 'VERIFY';
}
