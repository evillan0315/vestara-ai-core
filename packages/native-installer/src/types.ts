// Canonical committed-state types for native package installations.

export type NativeHealthState = 'healthy' | 'degraded' | 'failed';

export interface InstalledPackageVersion {
  readonly version: string;
  readonly target: string;
  readonly executablePath: string;
  readonly checksum: string;
  readonly health: NativeHealthState;
  readonly installedAt: string;
}

/** The authoritative, committed installation record. Active version changes by
 * rewriting this record atomically — never by overwriting binaries. */
export interface NativePackageInstallationRecord {
  readonly packageId: string;
  readonly installedVersions: readonly InstalledPackageVersion[];
  readonly activeVersion?: string;
  readonly enabled: boolean;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly configurationRetained: boolean;
}

export interface ReadInstallationRecordResult {
  readonly record?: NativePackageInstallationRecord;
  readonly exists: boolean;
}

export function createInstallationRecord(input: {
  packageId: string;
  versions: readonly InstalledPackageVersion[];
  activeVersion?: string;
  enabled?: boolean;
  configurationRetained?: boolean;
}): NativePackageInstallationRecord {
  const now = new Date().toISOString();
  return {
    packageId: input.packageId,
    installedVersions: input.versions,
    activeVersion: input.activeVersion,
    enabled: input.enabled ?? false,
    installedAt: now,
    updatedAt: now,
    configurationRetained: input.configurationRetained ?? false,
  };
}

export function activeVersionOf(
  record: NativePackageInstallationRecord | undefined,
): InstalledPackageVersion | undefined {
  if (!record?.activeVersion) return undefined;
  return record.installedVersions.find((version) => version.version === record.activeVersion);
}

// ─── Installer state machine ────────────────────────────────────

export type InstallPhase =
  | 'created'
  | 'resolving'
  | 'acquiring'
  | 'verifying'
  | 'staging'
  | 'health-checking'
  | 'registering'
  | 'committing'
  | 'completed'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed';

export const INSTALL_PHASE_SEQUENCE: readonly InstallPhase[] = [
  'created',
  'resolving',
  'acquiring',
  'verifying',
  'staging',
  'health-checking',
  'registering',
  'committing',
  'completed',
];

export type InstallEventType =
  | 'marketplace.install.created'
  | 'marketplace.install.artifact-resolved'
  | 'marketplace.install.artifact-acquired'
  | 'marketplace.install.checksum-verified'
  | 'marketplace.install.staged'
  | 'marketplace.install.health-check-completed'
  | 'marketplace.install.registered'
  | 'marketplace.install.committed'
  | 'marketplace.install.rollback-started'
  | 'marketplace.install.rollback-completed'
  | 'marketplace.install.failed';

export interface PackageInstallJournal {
  readonly transactionId: string;
  readonly packageId: string;
  readonly version: string;
  phase: InstallPhase;
  readonly previousActiveVersion?: string;
  stagedPath?: string;
  readonly createdAt: string;
  updatedAt: string;
}

export function createJournal(input: Omit<PackageInstallJournal, 'createdAt' | 'updatedAt'>): PackageInstallJournal {
  const now = new Date().toISOString();
  return { ...input, createdAt: now, updatedAt: now };
}

export function journalWithPhase(journal: PackageInstallJournal, phase: InstallPhase): PackageInstallJournal {
  return { ...journal, phase, updatedAt: new Date().toISOString() };
}
