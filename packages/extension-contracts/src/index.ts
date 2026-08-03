export type VestaraPackageType =
  | 'provider'
  | 'module'
  | 'plugin'
  | 'agent-pack'
  | 'integration'
  | 'theme'
  | 'verification-pack'
  | 'standards-pack'
  | 'tui';

export type ExtensionIsolationMode = 'in-process' | 'worker' | 'process' | 'sandbox';

export type ExtensionTrustLevel =
  | 'vestara-built-in'
  | 'verified-publisher'
  | 'community-verified'
  | 'community'
  | 'private-organization'
  | 'local-development'
  | 'untrusted';

export type ExtensionLifecycleState =
  | 'discovered'
  | 'downloaded'
  | 'verified'
  | 'installed'
  | 'configured'
  | 'enabled'
  | 'active'
  | 'disabled'
  | 'update-available'
  | 'updating'
  | 'rollback-available'
  | 'failed'
  | 'quarantined'
  | 'uninstalling'
  | 'removed';

export type VestaraPermissionScope = 'workspace' | 'repository' | 'user' | 'system' | 'network-domain' | 'provider-api';

export interface VestaraPermissionRequest {
  readonly capability: string;
  readonly scope: VestaraPermissionScope;
  readonly resources?: readonly string[];
  readonly approval?: 'automatic' | 'policy' | 'explicit';
  readonly reason?: string;
}

export interface GrantedExtensionPermission extends VestaraPermissionRequest {
  readonly grantedAt: string;
  readonly grantedBy: string;
}

export interface VestaraPackageDependency {
  readonly packageId: string;
  readonly version: string;
  readonly optional?: boolean;
}

export interface ContributionReference {
  readonly id: string;
  readonly entrypoint?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface VestaraPackageContributions {
  readonly providers?: readonly ContributionReference[];
  readonly agents?: readonly ContributionReference[];
  readonly commands?: readonly ContributionReference[];
  readonly workflows?: readonly ContributionReference[];
  readonly verificationProfiles?: readonly ContributionReference[];
  readonly documentationRules?: readonly ContributionReference[];
  readonly graphSources?: readonly ContributionReference[];
  readonly settings?: readonly ContributionReference[];
  readonly workspaceViews?: readonly ContributionReference[];
  readonly tuiViews?: readonly ContributionReference[];
  readonly themes?: readonly ContributionReference[];
  readonly mcpServers?: readonly ContributionReference[];
}

export interface VestaraPackageManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly type: VestaraPackageType;
  readonly publisher: { readonly id: string; readonly name: string };
  readonly compatibility: {
    readonly vestara: string;
    readonly node?: string;
    readonly operatingSystems?: readonly string[];
    readonly architectures?: readonly string[];
  };
  readonly entrypoints: {
    readonly runtime?: string;
    readonly cli?: string;
    readonly workspace?: string;
    readonly setup?: string;
  };
  readonly capabilities: readonly string[];
  readonly permissions: readonly VestaraPermissionRequest[];
  readonly dependencies: readonly VestaraPackageDependency[];
  readonly contributions: VestaraPackageContributions;
  readonly isolation: ExtensionIsolationMode;
  readonly integrity: {
    readonly algorithm: 'sha256';
    readonly digest: string;
    readonly signature?: string;
  };
}

export interface ExtensionHealth {
  readonly status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  readonly checkedAt: string;
  readonly message?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ExtensionInstallContext {
  readonly packagePath: string;
  readonly workspaceId?: string;
}

export interface ExtensionActivationContext extends ExtensionInstallContext {
  readonly grantedPermissions: readonly GrantedExtensionPermission[];
  register(kind: keyof VestaraPackageContributions, contribution: ContributionReference): () => void;
}

export interface ExtensionDeactivationContext extends ExtensionInstallContext {
  readonly reason: 'disable' | 'update' | 'rollback' | 'uninstall' | 'shutdown' | 'failure';
}

export interface ExtensionUninstallContext extends ExtensionInstallContext {}

export interface VestaraExtension {
  readonly manifest: VestaraPackageManifest;
  install?(context: ExtensionInstallContext): Promise<void>;
  activate(context: ExtensionActivationContext): Promise<void>;
  deactivate(context: ExtensionDeactivationContext): Promise<void>;
  uninstall?(context: ExtensionUninstallContext): Promise<void>;
  healthCheck?(): Promise<ExtensionHealth>;
}

export interface ManifestValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly manifest?: VestaraPackageManifest;
}

