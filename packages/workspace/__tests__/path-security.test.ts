import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PathSecurity } from '../src/path-security';

describe('PathSecurity', () => {
  const workspaceRoot = '/home/user/projects/my-app';
  const security = new PathSecurity(workspaceRoot);

  it('allows paths within workspace', () => {
    const result = security.validatePath('src/index.ts');
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.resolvedPath).toBe(path.join(workspaceRoot, 'src/index.ts'));
  });

  it('allows subdirectory paths', () => {
    const result = security.validatePath('packages/utils/src/helpers.ts');
    expect(result.allowed).toBe(true);
  });

  it('denies paths to /etc', () => {
    const result = security.validatePath('/etc/nginx/nginx.conf');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('system path');
  });

  it('denies paths to /etc/passwd', () => {
    const result = security.validatePath('/etc/passwd');
    expect(result.allowed).toBe(false);
  });

  it('denies paths to /sys', () => {
    const result = security.validatePath('/sys/class/power_supply');
    expect(result.allowed).toBe(false);
  });

  it('denies paths to /proc', () => {
    const result = security.validatePath('/proc/self/environ');
    expect(result.allowed).toBe(false);
  });

  it('allows outside paths with confirmation when not always-denied', () => {
    const result = security.validatePath('/tmp/outside-file.txt');
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.reason).toContain('confirmation required');
  });

  it('assertWithinWorkspace returns resolved path for valid paths', () => {
    const resolved = security.assertWithinWorkspace('file.ts');
    expect(resolved).toBe(path.join(workspaceRoot, 'file.ts'));
  });

  it('assertWithinWorkspace throws for always-denied paths', () => {
    expect(() => security.assertWithinWorkspace('/etc/hosts')).toThrow();
  });

  it('returns allowed prefixes', () => {
    const prefixes = security.allowedPrefixes;
    expect(prefixes).toContain(workspaceRoot);
  });

  it('allows path traversal with .. when outside workspace (requires confirmation)', () => {
    const result = security.validatePath('../other-project/file.ts');
    expect(result.allowed).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
  });

  it('blocks path traversal with .. that stays within workspace', () => {
    const result = security.validatePath('src/../index.ts');
    expect(result.allowed).toBe(true);
  });
});
