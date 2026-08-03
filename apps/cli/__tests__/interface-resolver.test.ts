import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultPackagesRoot,
  isInteractiveTerminal,
  readInstalledPackage,
  resolveInterface,
  TUI_PACKAGE_ID,
} from '../src/lib/interface-resolver.js';

const MANIFEST = {
  schemaVersion: 1,
  id: 'vestara.tui',
  name: 'Vestara Terminal Workspace',
  version: '0.1.0',
  description: 'test',
  type: 'tui',
  publisher: { id: 'vestara', name: 'Vestara' },
  compatibility: { vestara: '>=0.3.0' },
  entrypoints: {
    executable: { targets: { 'linux-x64': 'bin/vestara-tui-linux-x64' } },
  },
  capabilities: ['tui:render'],
  permissions: [],
  dependencies: [],
  contributions: {},
  isolation: 'process',
  integrity: { algorithm: 'sha256', digest: '0'.repeat(64) },
} as const;

describe('interactive-interface resolver', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vestara-tui-resolver-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves a tui package when installed and enabled', () => {
    const packageDir = join(root, TUI_PACKAGE_ID, '0.1.0');
    mkdirSync(join(packageDir, 'bin'), { recursive: true });
    writeFileSync(join(packageDir, 'bin', 'vestara-tui-linux-x64'), '#!/bin/sh\n');
    const state = {
      schemaVersion: 1,
      packages: {
        [TUI_PACKAGE_ID]: {
          packageId: TUI_PACKAGE_ID,
          currentVersion: '0.1.0',
          versions: {
            '0.1.0': {
              manifest: MANIFEST,
              installedAt: '',
              trust: 'local-development',
              state: 'active',
              grantedPermissions: [],
              health: { status: 'healthy', checkedAt: '' },
            },
          },
          enabledWorkspaces: ['workspace-1'],
        },
      },
    };
    writeFileSync(join(root, 'extensions.json'), JSON.stringify(state));
    const resolution = resolveInterface({ packagesRoot: root });
    expect(resolution.kind).toBe('tui');
    if (resolution.kind === 'tui') {
      expect(resolution.executable.path).toContain('bin/vestara-tui-linux-x64');
      expect(resolution.executable.packageId).toBe(TUI_PACKAGE_ID);
    }
  });

  it('degrades to CLI when the package is not installed', () => {
    const resolution = resolveInterface({ packagesRoot: root });
    expect(resolution.kind).toBe('cli');
  });

  it('degrades to CLI when the package is disabled', () => {
    const state = {
      schemaVersion: 1,
      packages: {
        [TUI_PACKAGE_ID]: {
          packageId: TUI_PACKAGE_ID,
          currentVersion: '0.1.0',
          versions: {
            '0.1.0': {
              manifest: MANIFEST,
              installedAt: '',
              trust: 'local-development',
              state: 'installed',
              grantedPermissions: [],
              health: { status: 'unknown', checkedAt: '' },
            },
          },
          enabledWorkspaces: [],
        },
      },
    };
    writeFileSync(join(root, 'extensions.json'), JSON.stringify(state));
    const resolution = resolveInterface({ packagesRoot: root });
    expect(resolution.kind).toBe('cli');
    expect(resolution.kind === 'cli' && resolution.reason).toContain('disabled');
  });

  it('returns unavailable when the package is required but missing', () => {
    const resolution = resolveInterface({ packagesRoot: root }, { requirePackage: true });
    expect(resolution.kind).toBe('unavailable');
  });

  it('returns unavailable when the executable is missing', () => {
    const state = {
      schemaVersion: 1,
      packages: {
        [TUI_PACKAGE_ID]: {
          packageId: TUI_PACKAGE_ID,
          currentVersion: '0.1.0',
          versions: {
            '0.1.0': {
              manifest: MANIFEST,
              installedAt: '',
              trust: 'local-development',
              state: 'active',
              grantedPermissions: [],
              health: { status: 'healthy', checkedAt: '' },
            },
          },
          enabledWorkspaces: ['workspace-1'],
        },
      },
    };
    writeFileSync(join(root, 'extensions.json'), JSON.stringify(state));
    const resolution = resolveInterface({ packagesRoot: root });
    expect(resolution.kind).toBe('unavailable');
  });

  it('reports the packages root under XDG data home', () => {
    const previous = process.env.XDG_DATA_HOME;
    process.env.XDG_DATA_HOME = '/tmp/xdg';
    try {
      expect(defaultPackagesRoot()).toBe('/tmp/xdg/vestara/packages');
    } finally {
      if (previous === undefined) delete process.env.XDG_DATA_HOME;
      else process.env.XDG_DATA_HOME = previous;
    }
  });

  it('detects interactive terminals and CI', () => {
    expect(isInteractiveTerminal({ CI: 'true' })).toBe(false);
    expect(isInteractiveTerminal({ CI: '1' })).toBe(false);
  });

  it('reads an installed package from state', () => {
    const state = {
      schemaVersion: 1,
      packages: {
        [TUI_PACKAGE_ID]: {
          packageId: TUI_PACKAGE_ID,
          currentVersion: '0.1.0',
          versions: {},
          enabledWorkspaces: [],
        },
      },
    };
    writeFileSync(join(root, 'extensions.json'), JSON.stringify(state));
    const installed = readInstalledPackage(root, TUI_PACKAGE_ID);
    expect(installed?.currentVersion).toBe('0.1.0');
  });
});
