/**
 * Canonical permission action vocabulary.
 *
 * CORE-001 found that OpenCode-specific permission types
 * (OpenCodePermissionAction, OpenCodePermissionRisk) had become Vestara's
 * de facto permission vocabulary. This is a boundary violation — external
 * runtime vocabulary must not define Vestara's domain contracts.
 *
 * This type is the canonical Vestara permission action vocabulary.
 * Runtime-specific adapters (e.g., OpenCodePermissionAction) must normalize
 * to this vocabulary, not the other way around.
 *
 * OpenCode-specific tool names (task, todowrite, lsp, skill, question,
 * doom_loop) are NOT canonical actions. They normalize to 'other' via
 * normalizePermissionAction() and are matched by policy rules using
 * resource patterns.
 *
 * INVARIANT: Runtime-neutral. Valid for OpenCode, Codex, Claude Code,
 * and future runtimes.
 */
export type PermissionAction =
  | 'read'
  | 'edit'
  | 'write'
  | 'glob'
  | 'grep'
  | 'list'
  | 'bash'
  | 'webfetch'
  | 'websearch'
  | 'external-directory'
  | 'other';

/** All canonical PermissionAction values. */
export const ALL_PERMISSION_ACTIONS: readonly PermissionAction[] = [
  'read',
  'edit',
  'write',
  'glob',
  'grep',
  'list',
  'bash',
  'webfetch',
  'websearch',
  'external-directory',
  'other',
] as const;

/** Runtime type guard for PermissionAction. */
export function isPermissionAction(value: string): value is PermissionAction {
  return (ALL_PERMISSION_ACTIONS as readonly string[]).includes(value);
}