const packageTypes = new Set<VestaraPackageType>([
  'provider',
  'module',
  'plugin',
  'agent-pack',
  'integration',
  'theme',
  'verification-pack',
  'standards-pack',
  'tui',
]);
const isolationModes = new Set<ExtensionIsolationMode>(['in-process', 'worker', 'process', 'sandbox']);
const permissionScopes = new Set<VestaraPermissionScope>([
  'workspace',
  'repository',
  'user',
  'system',
  'network-domain',
  'provider-api',
]);
const packageIdPattern = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const digestPattern = /^[a-f0-9]{64}$/;

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeEntrypoint(value: unknown): boolean {
  if (value === undefined) return true;
  if (!nonEmptyString(value) || value.startsWith('/') || value.includes('\\')) return false;
  return !value.split('/').includes('..');
}

export function validatePackageManifest(value: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const manifest = object(value);
  if (!manifest) return { valid: false, errors: ['Manifest must be an object'] };
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!nonEmptyString(manifest.id) || !packageIdPattern.test(manifest.id)) errors.push('id is invalid');
  if (!nonEmptyString(manifest.name)) errors.push('name is required');
  if (!nonEmptyString(manifest.description)) errors.push('description is required');
  if (!nonEmptyString(manifest.version) || !semverPattern.test(manifest.version)) errors.push('version must be semver');
  if (!packageTypes.has(manifest.type as VestaraPackageType)) errors.push('type is invalid');
  const publisher = object(manifest.publisher);
  if (!publisher || !nonEmptyString(publisher.id) || !nonEmptyString(publisher.name))
    errors.push('publisher.id and publisher.name are required');
  const compatibility = object(manifest.compatibility);
  if (!compatibility || !nonEmptyString(compatibility.vestara)) errors.push('compatibility.vestara is required');
  const entrypoints = object(manifest.entrypoints);
  if (!entrypoints) errors.push('entrypoints must be an object');
  else
    for (const key of ['runtime', 'cli', 'workspace', 'setup'])
      if (!safeEntrypoint(entrypoints[key])) errors.push(`entrypoints.${key} must be a safe relative path`);
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.every(nonEmptyString))
    errors.push('capabilities must be strings');
  if (!Array.isArray(manifest.dependencies)) errors.push('dependencies must be an array');
  else {
    const identities = new Set<string>();
    for (const dependency of manifest.dependencies) {
      const item = object(dependency);
      if (!item || !nonEmptyString(item.packageId) || !nonEmptyString(item.version)) {
        errors.push('dependency requires packageId and version');
        continue;
      }
      if (identities.has(item.packageId)) errors.push(`duplicate dependency: ${item.packageId}`);
      identities.add(item.packageId);
    }
  }
  if (!Array.isArray(manifest.permissions)) errors.push('permissions must be an array');
  else
    for (const permission of manifest.permissions) {
      const item = object(permission);
      if (!item || !nonEmptyString(item.capability) || !permissionScopes.has(item.scope as VestaraPermissionScope))
        errors.push('permission requires a capability and valid scope');
    }
  if (!object(manifest.contributions)) errors.push('contributions must be an object');
  if (!isolationModes.has(manifest.isolation as ExtensionIsolationMode)) errors.push('isolation is invalid');
  const integrity = object(manifest.integrity);
  if (integrity?.algorithm !== 'sha256' || !nonEmptyString(integrity.digest))
    errors.push('integrity must declare sha256 and a digest');
  else if (!digestPattern.test(integrity.digest)) errors.push('integrity.digest must be 64 lowercase hex characters');
  return errors.length === 0
    ? { valid: true, errors, manifest: manifest as unknown as VestaraPackageManifest }
    : { valid: false, errors };
}

export function assertPackageManifest(value: unknown): VestaraPackageManifest {
  const validation = validatePackageManifest(value);
  if (!validation.manifest) throw new Error(`Invalid Vestara package manifest: ${validation.errors.join('; ')}`);
  return validation.manifest;
}
