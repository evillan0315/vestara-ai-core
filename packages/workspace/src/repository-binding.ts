/**
 * ARX-015 M5: Repository Binding Resolver
 *
 * Resolves an authoritative RepositoryBinding from multiple sources
 * and validates confinement.
 *
 * Architecture:
 *   execution
 *       ↓
 *   resolveRepositoryBinding()
 *       ↓
 *   RepositoryBinding (authoritative)
 *       ↓
 *   validateConfinement()
 *       ↓
 *   runtime/OpenCode operation
 *
 * Resolution precedence:
 *   1. Explicit VESTARA_REPO environment variable (validated)
 *   2. .vestara/workspace.json walk-up discovery
 *   3. process.cwd() as discovery starting point ONLY (not authority)
 *
 * For governed/live execution, unresolved authority fails closed.
 * process.cwd() is never silently authoritative.
 *
 * Confinement rules:
 *   - The canonical path must be within the resolved workspace root
 *   - Path traversal (..) must not escape the workspace
 *   - Symlinks must be resolved to real paths for confinement checks
 *   - After resolution, a runtime must not substitute another repository
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  BindingResolutionMode,
  RepositoryBinding,
  RepositoryBindingId,
  RepositoryBindingRequest,
  RepositoryBindingResult,
} from '@vestara/types';

// ─── Binding ID Generation ─────────────────────────────────

let bindingCounter = 0;

function generateBindingId(): RepositoryBindingId {
  return `repo-${Date.now()}-${++bindingCounter}` as RepositoryBindingId;
}

// ─── Workspace Discovery ───────────────────────────────────

/**
 * Walk upward from startDir looking for .vestara/workspace.json.
 * Returns the directory containing .vestara/ or null if not found.
 */
function discoverWorkspaceRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const vestaraJson = path.join(dir, '.vestara', 'workspace.json');
    if (fs.existsSync(vestaraJson)) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Read workspace ID from .vestara/workspace.json.
 * Returns null if the file doesn't exist or can't be parsed.
 */
function readWorkspaceId(vestaraDir: string): string | null {
  try {
    const manifestPath = path.join(vestaraDir, 'workspace.json');
    if (!fs.existsSync(manifestPath)) return null;
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    const data = JSON.parse(raw);
    return data.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Detect git root by walking upward looking for .git directory.
 */
function detectGitRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
}

// ─── Binding Resolution ────────────────────────────────────

/**
 * Resolve an authoritative RepositoryBinding.
 *
 * This is the single entry point for repository identity resolution.
 * It replaces all implicit process.cwd() resolution in execution contexts.
 *
 * For governed/live execution (mode: 'governed'), process.cwd() is only
 * a discovery starting point — it never becomes authority. If no workspace
 * is discovered, resolution fails closed.
 *
 * @param request - Resolution request with optional overrides
 * @returns Authoritative RepositoryBinding
 */
export function resolveRepositoryBinding(request: RepositoryBindingRequest = {}): RepositoryBindingResult {
  const warnings: string[] = [];
  const mode: BindingResolutionMode = request.mode ?? 'discovery';
  let source: RepositoryBinding['source'] = 'fallback-cwd';
  let resolvedPath: string | null = null;

  // 1. Explicit env var override (highest priority)
  //    VESTARA_REPO is validated, not blindly trusted.
  const envPath = request.envOverride ?? process.env.VESTARA_REPO;
  if (envPath) {
    resolvedPath = path.resolve(envPath);
    source = 'explicit-env';
  }

  // 2. Explicit path argument
  if (!resolvedPath && request.explicitPath) {
    resolvedPath = path.resolve(request.explicitPath);
    source = 'explicit-env';
  }

  // 3. Workspace discovery (walk-up from CWD or startDir)
  //    CWD is the starting point for discovery, NOT an authority.
  if (!resolvedPath) {
    const startDir = request.startDir ?? process.cwd();
    const discovered = discoverWorkspaceRoot(startDir);
    if (discovered) {
      resolvedPath = discovered;
      source = 'workspace-discovery';
    }
  }

  // 4. For governed execution: fail closed if no workspace found.
  //    process.cwd() is NOT silently authoritative.
  if (!resolvedPath) {
    if (mode === 'governed') {
      throw new Error(
        'Repository authority resolution failed: no .vestara/workspace.json found. ' +
          'For governed execution, process.cwd() is not an authority. ' +
          'Set VESTARA_REPO or run from within a Vestara workspace.',
      );
    }
    // Compatibility mode: CWD may be used as authority (CLI/bootstrap)
    resolvedPath = process.cwd();
    source = 'fallback-cwd';
    warnings.push(
      `No workspace discovered; using CWD as authority in compatibility mode. ` +
        `This binding has source='fallback-cwd' and should not be treated as authoritative for governed execution.`,
    );
  }

  // Validate the resolved path exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Repository path does not exist: ${resolvedPath}`);
  }
  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`Repository path is not a directory: ${resolvedPath}`);
  }

  const canonicalPath = path.resolve(resolvedPath);
  const vestaraDir = path.join(canonicalPath, '.vestara');

  // Read workspace ID if .vestara/ exists
  const workspaceId = fs.existsSync(vestaraDir) ? readWorkspaceId(vestaraDir) : null;

  // Detect git root
  const gitRoot = detectGitRoot(canonicalPath);

  // Determine if workspace was discovered (authoritative)
  const validated = source === 'explicit-env' || source === 'workspace-discovery';
  // fallback-cwd bindings are NOT authoritative for governed execution
  const authoritative = validated || (mode === 'compatibility' && source === 'fallback-cwd');

  if (!validated && mode === 'governed') {
    warnings.push('No .vestara/workspace.json found; binding is not fully validated');
  }

  const binding: RepositoryBinding = {
    bindingId: generateBindingId(),
    canonicalPath,
    vestaraDir,
    workspaceId,
    source,
    authoritative,
    resolvedAt: new Date().toISOString(),
    repositoryFingerprint: null, // Computed separately if needed
    gitRoot,
    m1WorkspaceId: workspaceId,
  };

  return { binding, validated, warnings };
}

