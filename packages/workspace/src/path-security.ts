/**
 * Path Security — sandboxing and path validation for the Workspace Runtime.
 *
 * Enforces the security model:
 *   - Allowed by default inside workspace root
 *   - Denied outside workspace root
 *   - Specific paths always denied (e.g. ~/.ssh, /etc)
 *   - Destructive operations require confirmation
 */

import * as os from 'node:os';
import * as path from 'node:path';

export interface PathValidation {
  allowed: boolean;
  reason?: string;
  resolvedPath: string;
  requiresConfirmation: boolean;
}

const ALWAYS_DENIED_PREFIXES = ['/etc', '/sys', '/proc', '/dev', '/boot', '/var/log'];

const ALWAYS_DENIED_HOME_DIRS = [
  '.ssh',
  '.gnupg',
  '.aws',
  '.config/gcloud',
  '.kube',
  '.docker/config.json',
  '.npmrc',
  '.netrc',
  '.git-credentials',
];

const ALWAYS_DENIED_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'credentials.json',
  'service-account.json',
];

export class PathSecurity {
  private _workspaceRoot: string;
  private homeDir: string;

  constructor(workspaceRoot: string) {
    this._workspaceRoot = path.resolve(workspaceRoot);
    this.homeDir = os.homedir();
  }

  validatePath(requestedPath: string): PathValidation {
    const resolvedPath = path.resolve(this._workspaceRoot, requestedPath);

    // Block always-denied system paths (checked before any other rule)
    for (const prefix of ALWAYS_DENIED_PREFIXES) {
      if (resolvedPath.startsWith(prefix)) {
        return {
          allowed: false,
          reason: `Access denied to system path: ${prefix}`,
          resolvedPath,
          requiresConfirmation: false,
        };
      }
    }

    // Block always-denied home directories
    const homeRelative = path.relative(this.homeDir, resolvedPath);
    if (!homeRelative.startsWith('..') && !path.isAbsolute(homeRelative)) {
      for (const denied of ALWAYS_DENIED_HOME_DIRS) {
        if (homeRelative === denied || homeRelative.startsWith(denied + path.sep)) {
          return {
            allowed: false,
            reason: `Access denied to sensitive path: ~/${denied}`,
            resolvedPath,
            requiresConfirmation: false,
          };
        }
      }
    }

    // Block always-denied files at workspace root
    const fileName = path.basename(resolvedPath);
    if (ALWAYS_DENIED_FILES.includes(fileName) && path.dirname(resolvedPath) === this._workspaceRoot) {
      return {
        allowed: false,
        reason: `Access denied to sensitive file: ${fileName}`,
        resolvedPath,
        requiresConfirmation: false,
      };
    }

    // Paths outside workspace root require confirmation
    if (!resolvedPath.startsWith(this._workspaceRoot)) {
      return {
        allowed: true,
        reason: 'Path is outside workspace root — user confirmation required',
        resolvedPath,
        requiresConfirmation: true,
      };
    }

    // Path traversal check: reject paths that would escape workspace via ..
    const relative = path.relative(this._workspaceRoot, resolvedPath);
    if (relative.startsWith('..')) {
      return {
        allowed: false,
        reason: `Path traversal detected: ${requestedPath}`,
        resolvedPath,
        requiresConfirmation: false,
      };
    }

    return {
      allowed: true,
      resolvedPath,
      requiresConfirmation: false,
    };
  }

  assertWithinWorkspace(requestedPath: string): string {
    const result = this.validatePath(requestedPath);
    if (!result.allowed) {
      throw new Error(result.reason ?? 'Path access denied');
    }
    return result.resolvedPath;
  }

  get workspaceRoot(): string {
    return this._workspaceRoot;
  }

  get allowedPrefixes(): string[] {
    return [this._workspaceRoot];
  }
}
