export type { HealthCheckResult, NativeHealthCheckReport } from './health-check';
export { runHealthCheck } from './health-check';
export type { CanonicalIdentity } from './identity';
export {
  assertNativePackage,
  identityFromManifest,
  installationDirName,
  toNpmName,
  toPackageId,
} from './identity';
export type {
  InstallOutcome,
  InstallRequest,
  NativeInstallerOptions,
  RollbackRequest,
  UninstallRequest,
} from './installer';
export { NativePackageInstaller } from './installer';
export {
  assertChecksum,
  assertContained,
  assertExecutableSize,
  assertExpectedExecutableName,
  assertIdentityMatch,
  assertNoSymlinksInTree,
  MAX_EXECUTABLE_BYTES,
  NativeInstallSecurityError,
  sha256OfFile,
} from './security';
export { atomicWriteJson, isTerminalPhase, NativeInstallStore } from './store';
export type {
  InstallEventType,
  InstalledPackageVersion,
  InstallPhase,
  NativeHealthState,
  NativePackageInstallationRecord,
  PackageInstallJournal,
  ReadInstallationRecordResult,
} from './types';
export {
  activeVersionOf,
  createInstallationRecord,
  createJournal,
  INSTALL_PHASE_SEQUENCE,
  journalWithPhase,
} from './types';
