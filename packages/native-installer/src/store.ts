// Atomic, journaled persistence for native package installations.
//
// Layout (canonical, side-by-side immutable versions):
//   <root>/<packageId>/
//     versions/<version>/{manifest.json, checksums.json, bin/}
//     installation.json       ← committed record (atomic writes)
//     journal/<transactionId>.json
//     configuration/          ← user config, preserved across uninstall
//
// The filesystem layout is an implementation detail; installation.json is the
// authoritative registry consumed by resolvers.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  InstallPhase,
  NativePackageInstallationRecord,
  PackageInstallJournal,
  ReadInstallationRecordResult,
} from './types';

export interface NativeInstallStoreOptions {
  readonly root: string;
}

export const INSTALLATION_FILE = 'installation.json';
export const JOURNAL_DIR = 'journal';
export const CONFIG_DIR = 'configuration';
export const VERSIONS_DIR = 'versions';

/** Atomically write JSON: write to a temp sibling, fsync, then rename. */
export function atomicWriteJson(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, filePath);
}

export class NativeInstallStore {
  private readonly root: string;

  constructor(options: NativeInstallStoreOptions) {
    this.root = path.resolve(options.root);
  }

  packageDir(packageId: string): string {
    return path.join(this.root, packageId);
  }

  versionsDir(packageId: string): string {
    return path.join(this.packageDir(packageId), VERSIONS_DIR);
  }

  versionDir(packageId: string, version: string): string {
    return path.join(this.versionsDir(packageId), version);
  }

  executablePath(packageId: string, version: string, relativeExecutable: string): string {
    return path.join(this.versionDir(packageId, version), relativeExecutable);
  }

  installationPath(packageId: string): string {
    return path.join(this.packageDir(packageId), INSTALLATION_FILE);
  }

  journalPath(packageId: string, transactionId: string): string {
    return path.join(this.packageDir(packageId), JOURNAL_DIR, `${transactionId}.json`);
  }

  configurationDir(packageId: string): string {
    return path.join(this.packageDir(packageId), CONFIG_DIR);
  }

  readInstallationRecord(packageId: string): ReadInstallationRecordResult {
    const filePath = this.installationPath(packageId);
    if (!fs.existsSync(filePath)) return { exists: false };
    try {
      const record = JSON.parse(fs.readFileSync(filePath, 'utf8')) as NativePackageInstallationRecord;
      return { record, exists: true };
    } catch (error) {
      throw new Error(
        `Corrupt installation record for ${packageId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  writeInstallationRecord(packageId: string, record: NativePackageInstallationRecord): void {
    atomicWriteJson(this.installationPath(packageId), record);
  }

  writeJournal(journal: PackageInstallJournal): void {
    atomicWriteJson(this.journalPath(journal.packageId, journal.transactionId), journal);
  }

  readJournal(packageId: string, transactionId: string): PackageInstallJournal | undefined {
    const filePath = this.journalPath(packageId, transactionId);
    if (!fs.existsSync(filePath)) return undefined;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PackageInstallJournal;
    } catch {
      return undefined;
    }
  }

  listJournals(packageId: string): PackageInstallJournal[] {
    const dir = path.join(this.packageDir(packageId), JOURNAL_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as PackageInstallJournal;
        } catch {
          return undefined;
        }
      })
      .filter((journal): journal is PackageInstallJournal => journal !== undefined);
  }

  clearJournal(packageId: string, transactionId: string): void {
    const filePath = this.journalPath(packageId, transactionId);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  phaseOfIncompleteTransactions(packageId: string): PackageInstallJournal[] {
    return this.listJournals(packageId).filter((journal) => !isTerminalPhase(journal.phase));
  }
}

export function isTerminalPhase(phase: InstallPhase): boolean {
  return phase === 'completed' || phase === 'rolled-back' || phase === 'failed';
}
