import { describe, expect, it } from 'vitest';
import {
  ExecutableResolutionError,
  formatResolutionError,
  platformTarget,
  resolveExecutableTarget,
  resolvePackageExecutable,
  SUPPORTED_TUI_TARGETS,
} from '../src/executable-resolver.js';

const LINUX_X64 = { platform: 'linux', architecture: 'x64' } as const;
const LINUX_ARM = { platform: 'linux', architecture: 'arm64' } as const;
const WIN_X64 = { platform: 'win32', architecture: 'x64' } as const;
const LINUX_ARM7 = { platform: 'linux', architecture: 'arm' } as const;

const MAPPING = {
  targets: {
    'linux-x64': 'bin/vestara-tui-linux-x64',
    'linux-arm64': 'bin/vestara-tui-linux-arm64',
    'win32-x64': 'bin/vestara-tui-win32-x64.exe',
  },
  checksums: { 'linux-x64': 'abc123', 'win32-x64': 'def456' },
};

const MANIFEST = {
  id: 'vestara.tui',
  version: '0.1.0',
  entrypoints: { executable: MAPPING },
} as const;

describe('platform artifact resolver', () => {
  it('maps Node platform/arch to canonical targets', () => {
    expect(platformTarget('linux', 'x64')).toBe('linux-x64');
    expect(platformTarget('darwin', 'arm64')).toBe('darwin-arm64');
    expect(platformTarget('win32', 'x64')).toBe('win32-x64');
    expect(platformTarget('linux', 'ia32')).toBe('linux-x64');
  });

  it('declares all supported TUI targets', () => {
    expect(SUPPORTED_TUI_TARGETS).toContain('linux-x64');
    expect(SUPPORTED_TUI_TARGETS).toContain('linux-arm64');
    expect(SUPPORTED_TUI_TARGETS).toContain('darwin-x64');
    expect(SUPPORTED_TUI_TARGETS).toContain('darwin-arm64');
    expect(SUPPORTED_TUI_TARGETS).toContain('win32-x64');
  });

  it('resolves the matching executable for the host platform', () => {
    const linux = resolveExecutableTarget(MAPPING, LINUX_X64);
    expect(linux.target).toBe('linux-x64');
    expect(linux.relativePath).toBe('bin/vestara-tui-linux-x64');

    const win = resolveExecutableTarget(MAPPING, WIN_X64);
    expect(win.relativePath).toBe('bin/vestara-tui-win32-x64.exe');
  });

  it('returns a precise error for unsupported targets', () => {
    expect(() => resolveExecutableTarget(MAPPING, LINUX_ARM7)).toThrow(ExecutableResolutionError);
    try {
      resolveExecutableTarget(MAPPING, LINUX_ARM7);
    } catch (error) {
      const err = error as ExecutableResolutionError;
      expect(err.message).toContain('linux-arm');
      expect(err.target).toBe('linux-arm');
    }
  });

  it('errors when the package declares no executable targets', () => {
    expect(() => resolveExecutableTarget(undefined, LINUX_X64)).toThrow(ExecutableResolutionError);
    expect(() => resolveExecutableTarget(undefined, LINUX_X64)).toThrow(
      'Package does not declare any executable targets',
    );
  });

  it('resolves a full package executable with checksum', () => {
    const executable = resolvePackageExecutable('/pkg/vestara.tui/0.1.0', MANIFEST, LINUX_X64);
    expect(executable.packageId).toBe('vestara.tui');
    expect(executable.version).toBe('0.1.0');
    expect(executable.path).toContain('bin/vestara-tui-linux-x64');
    expect(executable.checksum).toBe('abc123');
  });

  it('rejects executable paths that escape the package directory', () => {
    const malicious = {
      ...MANIFEST,
      entrypoints: { executable: { targets: { 'linux-x64': '../../../outside.sh' } } },
    };
    expect(() => resolvePackageExecutable('/pkg/vestara.tui/0.1.0', malicious, LINUX_X64)).toThrow(
      ExecutableResolutionError,
    );
    expect(() => resolvePackageExecutable('/pkg/vestara.tui/0.1.0', malicious, LINUX_X64)).toThrow(
      'escapes package directory',
    );
  });

  it('formats a helpful resolution error', () => {
    const error = new ExecutableResolutionError('No executable is available for linux-arm', LINUX_ARM7, 'linux-arm');
    const formatted = formatResolutionError('vestara.tui', '0.1.0', error);
    expect(formatted).toContain('vestara.tui@0.1.0');
    expect(formatted).toContain('linux-x64');
  });

  it('resolves arm64 correctly', () => {
    const arm = resolveExecutableTarget(MAPPING, LINUX_ARM);
    expect(arm.relativePath).toBe('bin/vestara-tui-linux-arm64');
  });
});
