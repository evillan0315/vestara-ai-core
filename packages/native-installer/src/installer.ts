// Transactional native package installer.
//
// Lifecycle: resolve → acquire → verify checksum → stage immutable version →
// set permissions → health check → register → activate → commit. On any
// failure: deactivate staged version → remove staged files → restore prior
// active version → restore prior record → emit rollback evidence.
//
// The active version changes by atomically rewriting installation.json — never
// by overwriting binaries. Versions install side-by-side and are retained for
// rollback.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { resolvePackageExecutable } from '@vestara/marketplace';
import { type HealthCheckResult, runHealthCheck } from './health-check';
import { assertNativePackage } from './identity';
import {
  assertChecksum,
  assertContained,
  assertExecutableSize,
  assertExpectedExecutableName,
  assertNoSymlinksInTree,
} from './security';
import { NativeInstallStore } from './store';
import {
  createInstallationRecord,
  createJournal,
  type InstallEventType,
  type InstalledPackageVersion,
  type InstallPhase,
  type NativePackageInstallationRecord,
  type PackageInstallJournal,
} from './types';

export interface NativeInstallerOptions {
  readonly root: string;
  readonly eventSink?: (event: InstallEventType, payload: Record<string, unknown>) => void;
  readonly healthCheckTimeoutMs?: number;
}

export interface InstallRequest {
  /** Directory containing the built package (vestara-package.json + bin/). */
  readonly sourceDirectory: string;
  readonly workspaceId?: string;
  readonly activate?: boolean;
}

export interface InstallOutcome {
  readonly transactionId: string;
  readonly packageId: string;
  readonly version: string;
  readonly phase: InstallPhase;
  readonly activeVersion?: string;
  readonly health?: HealthCheckResult;
}

export interface RollbackRequest {
  readonly packageId: string;
  readonly targetVersion?: string;
}

export interface UninstallRequest {
  readonly packageId: string;
  readonly purge?: boolean;
}

export class NativePackageInstaller {
  private readonly store: NativeInstallStore;
  private readonly options: NativeInstallerOptions;

  constructor(options: NativeInstallerOptions) {
    this.store = new NativeInstallStore({ root: options.root });
    this.options = options;
  }

  // ─── Public API ───────────────────────────────────────────────

  installation(packageId: string): NativePackageInstallationRecord | undefined {
    return this.store.readInstallationRecord(packageId).record;
  }

  /**
   * Recover interrupted transactions on startup: any journal whose phase is not
   * terminal is rolled back (staged files removed, prior record restored).
   */
  recover(packageId: string): void {
    const journals = this.store.phaseOfIncompleteTransactions(packageId);
    for (const journal of journals) {
      this.rollbackFromJournal(journal);
    }
  }