// ─── Confinement Validation ────────────────────────────────

/**
 * Confinement validation result.
 */
export interface ConfinementResult {
  /** Whether the path is within the binding's canonical root. */
  readonly confined: boolean;
  /** The resolved absolute path. */
  readonly resolvedPath: string;
  /** Reason if not confined. */
  readonly reason?: string;
}

/**
 * Validate that a requested path is confined within the binding's canonical root.
 *
 * This prevents:
 *   - Path traversal (..) escaping the workspace
 *   - Absolute paths outside the workspace
 *   - Symlink escapes (real path comparison)
 *   - Substitution of a different repository after binding resolution
 *
 * @param binding - The authoritative repository binding
 * @param requestedPath - The path to validate (relative or absolute)
 * @returns ConfinementResult
 */
export function validateConfinement(binding: RepositoryBinding, requestedPath: string): ConfinementResult {
  // Resolve relative to the binding's canonical path
  const resolvedPath = path.resolve(binding.canonicalPath, requestedPath);

  // Check for path traversal escaping the canonical root (lexical check)
  const relative = path.relative(binding.canonicalPath, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return {
      confined: false,
      resolvedPath,
      reason: `Path escapes repository root: ${requestedPath} resolves to ${resolvedPath}, which is outside ${binding.canonicalPath}`,
    };
  }

  // Verify the resolved path is actually under the canonical root
  if (!resolvedPath.startsWith(binding.canonicalPath)) {
    return {
      confined: false,
      resolvedPath,
      reason: `Path is outside repository root: ${resolvedPath} is not under ${binding.canonicalPath}`,
    };
  }

  // Symlink confinement: resolve to real path and check containment
  const realPath = resolveRealPath(resolvedPath);
  if (realPath !== null) {
    const realRelative = path.relative(binding.canonicalPath, realPath);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      return {
        confined: false,
        resolvedPath,
        reason: `Symlink escapes repository root: ${requestedPath} → ${realPath} is outside ${binding.canonicalPath}`,
      };
    }
  }

  return { confined: true, resolvedPath };
}

/**
 * Assert confinement — throws if the path escapes the binding's canonical root.
 */
export function assertConfinement(binding: RepositoryBinding, requestedPath: string): string {
  const result = validateConfinement(binding, requestedPath);
  if (!result.confined) {
    throw new Error(result.reason ?? 'Repository confinement violated');
  }
  return result.resolvedPath;
}

/**
 * Get the authoritative execution directory from a binding.
 *
 * This replaces all process.cwd() usage in execution contexts.
 * The returned path is guaranteed to be the binding's canonical root.
 */
export function resolveExecutionDirectory(binding: RepositoryBinding): string {
  if (!binding.authoritative) {
    throw new Error(`Cannot resolve execution directory from non-authoritative binding: ${binding.bindingId}`);
  }
  return binding.canonicalPath;
}

/**
 * Verify that two bindings refer to the same repository.
 * Used to detect repository substitution attempts.
 */
export function verifyBindingIdentity(binding1: RepositoryBinding, binding2: RepositoryBinding): boolean {
  return binding1.canonicalPath === binding2.canonicalPath;
}

// ─── Symlink Confinement ────────────────────────────────────

/**
 * Resolve a path to its real (canonical) path, following symlinks.
 * Returns null if the path doesn't exist (for nonexistent children below safe parents).
 */
function resolveRealPath(resolvedPath: string): string | null {
  try {
    return fs.realpathSync(resolvedPath);
  } catch {
    // Path doesn't exist yet — validate nearest existing ancestor
    let dir = path.dirname(resolvedPath);
    while (dir !== path.dirname(dir)) {
      try {
        const realDir = fs.realpathSync(dir);
        // Reconstruct: realDir + remaining tail
        const tail = path.relative(dir, resolvedPath);
        return path.join(realDir, tail);
      } catch {
        dir = path.dirname(dir);
      }
    }
    return null;
  }
}

/**
 * Validate symlink confinement for a path within a binding.
 *
 * For filesystem-backed operations, this resolves the real path
 * and verifies it is still within the binding's canonical root.
 *
 * @param binding - The authoritative repository binding
 * @param resolvedPath - The already-resolved absolute path
 * @returns true if the real path is confined, false otherwise
 */
export function validateSymlinkConfinement(binding: RepositoryBinding, resolvedPath: string): boolean {
  const realPath = resolveRealPath(resolvedPath);
  if (realPath === null) return true; // nonexistent target — ok
  const relative = path.relative(binding.canonicalPath, realPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

// ─── Vestara Path Utility ───────────────────────────────────

/**
 * Construct a path within the .vestara/ directory of a binding.
 *
 * Replaces all `path.join(process.cwd(), '.vestara', ...)` patterns.
 *
 * @param binding - The authoritative repository binding
 * @param segments - Path segments within .vestara/
 * @returns Absolute path within .vestara/
 */
export function vestaraPath(binding: RepositoryBinding, ...segments: string[]): string {
  return path.join(binding.vestaraDir, ...segments);
}

/**
 * Resolve the .vestara/ directory from a raw path.
 * For CLI/bootstrap contexts where a binding is not yet available.
 * @deprecated Use vestaraPath(binding) in execution contexts.
 */
export function resolveVestaraDirFromPath(repoPath: string): string {
  return path.join(path.resolve(repoPath), '.vestara');
}
