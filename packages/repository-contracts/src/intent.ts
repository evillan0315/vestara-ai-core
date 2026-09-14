/**
 * VES-REPO-002 — ChangeIntent: declared mutation bounds (REPO-INV-004).
 *
 * Before mutation, an execution declares what it expects to change.
 * Semantic `scopes` are required; `expectedPaths` are hints/bounds only.
 */
import type { ExecutionId, RepositoryId } from './identity';
import type { ChangeScope } from './scope';
import { isValidScopeChain } from './scope';

/** What kind of mutation is intended. Closed vocabulary. */
export type MutationKind = 'source' | 'configuration' | 'schema' | 'migration' | 'generated' | 'documentation';

export const MUTATION_KINDS: readonly MutationKind[] = [
  'source',
  'configuration',
  'schema',
  'migration',
  'generated',
  'documentation',
];

/** Declared mutation bounds for one execution against one repository. */
export interface ChangeIntent {
  readonly executionId: ExecutionId;
  readonly repositoryId: RepositoryId;
  readonly purpose: string;
  readonly scopes: readonly ChangeScope[];
  readonly expectedPaths?: readonly string[];
  readonly mutationKind: MutationKind;
}

/**
 * An intent is actionable only with at least one valid semantic scope.
 * Paths alone never suffice (REPO-INV-006).
 */
export function isValidChangeIntent(value: unknown): value is ChangeIntent {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (
    typeof record.executionId !== 'string' ||
    (record.executionId as string).length === 0 ||
    typeof record.repositoryId !== 'string' ||
    (record.repositoryId as string).length === 0 ||
    typeof record.purpose !== 'string' ||
    (record.purpose as string).length === 0 ||
    !(MUTATION_KINDS as readonly string[]).includes(record.mutationKind as string)
  ) {
    return false;
  }
  const scopes = record.scopes;
  if (!Array.isArray(scopes) || scopes.length === 0) return false;
  return scopes.every(isValidScopeChain);
}