  recoverAll(): void {
    const packageDirs = fs.existsSync(this.options.root)
      ? fs
          .readdirSync(this.options.root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
      : [];
    for (const packageId of packageDirs) this.recover(packageId);
  }

  async install(request: InstallRequest): Promise<InstallOutcome> {
    const source = path.resolve(request.sourceDirectory);
    const manifest = this.readManifest(source);
    assertNativePackage(manifest);
    const transactionId = identifier('install');
    const activeRecord = this.store.readInstallationRecord(manifest.id).record;
    const journal = createJournal({
      transactionId,
      packageId: manifest.id,
      version: manifest.version,
      phase: 'created',
      previousActiveVersion: activeRecord?.activeVersion,
    });
    this.emit('marketplace.install.created', { transactionId, packageId: manifest.id, version: manifest.version });
    this.store.writeJournal(journal);

    try {
      return await this.runInstall(source, manifest, journal, activeRecord, request);
    } catch (error) {
      this.rollbackFromJournal(journal, error);
      throw error;
    }
  }

  async update(packageId: string, sourceDirectory: string): Promise<InstallOutcome> {
    const record = this.store.readInstallationRecord(packageId).record;
    if (!record) throw new Error(`Cannot update ${packageId}: not installed`);
    return this.install({ sourceDirectory, activate: true });
  }

  rollback(request: RollbackRequest): { activeVersion?: string; rolledBackFrom?: string } {
    const record = this.store.readInstallationRecord(request.packageId).record;
    if (!record) throw new Error(`Cannot rollback ${request.packageId}: not installed`);
    const current = record.activeVersion;
    const previous = request.targetVersion ? request.targetVersion : previousVersionOf(record, current);
    if (!previous || previous === current) {
      return { activeVersion: current, rolledBackFrom: current };
    }
    const updated: NativePackageInstallationRecord = {
      ...record,
      activeVersion: previous,
      updatedAt: new Date().toISOString(),
    };
    this.store.writeInstallationRecord(request.packageId, updated);
    this.emit('marketplace.install.rollback-completed', {
      packageId: request.packageId,
      from: current,
      to: previous,
    });
    return { activeVersion: previous, rolledBackFrom: current };
  }

  uninstall(request: UninstallRequest): void {
    const packageDir = this.store.packageDir(request.packageId);
    if (!fs.existsSync(packageDir)) return;
    const configDir = this.store.configurationDir(request.packageId);
    const configExists = fs.existsSync(configDir);
    // Remove owned artifacts (versions, journal, record) but retain configuration
    // unless purge is requested.
    for (const entry of fs.readdirSync(packageDir)) {
      const full = path.join(packageDir, entry);
      if (entry === 'configuration' && configExists && !request.purge) continue;
      fs.rmSync(full, { recursive: true, force: true });
    }
    if (fs.existsSync(packageDir) && fs.readdirSync(packageDir).length === 0) {
      fs.rmdirSync(packageDir);
    }
  }

  // ─── Internal ─────────────────────────────────────────────────

  private async runInstall(
    source: string,
    manifest: VestaraPackageManifest,
    journal: PackageInstallJournal,
    priorRecord: NativePackageInstallationRecord | undefined,
    request: InstallRequest,
  ): Promise<InstallOutcome> {
    const store = this.store;
    this.advance(journal, 'resolving');
    const platform = { platform: process.platform, architecture: process.arch };
    // Resolve the executable target from the manifest, then map it into the
    // version staging dir (never trust the source layout directly).
    const executable = resolvePackageExecutable(source, manifest, platform);
    const relativeExecutable = path.relative(source, executable.path);
    this.emit('marketplace.install.artifact-resolved', {
      packageId: manifest.id,
      target: executable.target,
      relativePath: relativeExecutable,
    });

    this.advance(journal, 'acquiring');
    const stagedDir = store.versionDir(manifest.id, manifest.version);
    if (fs.existsSync(stagedDir)) {
      throw new Error(`Version already staged: ${manifest.id}@${manifest.version}`);
    }
    // Stage the whole package tree (immutable copy) into versions/<version>.
    fs.mkdirSync(path.dirname(stagedDir), { recursive: true });
    fs.cpSync(source, stagedDir, { recursive: true, errorOnExist: true });
    journal.stagedPath = stagedDir;
    this.store.writeJournal(journal);
    this.emit('marketplace.install.artifact-acquired', { packageId: manifest.id, version: manifest.version });

    // Security: containment, no symlinks, expected filename, size, checksum.
    const stagedExecutable = path.join(stagedDir, relativeExecutable);
    assertContained(stagedDir, stagedExecutable);
    assertNoSymlinksInTree(stagedDir);
    assertExpectedExecutableName(stagedExecutable);
    assertExecutableSize(stagedExecutable);
    const expectedChecksum = this.checksumFor(manifest, executable.target);
    if (expectedChecksum) {
      assertChecksum(stagedExecutable, expectedChecksum);
      this.emit('marketplace.install.checksum-verified', {
        packageId: manifest.id,
        target: executable.target,
        checksum: expectedChecksum,
      });
    }

    // Set platform permissions (chmod +x) on the staged executable.
    fs.chmodSync(stagedExecutable, 0o755);
    this.advance(journal, 'staging');

    // Health check the STAGED artifact (never the source).
    this.advance(journal, 'health-checking');
    const health = await runHealthCheck(stagedExecutable, {
      manifestId: manifest.id,
      manifestVersion: manifest.version,
      timeoutMs: this.options.healthCheckTimeoutMs,
    });
    this.emit('marketplace.install.health-check-completed', {
      packageId: manifest.id,
      version: manifest.version,
      ok: health.ok,
      error: health.error,
    });
    if (!health.ok) {
      throw new Error(`Health check failed for ${manifest.id}@${manifest.version}: ${health.error ?? 'unknown'}`);
    }

    this.advance(journal, 'registering');
    const installedVersion: InstalledPackageVersion = {
      version: manifest.version,
      target: executable.target,
      executablePath: relativeExecutable,
      checksum: expectedChecksum ?? sha256Placeholder(),
      health: 'healthy',
      installedAt: new Date().toISOString(),
    };
    const versions = [
      ...(priorRecord?.installedVersions ?? []).filter((version) => version.version !== manifest.version),
      installedVersion,
    ];
    const nextActive = request.activate === false ? priorRecord?.activeVersion : manifest.version;
    const record = createInstallationRecord({
      packageId: manifest.id,
      versions,
      activeVersion: nextActive,
      enabled: priorRecord?.enabled ?? true,
      configurationRetained: priorRecord?.configurationRetained ?? fs.existsSync(store.configurationDir(manifest.id)),
    });
    this.emit('marketplace.install.registered', {
      packageId: manifest.id,
      version: manifest.version,
      activeVersion: nextActive,
    });

    this.advance(journal, 'committing');
    store.writeInstallationRecord(manifest.id, record);
    this.emit('marketplace.install.committed', {
      packageId: manifest.id,
      version: manifest.version,
      activeVersion: nextActive,
    });

    this.advance(journal, 'completed');
    store.clearJournal(manifest.id, journal.transactionId);
    return {
      transactionId: journal.transactionId,
      packageId: manifest.id,
      version: manifest.version,
      phase: 'completed',
      activeVersion: nextActive,
      health,
    };
  }

  private rollbackFromJournal(journal: PackageInstallJournal, cause?: unknown): void {
    this.emit('marketplace.install.rollback-started', {
      packageId: journal.packageId,
      transactionId: journal.transactionId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    // Remove the staged version if present (journal path, or compute as a fallback).
    const stagedPath = journal.stagedPath ?? this.store.versionDir(journal.packageId, journal.version);
    if (fs.existsSync(stagedPath)) {
      fs.rmSync(stagedPath, { recursive: true, force: true });
    }
    // Restore the prior active version by rewriting the record.
    const record = this.store.readInstallationRecord(journal.packageId).record;
    if (record && journal.previousActiveVersion && record.activeVersion !== journal.previousActiveVersion) {
      const restored: NativePackageInstallationRecord = {
        ...record,
        activeVersion: journal.previousActiveVersion,
        updatedAt: new Date().toISOString(),
      };
      this.store.writeInstallationRecord(journal.packageId, restored);
    }
    this.store.clearJournal(journal.packageId, journal.transactionId);
    this.emit(cause ? 'marketplace.install.failed' : 'marketplace.install.rollback-completed', {
      packageId: journal.packageId,
      transactionId: journal.transactionId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }

  private advance(journal: PackageInstallJournal, phase: InstallPhase): void {
    journal.phase = phase;
    journal.updatedAt = new Date().toISOString();
    this.store.writeJournal(journal);
  }

  private readManifest(source: string): VestaraPackageManifest {
    const manifestPath = path.join(source, 'vestara-package.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Missing vestara-package.json in ${source}`);
    }
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as VestaraPackageManifest;
  }

  private checksumFor(manifest: VestaraPackageManifest, target: string): string | undefined {
    const entrypoints = manifest.entrypoints as Record<string, unknown> | undefined;
    const executable = entrypoints?.executable as { checksums?: Record<string, string> } | undefined;
    return executable?.checksums?.[target];
  }

  private emit(event: InstallEventType, payload: Record<string, unknown>): void {
    this.options.eventSink?.(event, payload);
  }
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function previousVersionOf(record: NativePackageInstallationRecord, current: string | undefined): string | undefined {
  if (!record.installedVersions.length) return undefined;
  const sorted = [...record.installedVersions].map((version) => version.version).sort((a, b) => compareSemver(b, a));
  const index = current ? sorted.indexOf(current) : 0;
  if (index < 0) return sorted[0];
  return sorted[index + 1];
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(pa.length, pb.length); index++) {
    const diff = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

function sha256Placeholder(): string {
  return '0'.repeat(64);
}
