import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NativePackageInstaller } from '../src/installer.js';
import { sha256OfFile } from '../src/security.js';
import { NativeInstallStore } from '../src/store.js';

let root: string;
let installer: NativePackageInstaller;
let events: string[];

function manifest(version: string, checksum: string): VestaraPackageManifest {
  return {
    schemaVersion: 1,
    id: 'vestara.tui',
    name: 'Vestara Terminal Workspace',
    version,
    description: 'test fixture',
    type: 'tui',
    publisher: { id: 'vestara', name: 'Vestara' },
    compatibility: { vestara: '>=0.3.0' },
    entrypoints: {
      executable: {
        targets: { 'linux-x64': 'bin/vestara-tui-linux-x64' },
        checksums: { 'linux-x64': checksum },
      },
    },
    capabilities: ['tui:render'],
    permissions: [],
    dependencies: [],
    contributions: {},
    isolation: 'process',
    integrity: { algorithm: 'sha256', digest: '0'.repeat(64) },
  };
}

/** A fake TUI binary that answers --health-check with the given id/version. */
function writeExecutable(dir: string, opts: { version: string; packageId?: string; exitCode?: number }): string {
  const binDir = join(dir, 'bin');
  mkdirSync(binDir, { recursive: true });
  const exe = join(binDir, 'vestara-tui-linux-x64');
  writeFileSync(
    exe,
    `#!/bin/sh\nif [ "$1" = "--health-check" ]; then\n  echo '{"ok":true,"packageId":"${opts.packageId ?? 'vestara.tui'}","version":"${opts.version}","renderer":"opentui","runtime":"bun","platform":"linux-x64","terminalRequired":false}'\n  exit ${opts.exitCode ?? 0}\nfi\necho 'no'\n`,
  );
  execSync(`chmod +x "${exe}"`);
  return exe;
}

function writeSourcePackage(
  dir: string,
  version: string,
  opts: { packageId?: string; exitCode?: number } = {},
): string {
  mkdirSync(dir, { recursive: true });
  const exe = writeExecutable(dir, { version, ...opts });
  const checksum = sha256OfFile(exe);
  writeFileSync(join(dir, 'vestara-package.json'), JSON.stringify(manifest(version, checksum), null, 2));
  return exe;
}

