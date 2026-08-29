// Security helpers for native package installation: checksum binding, expected
// executable filename, size limits, staged-directory containment, and symlink
// traversal protection.

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024; // 512 MiB

export function sha256OfFile(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export class NativeInstallSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NativeInstallSecurityError';
  }
}

/** Verify an artifact's checksum against the manifest-bound expected value. */
export function assertChecksum(artifactPath: string, expected: string): void {
  const actual = sha256OfFile(artifactPath);
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new NativeInstallSecurityError(
      `Checksum mismatch for ${path.basename(artifactPath)}: expected ${expected}, got ${actual}`,
    );
  }
}

const EXECUTABLE_NAMES: readonly string[] = ['vestara-tui', 'vestara-tui.exe'];

/** Validate the resolved executable filename matches an expected artifact name. */
export function assertExpectedExecutableName(filePath: string): void {
  const base = path.basename(filePath);
  if (!EXECUTABLE_NAMES.some((name) => base === name || base.startsWith(`${name}-`))) {
    throw new NativeInstallSecurityError(`Unexpected executable filename: ${base}`);
  }
}

/** Enforce an executable size ceiling before it can be staged or executed. */
export function assertExecutableSize(filePath: string, maxBytes = MAX_EXECUTABLE_BYTES): void {
  const size = fs.statSync(filePath).size;
  if (size > maxBytes) {
    throw new NativeInstallSecurityError(
      `Executable ${path.basename(filePath)} is ${size} bytes; limit is ${maxBytes}`,
    );
  }
}

/**
 * Assert a resolved path remains inside the package root after following no
 * symlinks. Used to stop a manifest-supplied executable path from escaping the
 * staged/installed directory (path-traversal + symlink-traversal protection).
 */
export function assertContained(root: string, target: string): string {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(target);
  const relative = path.relative(rootResolved, targetResolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new NativeInstallSecurityError(`Path escapes package directory: ${target}`);
  }
  const parent = path.dirname(targetResolved);
  if (!isRealPathWithin(rootResolved, parent)) {
    throw new NativeInstallSecurityError(`Symlink traversal detected: ${target}`);
  }
  return targetResolved;
}

function isRealPathWithin(rootResolved: string, target: string): boolean {
  try {
    const realTarget = fs.realpathSync(target);
    const realRoot = fs.realpathSync(rootResolved);
    const relative = path.relative(realRoot, realTarget);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  } catch {
    // The target may not exist yet (pre-stage); fall back to lexical containment.
    const relative = path.relative(rootResolved, target);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }
}

/**
 * Recursively reject any symlink inside a staged directory (no symlink
 * traversal during commit). Returns the count of files checked.
 */
export function assertNoSymlinksInTree(root: string): number {
  let checked = 0;
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        throw new NativeInstallSecurityError(`Symlink in package tree: ${full}`);
      }
      if (entry.isDirectory()) visit(full);
      else checked += 1;
    }
  };
  visit(root);
  return checked;
}

/** Verify the manifest identity + version match what the binary reports. */
export function assertIdentityMatch(input: {
  manifestId: string;
  manifestVersion: string;
  binaryId: string;
  binaryVersion: string;
}): void {
  if (input.manifestId !== input.binaryId) {
    throw new NativeInstallSecurityError(
      `Package identity mismatch: manifest "${input.manifestId}" but executable reports "${input.binaryId}"`,
    );
  }
  if (input.manifestVersion !== input.binaryVersion) {
    throw new NativeInstallSecurityError(
      `Package version mismatch: manifest ${input.manifestVersion} but executable reports ${input.binaryVersion}`,
    );
  }
}
