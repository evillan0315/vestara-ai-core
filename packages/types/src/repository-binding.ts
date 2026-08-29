/**
 * ARX-015 M5: RepositoryBinding — Authoritative Repository Identity
 *
 * A RepositoryBinding is the single authoritative link between an execution
 * and its repository root. It replaces implicit process.cwd() resolution
 * with explicit, validated, immutable binding.
 *
 * Architecture:
 *   execution
 *       ↓
 *   authoritative repository binding
 *       ↓
 *   canonical repository root
 *       ↓
 *   confinement validation
 *       ↓
 *   runtime/OpenCode operation
 *
 * A runtime must not be able to substitute another repository after
 * that resolution.
 *
 * Resolution precedence:
 *   1. Explicit VESTARA_REPO environment variable (validated)
 *   2. .vestara/workspace.json walk-up discovery
 *   3. process.cwd() as discovery starting point ONLY (not authority)
 *
 * For governed/live execution, unresolved authority fails closed.
 * process.cwd() is never silently authoritative.
 */

import type { RepositoryBindingId } from './ids';

/** Source of the repository binding resolution. */
export type BindingSource = 'explicit-env' | 'workspace-discovery' | 'configured-default' | 'fallback-cwd';

/**
 * Resolution mode controlling fallback behavior.
 *
 * - 'discovery': CWD is a starting point for walk-up. No fallback authority.
 * - 'governed': Requires validated workspace. Fails closed if unresolved.
 * - 'compatibility': CLI/bootstrap may use CWD as authority (explicit only).
 */
export type BindingResolutionMode = 'discovery' | 'governed' | 'compatibility';

/** An immutable, validated repository binding. */
export interface RepositoryBinding {
  /** Unique binding identity. */
  readonly bindingId: RepositoryBindingId;

  /** Absolute canonical path to the repository root. */
  readonly canonicalPath: string;

  /** Absolute path to the .vestara/ directory within the repository. */
  readonly vestaraDir: string;

  /** The workspace ID from .vestara/workspace.json (if discovered). */
  readonly workspaceId: string | null;

  /** Source of the binding resolution. */
  readonly source: BindingSource;

  /** Whether this binding is authoritative for execution directory. */
  readonly authoritative: boolean;

  /** Timestamp when this binding was resolved. */
  readonly resolvedAt: string;

  /** SHA-256 fingerprint of the repository at resolution time (if available). */
  readonly repositoryFingerprint: string | null;

  /** Git root path (if inside a git repository). */
  readonly gitRoot: string | null;

  /** M1 identity: workspace ID from manifest. */
  readonly m1WorkspaceId: string | null;
}

/** Input for resolving a repository binding. */
export interface RepositoryBindingRequest {
  /** Explicit repository path (from CLI argument or env var). */
  readonly explicitPath?: string;

  /** Environment variable override (VESTARA_REPO). */
  readonly envOverride?: string;

  /** Starting directory for walk-up discovery. */
  readonly startDir?: string;

  /** Whether to require .vestara/workspace.json existence. */
  readonly requireWorkspace?: boolean;

  /** Resolution mode controlling fallback behavior. Default: 'discovery'. */
  readonly mode?: BindingResolutionMode;
}

/** Result of repository binding resolution. */
export interface RepositoryBindingResult {
  /** The resolved binding. */
  readonly binding: RepositoryBinding;

  /** Whether the binding was validated against an existing workspace. */
  readonly validated: boolean;

  /** Any warnings during resolution. */
  readonly warnings: string[];
}