beforeEach(() => {
  root = join(tmpdir(), `native-installer-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  events = [];
  installer = new NativePackageInstaller({ root, eventSink: (_event, _payload) => events.push(_event) });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('native installer lifecycle', () => {
  it('installs a package and commits a record with the staged executable', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0');
    const outcome = await installer.install({ sourceDirectory: source, activate: true });
    expect(outcome.phase).toBe('completed');
    expect(outcome.activeVersion).toBe('0.1.0');

    const record = installer.installation('vestara.tui');
    expect(record).toBeDefined();
    expect(record?.activeVersion).toBe('0.1.0');
    expect(record?.installedVersions).toHaveLength(1);
    expect(record?.installedVersions[0]?.health).toBe('healthy');
    expect(record?.installedVersions[0]?.executablePath).toBe('bin/vestara-tui-linux-x64');

    const store = new NativeInstallStore({ root });
    const stagedExe = store.executablePath('vestara.tui', '0.1.0', 'bin/vestara-tui-linux-x64');
    expect(existsSync(stagedExe)).toBe(true);
    expect(readdirSync(store.versionDir('vestara.tui', '0.1.0'))).toContain('vestara-package.json');
  });

  it('emits lifecycle events in order', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0');
    await installer.install({ sourceDirectory: source });
    expect(events).toEqual(
      expect.arrayContaining([
        'marketplace.install.created',
        'marketplace.install.artifact-resolved',
        'marketplace.install.health-check-completed',
        'marketplace.install.committed',
      ]),
    );
    expect(events[0]).toBe('marketplace.install.created');
    expect(events.at(-1)).toBe('marketplace.install.committed');
  });

  it('rejects non-tui packages', async () => {
    const source = join(root, 'src');
    mkdirSync(source, { recursive: true });
    writeFileSync(
      join(source, 'vestara-package.json'),
      JSON.stringify({ ...manifest('0.1.0', '0'.repeat(64)), type: 'provider' }, null, 2),
    );
    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow('requires type "tui"');
  });

  it('fails on missing executable entrypoint', async () => {
    const source = join(root, 'src');
    mkdirSync(source, { recursive: true });
    const noExecutable = { ...manifest('0.1.0', '0'.repeat(64)), entrypoints: {} };
    writeFileSync(join(source, 'vestara-package.json'), JSON.stringify(noExecutable, null, 2));
    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow('no executable entrypoint');
  });
});

describe('checksum and health failures', () => {
  it('rolls back and removes staged files on checksum mismatch', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0');
    // Corrupt the manifest checksum so it no longer matches the binary.
    const manifestPath = join(source, 'vestara-package.json');
    const badManifest = { ...manifest('0.1.0', 'f'.repeat(64)), type: 'tui' } as VestaraPackageManifest;
    writeFileSync(manifestPath, JSON.stringify(badManifest, null, 2));

    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow('Checksum mismatch');
    expect(installer.installation('vestara.tui')).toBeUndefined();
    const store = new NativeInstallStore({ root });
    expect(existsSync(store.versionDir('vestara.tui', '0.1.0'))).toBe(false);
    expect(events).toContain('marketplace.install.rollback-started');
    expect(events).toContain('marketplace.install.failed');
  });

  it('rolls back on a failing health check and leaves no committed record', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0', { exitCode: 3 });
    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow('Health check failed');
    expect(installer.installation('vestara.tui')).toBeUndefined();
    const store = new NativeInstallStore({ root });
    expect(existsSync(store.versionDir('vestara.tui', '0.1.0'))).toBe(false);
  });

  it('rolls back on an identity mismatch between manifest and binary', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0', { packageId: 'unrelated.package' });
    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow('identity mismatch');
    expect(installer.installation('vestara.tui')).toBeUndefined();
  });

  it('rolls back on a version mismatch between manifest and binary', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0', { version: '0.1.4' });
    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow('version mismatch');
    expect(installer.installation('vestara.tui')).toBeUndefined();
  });
});

describe('updates, rollback, and side-by-side versions', () => {
  it('installs versions side-by-side and switches the active version', async () => {
    const source1 = join(root, 'src-1');
    writeSourcePackage(source1, '0.1.0');
    await installer.install({ sourceDirectory: source1 });

    const source2 = join(root, 'src-2');
    writeSourcePackage(source2, '0.2.0');
    await installer.update('vestara.tui', source2);

    const record = installer.installation('vestara.tui');
    expect(record?.installedVersions).toHaveLength(2);
    expect(record?.activeVersion).toBe('0.2.0');
    const store = new NativeInstallStore({ root });
    expect(existsSync(store.versionDir('vestara.tui', '0.1.0'))).toBe(true);
    expect(existsSync(store.versionDir('vestara.tui', '0.2.0'))).toBe(true);
  });

  it('rolls back to the previous version on request', async () => {
    const source1 = join(root, 'src-1');
    writeSourcePackage(source1, '0.1.0');
    await installer.install({ sourceDirectory: source1 });
    const source2 = join(root, 'src-2');
    writeSourcePackage(source2, '0.2.0');
    await installer.update('vestara.tui', source2);

    const result = installer.rollback({ packageId: 'vestara.tui' });
    expect(result.activeVersion).toBe('0.1.0');
    expect(result.rolledBackFrom).toBe('0.2.0');
    expect(installer.installation('vestara.tui')?.activeVersion).toBe('0.1.0');
  });

  it('preserves the prior active version when a new version fails health', async () => {
    const source1 = join(root, 'src-1');
    writeSourcePackage(source1, '0.1.0');
    await installer.install({ sourceDirectory: source1 });

    const source2 = join(root, 'src-2');
    writeSourcePackage(source2, '0.2.0', { exitCode: 7 });
    await expect(installer.update('vestara.tui', source2)).rejects.toThrow('Health check failed');

    const record = installer.installation('vestara.tui');
    expect(record?.activeVersion).toBe('0.1.0');
    expect(record?.installedVersions.map((version) => version.version)).toEqual(['0.1.0']);
  });

  it('rejects updating a package that is not installed', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0');
    await expect(installer.update('vestara.tui', source)).rejects.toThrow('not installed');
  });
});

describe('interrupted-install recovery', () => {
  it('recovers a stale journal by removing staged files and restoring prior record', async () => {
    const source1 = join(root, 'src-1');
    writeSourcePackage(source1, '0.1.0');
    await installer.install({ sourceDirectory: source1 });

    // Simulate an interrupted 0.2.0 install: staged dir + journal at 'staging'.
    const store = new NativeInstallStore({ root });
    const stagedDir = store.versionDir('vestara.tui', '0.2.0');
    mkdirSync(stagedDir, { recursive: true });
    writeFileSync(join(stagedDir, 'leftover.txt'), 'partial');
    store.writeJournal({
      transactionId: 'tx-interrupted',
      packageId: 'vestara.tui',
      version: '0.2.0',
      phase: 'staging',
      previousActiveVersion: '0.1.0',
      stagedPath: stagedDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    installer.recover('vestara.tui');
    expect(existsSync(stagedDir)).toBe(false);
    expect(installer.installation('vestara.tui')?.activeVersion).toBe('0.1.0');
  });
});

describe('security hardening', () => {
  it('rejects an executable path that escapes the package directory', async () => {
    const source = join(root, 'src');
    mkdirSync(source, { recursive: true });
    writeExecutable(source, { version: '0.1.0' });
    const escaped = {
      ...manifest('0.1.0', '0'.repeat(64)),
      entrypoints: {
        executable: { targets: { 'linux-x64': '../../outside.sh' }, checksums: {} },
      },
    } as VestaraPackageManifest;
    writeFileSync(join(source, 'vestara-package.json'), JSON.stringify(escaped, null, 2));
    await expect(installer.install({ sourceDirectory: source })).rejects.toThrow();
    expect(installer.installation('vestara.tui')).toBeUndefined();
  });

  it('uninstall removes owned artifacts but retains configuration unless purged', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0');
    await installer.install({ sourceDirectory: source });
    const store = new NativeInstallStore({ root });
    const configDir = store.configurationDir('vestara.tui');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'tui-config.json'), '{"enabled":true}');

    installer.uninstall({ packageId: 'vestara.tui' });
    expect(existsSync(configDir)).toBe(true); // retained
    expect(installer.installation('vestara.tui')).toBeUndefined();

    // Reinstall then purge.
    const source2 = join(root, 'src2');
    writeSourcePackage(source2, '0.1.0');
    await installer.install({ sourceDirectory: source2 });
    installer.uninstall({ packageId: 'vestara.tui', purge: true });
    expect(existsSync(configDir)).toBe(false);
  });
});

describe('canonical store layout', () => {
  it('places immutable versions under versions/<version>', async () => {
    const source = join(root, 'src');
    writeSourcePackage(source, '0.1.0');
    await installer.install({ sourceDirectory: source });
    const store = new NativeInstallStore({ root });
    expect(existsSync(store.installationPath('vestara.tui'))).toBe(true);
    const record = readFileSync(store.installationPath('vestara.tui'), 'utf8');
    expect(JSON.parse(record).packageId).toBe('vestara.tui');
  });
});
