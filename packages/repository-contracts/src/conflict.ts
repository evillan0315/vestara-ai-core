/**
 * VES-REPO-002 — RepositoryConflict representation (C1–C9).
 *
 * This module represents conflicts; it does not detect them. Detection
 * arrives in VES-REPO-010/011. Every class from the blueprint is
 * representable today so later detectors need no contract change.
 *
 *   C1 exact-path        — same file claimed by two executions
 *   C2 directory-overlap — package/dir scope overlap
 *   C3 contract          — contract changed vs consumer changed (different files)
 *   C4 dependency        — change against a moving dependency
 *   C5 schema-migration  — migration vs persistence implementation
 *   C6 generated         — source vs generated output
 *   C7 verification-drift— mutation landed mid-verification
 *   C8 head-drift        — HEAD moved under an execution
 *   C9 external-mutation — repository changed outside known executions
 */
import type { ExecutionId, RepositoryId } from './identity';

/** Closed vocabulary of conflict classes. */
export type RepositoryConflictClass =
  | 'exact-path'
  | 'directory-overlap'
  | 'contract'
  | 'dependency'
  | 'schema-migration'
  | 'generated'
  | 'verification-drift'
  | 'head-drift'
  | 'external-mutation';

export const REPOSITORY_CONFLICT_CLASSES: readonly RepositoryConflictClass[] = [
  'exact-path',
  'directory-overlap',
  'contract',
  'dependency',
  'schema-migration',
  'generated',
  'verification-drift',
  'head-drift',
  'external-mutation',
];

/** One represented conflict. A description is required — bare codes decide nothing. */
export interface RepositoryConflict {
  readonly class: RepositoryConflictClass;
  readonly repositoryId: RepositoryId;
  readonly involvedExecutions: readonly ExecutionId[];
  readonly description: string;
  readonly observedAt?: string;
}

/** True for closed-vocabulary classes only. Unknown strings are not conflicts. */
export function isKnownConflictClass(value: unknown): value is RepositoryConflictClass {
  return typeof value === 'string' && (REPOSITORY_CONFLICT_CLASSES as readonly string[]).includes(value);
}

/** Structural validity: known class, repository link, description. */
export function isValidRepositoryConflict(value: unknown): value is RepositoryConflict {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    isKnownConflictClass(record.class) &&
    typeof record.repositoryId === 'string' &&
    (record.repositoryId as string).length > 0 &&
    Array.isArray(record.involvedExecutions) &&
    typeof record.description === 'string' &&
    (record.description as string).length > 0
  );
}
