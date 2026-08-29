/**
 * ARX-015 M5/M5B — Repository Authority & Confinement Tests
 *
 * Proves:
 * 1. Binding resolution from multiple sources (env, discovery, governed fail-closed)
 * 2. Confinement validation (path traversal, absolute escape, symlinks)
 * 3. Authoritative execution directory
 * 4. Repository substitution detection (R1 → R2 denial)
 * 5. process.cwd() replacement utility
 * 6. Parent-workspace defect impossibility (hermetic)
 * 7. VESTARA_REPO validation (not blind trust)
 * 8. Binding immutability
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RepositoryBinding, RepositoryBindingId } from '@vestara/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertConfinement,
  resolveExecutionDirectory,
  resolveRepositoryBinding,
  validateConfinement,
  validateSymlinkConfinement,
  verifyBindingIdentity,
  vestaraPath,
} from '../src/repository-binding.js';

// ─── Test Helpers ───────────────────────────────────────────

function makeBinding(overrides?: Partial<RepositoryBinding>): RepositoryBinding {
  return {
    bindingId: `repo-test-${Date.now()}` as RepositoryBindingId,
    canonicalPath: '/tmp/test-workspace',
    vestaraDir: '/tmp/test-workspace/.vestara',
    workspaceId: 'test-ws-001',
    source: 'workspace-discovery',
    authoritative: true,
    resolvedAt: new Date().toISOString(),
    repositoryFingerprint: null,
    gitRoot: '/tmp/test-workspace',
    m1WorkspaceId: 'test-ws-001',
    ...overrides,
  };
}

function createWorkspaceFixture(dir: string, id = 'test-ws'): void {
  const vestaraDir = path.join(dir, '.vestara');
  fs.mkdirSync(vestaraDir, { recursive: true });
  fs.writeFileSync(path.join(vestaraDir, 'workspace.json'), JSON.stringify({ id, name: `Test Workspace ${id}` }));
}

// ─── Tests ──────────────────────────────────────────────────

describe('ARX-015 M5 — Repository Authority & Confinement', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm5-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── 1. Binding Resolution ────────────────────────────────

  describe('1. Binding resolution', () => {
    it('resolves from explicit path', () => {
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.authoritative).toBe(true);
      expect(result.binding.source).toBe('explicit-env');
      expect(result.binding.bindingId).toBeDefined();
      expect(result.binding.resolvedAt).toBeDefined();
    });

    it('resolves from workspace discovery (walk-up)', () => {
      createWorkspaceFixture(tmpDir, 'discovered-ws');
      const subDir = path.join(tmpDir, 'packages', 'foo');
      fs.mkdirSync(subDir, { recursive: true });

      const result = resolveRepositoryBinding({ startDir: subDir });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.source).toBe('workspace-discovery');
      expect(result.binding.workspaceId).toBe('discovered-ws');
      expect(result.binding.authoritative).toBe(true);
      expect(result.validated).toBe(true);
    });

    it('throws in governed mode when no workspace found', () => {
      expect(() =>
        resolveRepositoryBinding({
          startDir: '/tmp/nonexistent-path-xyz',
          mode: 'governed',
        }),
      ).toThrow('Repository authority resolution failed');
    });

    it('compatibility mode falls back to CWD with warning', () => {
      const result = resolveRepositoryBinding({
        startDir: '/tmp/nonexistent-path-xyz',
        mode: 'compatibility',
      });
      expect(result.binding.source).toBe('fallback-cwd');
      expect(result.binding.canonicalPath).toBe(path.resolve(process.cwd()));
      expect(result.binding.authoritative).toBe(true);
      expect(result.warnings.some((w) => w.includes('compatibility mode'))).toBe(true);
    });

    it('throws on non-existent path', () => {
      expect(() => resolveRepositoryBinding({ explicitPath: '/tmp/nonexistent-path-xyz-abc' })).toThrow(
        'does not exist',
      );
    });

    it('throws on file path (not directory)', () => {
      const filePath = path.join(tmpDir, 'not-a-dir.txt');
      fs.writeFileSync(filePath, 'test');
      expect(() => resolveRepositoryBinding({ explicitPath: filePath })).toThrow('not a directory');
    });

    it('binding is immutable (readonly fields)', () => {
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(typeof result.binding.bindingId).toBe('string');
    });

    it('detects git root when inside a git repo', () => {
      fs.mkdirSync(path.join(tmpDir, '.git'));
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      expect(result.binding.gitRoot).toBe(path.resolve(tmpDir));
    });

    it('gitRoot is null when not in a git repo', () => {
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      expect(result.binding.gitRoot).toBeNull();
    });
  });

  // ─── 2. Confinement Validation ────────────────────────────

  describe('2. Confinement validation', () => {
    it('allows paths within the canonical root', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const result = validateConfinement(binding, 'packages/foo/src');
      expect(result.confined).toBe(true);
      expect(result.resolvedPath).toBe(path.join(tmpDir, 'packages/foo/src'));
    });

    it('rejects path traversal (..) escaping the root', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const result = validateConfinement(binding, '../../etc/passwd');
      expect(result.confined).toBe(false);
      expect(result.reason).toContain('escapes repository root');
    });

    it('rejects absolute paths outside the root', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const result = validateConfinement(binding, '/etc/passwd');
      expect(result.confined).toBe(false);
      expect(result.reason).toContain('escapes repository root');
    });

    it('allows the root directory itself', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const result = validateConfinement(binding, '.');
      expect(result.confined).toBe(true);
      expect(result.resolvedPath).toBe(tmpDir);
    });

    it('allows nested paths within root', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const result = validateConfinement(binding, 'a/b/c/d/e/f/g/h');
      expect(result.confined).toBe(true);
      expect(result.resolvedPath).toBe(path.join(tmpDir, 'a/b/c/d/e/f/g/h'));
    });

    it('assertConfinement throws on violation', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      expect(() => assertConfinement(binding, '../../etc/passwd')).toThrow('escapes repository root');
    });

    it('assertConfinement returns resolved path on success', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const resolved = assertConfinement(binding, 'packages/foo');
      expect(resolved).toBe(path.join(tmpDir, 'packages/foo'));
    });
  });

  // ─── 3. Authoritative Execution Directory ─────────────────

  describe('3. Authoritative execution directory', () => {
    it('returns canonical path for authoritative binding', () => {
      const binding = makeBinding({ canonicalPath: tmpDir, authoritative: true });
      const execDir = resolveExecutionDirectory(binding);
      expect(execDir).toBe(path.resolve(tmpDir));
    });

    it('throws for non-authoritative binding', () => {
      const binding = makeBinding({ canonicalPath: tmpDir, authoritative: false });
      expect(() => resolveExecutionDirectory(binding)).toThrow('non-authoritative binding');
    });
  });

  // ─── 4. Repository Substitution Detection ─────────────────

  describe('4. Repository substitution detection', () => {
    it('same path bindings are identical', () => {
      const binding1 = makeBinding({ canonicalPath: tmpDir });
      const binding2 = makeBinding({ canonicalPath: tmpDir });
      expect(verifyBindingIdentity(binding1, binding2)).toBe(true);
    });

    it('different path bindings are not identical', () => {
      const binding1 = makeBinding({ canonicalPath: '/tmp/workspace-a' });
      const binding2 = makeBinding({ canonicalPath: '/tmp/workspace-b' });
      expect(verifyBindingIdentity(binding1, binding2)).toBe(false);
    });

    it('parent path is not identical to child path', () => {
      const binding1 = makeBinding({ canonicalPath: tmpDir });
      const binding2 = makeBinding({ canonicalPath: path.join(tmpDir, 'subdir') });
      expect(verifyBindingIdentity(binding1, binding2)).toBe(false);
    });

    it('R1 binding cannot be substituted by R2 at runtime', () => {
      // Simulate: execution has binding R1, runtime tries to substitute R2
      const r1 = makeBinding({ canonicalPath: '/home/user/projects/vestara/vestara-platform' });
      const r2 = makeBinding({ canonicalPath: '/home/user/projects/vestara' });

      // Different paths → not identical → substitution detected
      expect(verifyBindingIdentity(r1, r2)).toBe(false);

      // Execution directory from R1
      const execDir = resolveExecutionDirectory(r1);
      expect(execDir).toBe('/home/user/projects/vestara/vestara-platform');

      // R2's path does not match R1
      expect(execDir).not.toBe(r2.canonicalPath);
    });
  });

  // ─── 5. process.cwd() Replacement ────────────────────────

  describe('5. process.cwd() replacement', () => {
    it('resolveRepositoryBinding replaces process.cwd() with canonical path', () => {
      createWorkspaceFixture(tmpDir, 'test-ws');
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      expect(result.binding.canonicalPath).not.toBe(process.cwd());
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
    });

    it('explicit path takes precedence over workspace discovery', () => {
      createWorkspaceFixture(tmpDir, 'test-ws');
      const otherDir = path.join(tmpDir, 'other');
      createWorkspaceFixture(otherDir, 'other-ws');
      const result = resolveRepositoryBinding({
        explicitPath: tmpDir,
        startDir: otherDir,
      });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.workspaceId).toBe('test-ws');
    });
  });

  // ─── 6. Confinement Against Real Paths ────────────────────

  describe('6. Confinement against real filesystem paths', () => {
    it('confines real directory creation within binding root', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const confinedPath = assertConfinement(binding, 'new-directory');
      fs.mkdirSync(confinedPath);
      expect(fs.existsSync(confinedPath)).toBe(true);
      expect(confinedPath.startsWith(tmpDir)).toBe(true);
    });

    it('prevents writing outside binding root via traversal', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      expect(() => assertConfinement(binding, '../../tmp/evil-file')).toThrow();
    });

    it('validates that tmpDir itself is a valid workspace root', () => {
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.authoritative).toBe(true);
      const execDir = resolveExecutionDirectory(result.binding);
      const testFile = path.join(execDir, 'm5-test-file.txt');
      fs.writeFileSync(testFile, 'test');
      expect(fs.existsSync(testFile)).toBe(true);
      fs.unlinkSync(testFile);
    });
  });

  // ─── 7. Governed Mode Fail-Closed ────────────────────────

  describe('7. Governed mode fail-closed', () => {
    it('governed mode throws when no workspace discovered', () => {
      expect(() =>
        resolveRepositoryBinding({
          startDir: '/tmp/nonexistent-path-xyz',
          mode: 'governed',
        }),
      ).toThrow('Repository authority resolution failed');
    });

    it('governed mode throws with helpful message about VESTARA_REPO', () => {
      try {
        resolveRepositoryBinding({
          startDir: '/tmp/nonexistent-path-xyz',
          mode: 'governed',
        });
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).toContain('VESTARA_REPO');
        expect((e as Error).message).toContain('process.cwd() is not an authority');
      }
    });

    it('governed mode succeeds with workspace discovery', () => {
      createWorkspaceFixture(tmpDir, 'gov-ws');
      const subDir = path.join(tmpDir, 'deep', 'nested');
      fs.mkdirSync(subDir, { recursive: true });

      const result = resolveRepositoryBinding({
        startDir: subDir,
        mode: 'governed',
      });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.authoritative).toBe(true);
    });

    it('governed mode succeeds with explicit path', () => {
      const result = resolveRepositoryBinding({
        explicitPath: tmpDir,
        mode: 'governed',
      });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.authoritative).toBe(true);
    });
  });

  // ─── 8. Symlink Confinement ──────────────────────────────

  describe('8. Symlink confinement', () => {
    it('rejects symlink file escape', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const outsideDir = path.join(os.tmpdir(), 'm5-escape-target-' + Date.now());
      fs.mkdirSync(outsideDir);
      fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret');

      // Create symlink inside workspace pointing outside
      const symlinkPath = path.join(tmpDir, 'escape-link');
      fs.symlinkSync(outsideDir, symlinkPath);

      // Lexical path is inside workspace, but real path is outside
      const result = validateConfinement(binding, 'escape-link/secret.txt');
      expect(result.confined).toBe(false);
      expect(result.reason).toContain('Symlink escapes repository root');

      // Cleanup
      fs.unlinkSync(symlinkPath);
      fs.rmSync(outsideDir, { recursive: true, force: true });
    });

    it('rejects symlink directory escape', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const outsideDir = path.join(os.tmpdir(), 'm5-escape-dir-' + Date.now());
      fs.mkdirSync(outsideDir);

      // Create symlink inside workspace pointing to outside directory
      const symlinkPath = path.join(tmpDir, 'escape-dir-link');
      fs.symlinkSync(outsideDir, symlinkPath);

      // Lexical path is inside, real path escapes
      const result = validateConfinement(binding, 'escape-dir-link');
      expect(result.confined).toBe(false);
      expect(result.reason).toContain('Symlink escapes repository root');

      // Cleanup
      fs.unlinkSync(symlinkPath);
      fs.rmSync(outsideDir, { recursive: true, force: true });
    });

    it('allows symlinks within workspace', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });

      // Create a real directory and a symlink to it within workspace
      const realDir = path.join(tmpDir, 'real');
      fs.mkdirSync(realDir);
      const symlinkPath = path.join(tmpDir, 'link-to-real');
      fs.symlinkSync(realDir, symlinkPath);

      const result = validateConfinement(binding, 'link-to-real');
      expect(result.confined).toBe(true);

      // Cleanup
      fs.unlinkSync(symlinkPath);
      fs.rmSync(realDir, { recursive: true, force: true });
    });

    it('validateSymlinkConfinement returns true for nonexistent target', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const result = validateSymlinkConfinement(binding, path.join(tmpDir, 'nonexistent'));
      expect(result).toBe(true);
    });

    it('validateSymlinkConfinement returns false for escape symlink', () => {
      const binding = makeBinding({ canonicalPath: tmpDir });
      const outsideDir = path.join(os.tmpdir(), 'm5-symlink-escape-' + Date.now());
      fs.mkdirSync(outsideDir);

      const symlinkPath = path.join(tmpDir, 'escape-link');
      fs.symlinkSync(outsideDir, symlinkPath);

      const result = validateSymlinkConfinement(binding, symlinkPath);
      expect(result).toBe(false);

      // Cleanup
      fs.unlinkSync(symlinkPath);
      fs.rmSync(outsideDir, { recursive: true, force: true });
    });
  });

  // ─── 9. Parent-Workspace Defect (Hermetic) ───────────────

  describe('9. Parent-workspace defect impossibility', () => {
    it('governed mode with CWD = parent throws (no downward walk)', () => {
      // Topology: parent has no workspace, child has workspace
      // Walk-up from parent goes upward — never finds child's workspace
      const parentDir = path.join(tmpDir, 'parent');
      const childDir = path.join(tmpDir, 'parent', 'child');
      fs.mkdirSync(childDir, { recursive: true });
      createWorkspaceFixture(childDir, 'child-ws');

      // Governed mode from parent: walk-up fails → throws
      expect(() => resolveRepositoryBinding({ startDir: parentDir, mode: 'governed' })).toThrow(
        'Repository authority resolution failed',
      );
    });

    it('explicit path to child succeeds (VESTARA_REPO or CLI arg)', () => {
      const parentDir = path.join(tmpDir, 'projects');
      const childDir = path.join(tmpDir, 'projects', 'vestara-ai-core');
      fs.mkdirSync(childDir, { recursive: true });
      createWorkspaceFixture(childDir, 'ai-core-ws');

      // Explicit path (like VESTARA_REPO) resolves correctly
      const result = resolveRepositoryBinding({
        explicitPath: childDir,
        mode: 'governed',
      });
      expect(result.binding.canonicalPath).toBe(path.resolve(childDir));
      expect(result.binding.workspaceId).toBe('ai-core-ws');
      expect(result.binding.authoritative).toBe(true);
    });

    it('execution directory is vestara-ai-core, not vestara parent', () => {
      const parentDir = path.join(tmpDir, 'projects');
      const childDir = path.join(tmpDir, 'projects', 'vestara-ai-core');
      fs.mkdirSync(childDir, { recursive: true });
      createWorkspaceFixture(childDir, 'ai-core-ws');

      const result = resolveRepositoryBinding({
        explicitPath: childDir,
        mode: 'governed',
      });

      const execDir = resolveExecutionDirectory(result.binding);
      expect(execDir).toBe(path.resolve(childDir));
      expect(execDir).not.toBe(path.resolve(parentDir));
    });

    it('filesystem mutation is confined to child, not parent', () => {
      const parentDir = path.join(tmpDir, 'projects');
      const childDir = path.join(tmpDir, 'projects', 'my-repo');
      fs.mkdirSync(childDir, { recursive: true });
      createWorkspaceFixture(childDir, 'my-repo-ws');

      const result = resolveRepositoryBinding({
        explicitPath: childDir,
        mode: 'governed',
      });

      // Confine file creation to the child workspace
      const confinedPath = assertConfinement(result.binding, 'new-file.txt');
      fs.writeFileSync(confinedPath, 'content');

      // File is in child, NOT in parent
      expect(fs.existsSync(confinedPath)).toBe(true);
      expect(confinedPath.startsWith(childDir)).toBe(true);
      expect(fs.existsSync(path.join(parentDir, 'new-file.txt'))).toBe(false);
    });

    it('attempts against parent directory are rejected', () => {
      const parentDir = path.join(tmpDir, 'parent-workspace');
      const childDir = path.join(tmpDir, 'parent-workspace', 'child-repo');
      fs.mkdirSync(childDir, { recursive: true });
      createWorkspaceFixture(childDir, 'child-ws');

      const result = resolveRepositoryBinding({
        explicitPath: childDir,
        mode: 'governed',
      });

      // Try to write to parent
      expect(() => assertConfinement(result.binding, '../parent-file.txt')).toThrow();
      // Try to escape via traversal
      expect(() => assertConfinement(result.binding, '../../etc/passwd')).toThrow();
    });

    it('sibling repository is rejected', () => {
      const repoA = path.join(tmpDir, 'repo-a');
      const repoB = path.join(tmpDir, 'repo-b');
      fs.mkdirSync(repoA, { recursive: true });
      fs.mkdirSync(repoB, { recursive: true });
      createWorkspaceFixture(repoA, 'ws-a');
      createWorkspaceFixture(repoB, 'ws-b');

      const result = resolveRepositoryBinding({
        explicitPath: repoA,
        mode: 'governed',
      });

      // Binding is repo-a, try to access repo-b (sibling)
      const siblingPath = path.join(repoA, '..', 'repo-b', 'file.txt');
      const result2 = validateConfinement(result.binding, siblingPath);
      expect(result2.confined).toBe(false);
    });

    it('walk-up from subdirectory finds workspace in ancestor', () => {
      // Topology: workspace in ancestor, CLI invoked from deep subdirectory
      createWorkspaceFixture(tmpDir, 'ancestor-ws');
      const deepDir = path.join(tmpDir, 'packages', 'deep', 'nested');
      fs.mkdirSync(deepDir, { recursive: true });

      // Walk-up from deepDir finds tmpDir's workspace
      const result = resolveRepositoryBinding({
        startDir: deepDir,
        mode: 'governed',
      });
      expect(result.binding.canonicalPath).toBe(path.resolve(tmpDir));
      expect(result.binding.workspaceId).toBe('ancestor-ws');
      expect(result.binding.authoritative).toBe(true);
    });
  });

  // ─── 10. vestaraPath Utility ─────────────────────────────

  describe('10. vestaraPath utility', () => {
    it('constructs .vestara path from binding', () => {
      const binding = makeBinding({ canonicalPath: tmpDir, vestaraDir: path.join(tmpDir, '.vestara') });
      expect(vestaraPath(binding)).toBe(path.join(tmpDir, '.vestara'));
    });

    it('constructs .vestara subpath from binding', () => {
      const binding = makeBinding({ canonicalPath: tmpDir, vestaraDir: path.join(tmpDir, '.vestara') });
      expect(vestaraPath(binding, 'prefs.db')).toBe(path.join(tmpDir, '.vestara', 'prefs.db'));
      expect(vestaraPath(binding, 'plans', 'plans.db')).toBe(path.join(tmpDir, '.vestara', 'plans', 'plans.db'));
    });
  });

  // ─── 11. Binding Immutability ────────────────────────────

  describe('11. Binding immutability', () => {
    it('binding fields do not change after creation', () => {
      const result = resolveRepositoryBinding({ explicitPath: tmpDir });
      const originalPath = result.binding.canonicalPath;
      const originalId = result.binding.bindingId;
      const originalSource = result.binding.source;

      // Simulate some operations
      validateConfinement(result.binding, 'packages/foo');
      assertConfinement(result.binding, 'packages/bar');

      // Binding is unchanged
      expect(result.binding.canonicalPath).toBe(originalPath);
      expect(result.binding.bindingId).toBe(originalId);
      expect(result.binding.source).toBe(originalSource);
    });

    it('different bindings have different IDs', () => {
      const r1 = resolveRepositoryBinding({ explicitPath: tmpDir });
      const r2 = resolveRepositoryBinding({ explicitPath: tmpDir });
      // Different timestamps → different IDs
      expect(r1.binding.bindingId).not.toBe(r2.binding.bindingId);
    });
  });
});
