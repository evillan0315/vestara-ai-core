/**
 * VES-REPO-002 — ChangeScope hierarchy (REPO-INV-006).
 *
 * Scopes are semantic, not paths alone:
 *   Repository → Application → Package → Domain → Authority → Path
 *
 * Two executions in different files (or even different packages) may share
 * an ancestor scope and therefore overlap semantically. The hierarchy is
 * structural navigation only — overlap *detection* belongs to VES-REPO-010+.
 */
export type ScopeLevel = 'repository' | 'application' | 'package' | 'domain' | 'authority' | 'path';

export const SCOPE_LEVELS: readonly ScopeLevel[] = [
  'repository',
  'application',
  'package',
  'domain',
  'authority',
  'path',
];

/** Numeric rank of a level (repository = 0, path = 5). */
export function scopeLevelRank(level: ScopeLevel): number {
  return SCOPE_LEVELS.indexOf(level);
}

/**
 * One node in the semantic scope hierarchy. `parent` must be a strictly
 * higher (less specific) level; the repository root has no parent.
 */
export interface ChangeScope {
  readonly level: ScopeLevel;
  readonly name: string;
  readonly parent?: ChangeScope;
}

/** Depth of the scope (repository = 1). Pure structural navigation. */
export function scopeDepth(scope: ChangeScope): number {
  let depth = 1;
  let current = scope.parent;
  while (current) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

/** Repository-level ancestor name (the hierarchy root). Pure. */
export function scopeRootName(scope: ChangeScope): string {
  let current = scope;
  while (current.parent) current = current.parent;
  return current.name;
}

/** Human-readable chain, e.g. `vestara-ai-core / conversation / persistence`. Pure. */
export function scopeChain(scope: ChangeScope): string {
  const parts: string[] = [scope.name];
  let current = scope.parent;
  while (current) {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' / ');
}

/**
 * Structural validity: non-empty names and a strictly ascending parent
 * chain (each parent less specific than its child). Encodes hierarchy
 * discipline, not overlap detection.
 */
export function isValidScopeChain(scope: ChangeScope): boolean {
  if (!scope.name || scope.name.length === 0) return false;
  let child = scope;
  let current = scope.parent;
  while (current) {
    if (!current.name || current.name.length === 0) return false;
    if (scopeLevelRank(current.level) >= scopeLevelRank(child.level)) return false;
    child = current;
    current = current.parent;
  }
  return true;
}
