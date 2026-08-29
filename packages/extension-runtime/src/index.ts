import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type EngineeringGraph, entityId } from '@vestara/engineering-graph';
import {
  assertPackageManifest,
  type ContributionReference,
  type ExtensionActivationContext,
  type ExtensionHealth,
  type ExtensionLifecycleState,
  type ExtensionTrustLevel,
  type GrantedExtensionPermission,
  type VestaraExtension,
  type VestaraPackageContributions,
  type VestaraPackageManifest,
  type VestaraPermissionRequest,
} from '@vestara/extension-contracts';

export const VESTARA_PACKAGE_MANIFEST = 'vestara-package.json';

export interface ExtensionEvent {
  readonly type: `marketplace.${string}`;
  readonly timestamp: string;
  readonly packageId: string;
  readonly version: string;
  readonly correlationId: string;
  readonly workspaceId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ExtensionEventSink {
  publish(event: ExtensionEvent): void | Promise<void>;
}

export interface PermissionDecision {
  readonly granted: boolean;
  readonly grantedBy: string;
  readonly reason?: string;
}

export interface ExtensionPermissionApprover {
  decide(manifest: VestaraPackageManifest, permission: VestaraPermissionRequest): Promise<PermissionDecision>;
}

export interface ExtensionLoader {
  load(packagePath: string, manifest: VestaraPackageManifest): Promise<VestaraExtension>;
}

export interface InstalledExtensionVersion {
  readonly manifest: VestaraPackageManifest;
  readonly installedAt: string;
  readonly trust: ExtensionTrustLevel;
  readonly state: ExtensionLifecycleState;
  readonly grantedPermissions: readonly GrantedExtensionPermission[];
  readonly health: ExtensionHealth;
}

export interface InstalledExtension {
  readonly packageId: string;
  readonly currentVersion: string;
  readonly versions: Readonly<Record<string, InstalledExtensionVersion>>;
  readonly enabledWorkspaces: readonly string[];
}

interface ExtensionStateFile {
  readonly schemaVersion: 1;
  readonly packages: Readonly<Record<string, InstalledExtension>>;
}

export interface InstallOptions {
  readonly workspaceId?: string;
  readonly enable?: boolean;
  readonly trust?: ExtensionTrustLevel;
}

export interface InstallResult {
  readonly installed: InstalledExtension;
  readonly activated: boolean;
  readonly correlationId: string;
}

export interface ExtensionGraphProjection {
  installed(manifest: VestaraPackageManifest, workspaceId?: string): void;
  stateChanged(manifest: VestaraPackageManifest, state: ExtensionLifecycleState, workspaceId?: string): void;
  removed(manifest: VestaraPackageManifest, workspaceId?: string): void;
}

export class EngineeringGraphExtensionProjection implements ExtensionGraphProjection {
  constructor(private readonly graph: EngineeringGraph) {}

  installed(manifest: VestaraPackageManifest, workspaceId?: string): void {
    const packageEntity = entityId('marketplace-package', manifest.id);
    const versionEntity = entityId('package-version', `${manifest.id}@${manifest.version}`);
    const publisherEntity = entityId('publisher', manifest.publisher.id);
    const installedEntity = entityId('installed-package', `${manifest.id}@${manifest.version}`);
    this.upsert(packageEntity, 'marketplace-package', manifest.name, 'installed', {
      type: manifest.type,
      description: manifest.description,
    });
    this.upsert(versionEntity, 'package-version', `${manifest.name} ${manifest.version}`, 'installed');
    this.upsert(publisherEntity, 'publisher', manifest.publisher.name);
    this.upsert(installedEntity, 'installed-package', manifest.name, 'installed');
    this.graph.addRelationship({ from: packageEntity, to: publisherEntity, type: 'published-by' });
    this.graph.addRelationship({ from: versionEntity, to: packageEntity, type: 'belongs-to' });
    this.graph.addRelationship({ from: installedEntity, to: versionEntity, type: 'belongs-to' });
    if (workspaceId) {
      const workspaceEntity = entityId('workspace', workspaceId);
      this.upsert(workspaceEntity, 'workspace', workspaceId);
      this.graph.addRelationship({ from: installedEntity, to: workspaceEntity, type: 'installed-in' });
    }
    for (const capability of manifest.capabilities) {
      const capabilityEntity = entityId('capability', capability);
      this.upsert(capabilityEntity, 'capability', capability);
      this.graph.addRelationship({ from: packageEntity, to: capabilityEntity, type: 'provides' });
    }
    for (const permission of manifest.permissions) {
      const permissionEntity = entityId('permission', `${permission.capability}:${permission.scope}`);
      this.upsert(permissionEntity, 'permission', permission.capability, undefined, { scope: permission.scope });
      this.graph.addRelationship({ from: packageEntity, to: permissionEntity, type: 'requests-permission' });
    }
    for (const dependency of manifest.dependencies) {
      const dependencyEntity = entityId('marketplace-package', dependency.packageId);
      this.upsert(dependencyEntity, 'marketplace-package', dependency.packageId);
      this.graph.addRelationship({ from: packageEntity, to: dependencyEntity, type: 'depends-on' });
    }
  }

  stateChanged(manifest: VestaraPackageManifest, state: ExtensionLifecycleState, workspaceId?: string): void {
    const installedEntity = entityId('installed-package', `${manifest.id}@${manifest.version}`);
    this.upsert(installedEntity, 'installed-package', manifest.name, state);
    if (state === 'active') {
      const extensionEntity = entityId('extension', `${manifest.id}@${manifest.version}`);
      this.upsert(extensionEntity, 'extension', manifest.name, state);
      this.graph.addRelationship({ from: extensionEntity, to: installedEntity, type: 'belongs-to' });
      if (workspaceId) {
        const workspaceEntity = entityId('workspace', workspaceId);
        this.upsert(workspaceEntity, 'workspace', workspaceId);
        this.graph.addRelationship({ from: extensionEntity, to: workspaceEntity, type: 'enabled-in' });
      }
    }
  }

  removed(manifest: VestaraPackageManifest): void {
    this.graph.removeEntity(entityId('installed-package', `${manifest.id}@${manifest.version}`));
    this.graph.removeEntity(entityId('extension', `${manifest.id}@${manifest.version}`));
    this.graph.removeEntity(entityId('package-version', `${manifest.id}@${manifest.version}`));
  }

  private upsert(
    id: string,
    kind: Parameters<typeof entityId>[0],
    label: string,
    status?: string,
    meta?: Record<string, unknown>,
  ): void {
    if (!this.graph.addEntity({ id, kind, label, status, meta })) this.graph.updateEntity(id, { label, status, meta });
  }
}

interface ActiveExtension {
  readonly extension: VestaraExtension;
  readonly disposers: (() => void)[];
  readonly packagePath: string;
}

export class ContributionRegistry {
  private readonly entries = new Map<string, { owner: string; contribution: ContributionReference }>();

  register(owner: string, kind: keyof VestaraPackageContributions, contribution: ContributionReference): () => void {
    const key = `${kind}:${contribution.id}`;
    if (this.entries.has(key)) throw new Error(`Contribution already registered: ${key}`);
    this.entries.set(key, { owner, contribution });
    return () => {
      if (this.entries.get(key)?.owner === owner) this.entries.delete(key);
    };
  }

  list(kind?: keyof VestaraPackageContributions): readonly ContributionReference[] {
    const prefix = kind ? `${kind}:` : undefined;
    return [...this.entries.entries()]
      .filter(([key]) => !prefix || key.startsWith(prefix))
      .map(([, entry]) => entry.contribution);
  }

  removeOwner(owner: string): void {
    for (const [key, entry] of this.entries) if (entry.owner === owner) this.entries.delete(key);
  }
}

export class NodeExtensionLoader implements ExtensionLoader {
  async load(packagePath: string, manifest: VestaraPackageManifest): Promise<VestaraExtension> {
    if (!manifest.entrypoints.runtime) throw new Error(`Package has no runtime entrypoint: ${manifest.id}`);
    const target = resolveInside(packagePath, manifest.entrypoints.runtime);
    const imported = (await import(pathToFileURL(target).href)) as {
      default?: VestaraExtension;
      extension?: VestaraExtension;
    };
    const extension = imported.extension ?? imported.default;
    if (!extension || typeof extension.activate !== 'function')
      throw new Error(`Runtime entrypoint did not export a VestaraExtension: ${manifest.id}`);
    if (extension.manifest.id !== manifest.id || extension.manifest.version !== manifest.version)
      throw new Error('Runtime manifest identity does not match installed manifest');
    return extension;
  }
}

export class LocalExtensionManager {
  private readonly root: string;
  private readonly packagesRoot: string;
  private readonly stagingRoot: string;
  private readonly statePath: string;
  private readonly active = new Map<string, ActiveExtension>();
  private state: ExtensionStateFile;

  constructor(
    root: string,
    private readonly permissions: ExtensionPermissionApprover,
    private readonly contributions = new ContributionRegistry(),
    private readonly loader: ExtensionLoader = new NodeExtensionLoader(),
    private readonly events?: ExtensionEventSink,
    private readonly graph?: ExtensionGraphProjection,
    private readonly vestaraVersion = '1.0.0',
  ) {
    this.root = path.resolve(root);
    this.packagesRoot = path.join(this.root, 'packages');
    this.stagingRoot = path.join(this.root, '.staging');
    this.statePath = path.join(this.root, 'extensions.json');
    fs.mkdirSync(this.packagesRoot, { recursive: true });
    fs.mkdirSync(this.stagingRoot, { recursive: true });
    this.state = this.readState();
  }

  list(): readonly InstalledExtension[] {
    return Object.values(this.state.packages);
  }

  get(packageId: string): InstalledExtension | undefined {
    return this.state.packages[packageId];
  }

  contributionRegistry(): ContributionRegistry {
    return this.contributions;
  }

  async install(sourceDirectory: string, options: InstallOptions = {}): Promise<InstallResult> {
    const source = path.resolve(sourceDirectory);
    assertSafePackageTree(source);
    const manifest = readManifest(source);
    const correlationId = identifier('install');
    await this.emit('marketplace.install-requested', manifest, correlationId, options.workspaceId, {
      source: 'local-directory',
    });
    this.assertCompatible(manifest);
    this.assertDependencies(manifest);
    this.assertNoDependencyCycle(manifest);
    const digest = digestPackageDirectory(source);
    if (digest !== manifest.integrity.digest) {
      await this.emit('marketplace.install-failed', manifest, correlationId, options.workspaceId, {
        reason: 'integrity-mismatch',
        expected: manifest.integrity.digest,
        actual: digest,
      });
      throw new Error(`Package integrity mismatch for ${manifest.id}`);
    }
    await this.emit('marketplace.package-verified', manifest, correlationId, options.workspaceId, { digest });
    const grants = await this.resolvePermissions(manifest, correlationId, options.workspaceId);
    const priorState = structuredClone(this.state);
    const activationKey = scopeKey(manifest.id, options.workspaceId);
    const wasActive = this.active.has(activationKey);
    const stage = path.join(this.stagingRoot, correlationId);
    const destination = this.versionPath(manifest.id, manifest.version);
    if (fs.existsSync(destination))
      throw new Error(`Package version is already installed: ${manifest.id}@${manifest.version}`);
    try {
      fs.cpSync(source, stage, { recursive: true, errorOnExist: true });
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.renameSync(stage, destination);
      const existing = this.state.packages[manifest.id];
      const installedVersion: InstalledExtensionVersion = {
        manifest,
        installedAt: new Date().toISOString(),
        trust: options.trust ?? 'local-development',
        state: 'installed',
        grantedPermissions: grants,
        health: { status: 'unknown', checkedAt: new Date().toISOString() },
      };
      if (wasActive) await this.disable(manifest.id, options.workspaceId, 'update');
      this.replacePackage(manifest.id, {
        packageId: manifest.id,
        currentVersion: manifest.version,
        versions: { ...(existing?.versions ?? {}), [manifest.version]: installedVersion },
        enabledWorkspaces: existing?.enabledWorkspaces ?? [],
      });
      let extension: VestaraExtension | undefined;
      if (manifest.entrypoints.runtime) {
        extension = await this.loader.load(destination, manifest);
        await extension.install?.({ packagePath: destination, workspaceId: options.workspaceId });
      }
      await this.emit('marketplace.package-installed', manifest, correlationId, options.workspaceId, {});
      this.graph?.installed(manifest, options.workspaceId);
      let activated = false;
      if (options.enable) {
        await this.enable(manifest.id, options.workspaceId, correlationId, extension);
        activated = true;
      }
      return { installed: this.requirePackage(manifest.id), activated, correlationId };
    } catch (error) {
      this.state = priorState;
      this.persist();
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
      const failedVersionPath = path.dirname(destination);
      if (fs.existsSync(failedVersionPath)) fs.rmSync(failedVersionPath, { recursive: true, force: true });
      if (wasActive) await this.enable(manifest.id, options.workspaceId).catch(() => {});
      await this.emit('marketplace.install-failed', manifest, correlationId, options.workspaceId, {
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async enable(
    packageId: string,
    workspaceId?: string,
    correlationId = identifier('enable'),
    loadedExtension?: VestaraExtension,
  ): Promise<InstalledExtension> {
    const installed = this.requirePackage(packageId);
    const version = installed.versions[installed.currentVersion];
    if (!version) throw new Error(`Current package version is missing: ${packageId}`);
    const activationKey = scopeKey(packageId, workspaceId);
    if (this.active.has(activationKey)) return installed;
    const packagePath = this.versionPath(packageId, installed.currentVersion);
    const extension = loadedExtension ?? (await this.loader.load(packagePath, version.manifest));
    const disposers: (() => void)[] = [];
    const context: ExtensionActivationContext = {
      packagePath,
      workspaceId,
      grantedPermissions: version.grantedPermissions,
      register: (kind, contribution) => {
        this.assertDeclaredContribution(version.manifest, kind, contribution);
        const dispose = this.contributions.register(activationKey, kind, contribution);
        disposers.push(dispose);
        return dispose;
      },
    };
    try {
      await extension.activate(context);
      const health = (await extension.healthCheck?.()) ?? {
        status: 'unknown' as const,
        checkedAt: new Date().toISOString(),
      };
      const enabled = workspaceId
        ? [...new Set([...installed.enabledWorkspaces, workspaceId])]
        : installed.enabledWorkspaces;
      this.updateVersion(packageId, installed.currentVersion, { state: 'active', health });
      this.replacePackage(packageId, { ...this.requirePackage(packageId), enabledWorkspaces: enabled });
      this.active.set(activationKey, { extension, disposers, packagePath });
      this.graph?.stateChanged(version.manifest, 'active', workspaceId);
      await this.emit('marketplace.package-activated', version.manifest, correlationId, workspaceId, {
        health: health.status,
      });
      return this.requirePackage(packageId);
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      this.contributions.removeOwner(activationKey);
      await extension.deactivate({ packagePath, workspaceId, reason: 'failure' }).catch(() => {});
      this.updateVersion(packageId, installed.currentVersion, {
        state: 'failed',
        health: {
          status: 'unhealthy',
          checkedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async disable(
    packageId: string,
    workspaceId?: string,
    reason: 'disable' | 'update' | 'rollback' | 'uninstall' | 'shutdown' = 'disable',
  ): Promise<InstalledExtension> {
    const installed = this.requirePackage(packageId);
    const version = installed.versions[installed.currentVersion];
    if (!version) throw new Error(`Current package version is missing: ${packageId}`);
    const key = scopeKey(packageId, workspaceId);
    const active = this.active.get(key);
    if (active) {
      await active.extension.deactivate({ packagePath: active.packagePath, workspaceId, reason });
      for (const dispose of active.disposers.reverse()) dispose();
      this.contributions.removeOwner(key);
      this.active.delete(key);
    }
    const enabled = workspaceId ? installed.enabledWorkspaces.filter((id) => id !== workspaceId) : [];
    this.updateVersion(packageId, installed.currentVersion, { state: 'disabled' });
    this.replacePackage(packageId, { ...this.requirePackage(packageId), enabledWorkspaces: enabled });
    this.graph?.stateChanged(version.manifest, 'disabled', workspaceId);
    await this.emit('marketplace.package-deactivated', version.manifest, identifier('disable'), workspaceId, {
      reason,
    });
    return this.requirePackage(packageId);
  }

  async health(packageId: string, workspaceId?: string): Promise<ExtensionHealth> {
    const installed = this.requirePackage(packageId);
    const version = installed.versions[installed.currentVersion];
    if (!version) throw new Error(`Current package version is missing: ${packageId}`);
    const result =
      (await this.active.get(scopeKey(packageId, workspaceId))?.extension.healthCheck?.()) ?? version.health;
    this.updateVersion(packageId, installed.currentVersion, { health: result });
    return result;
  }

  async rollback(packageId: string, targetVersion: string, workspaceId?: string): Promise<InstalledExtension> {
    const installed = this.requirePackage(packageId);
    if (!installed.versions[targetVersion]) throw new Error(`Rollback version is not installed: ${targetVersion}`);
    if (installed.currentVersion === targetVersion) return installed;
    const wasEnabled = workspaceId ? installed.enabledWorkspaces.includes(workspaceId) : false;
    await this.disable(packageId, workspaceId, 'rollback');
    this.replacePackage(packageId, { ...this.requirePackage(packageId), currentVersion: targetVersion });
    if (wasEnabled) await this.enable(packageId, workspaceId, identifier('rollback'));
    const target = this.requirePackage(packageId);
    await this.emit(
      'marketplace.rollback-completed',
      target.versions[targetVersion]!.manifest,
      identifier('rollback'),
      workspaceId,
      { fromVersion: installed.currentVersion },
    );
    return target;
  }

  async uninstall(packageId: string, workspaceId?: string): Promise<void> {
    const installed = this.requirePackage(packageId);
    const keys = [...this.active.keys()].filter((key) => key === packageId || key.startsWith(`${packageId}:`));
    for (const key of keys) {
      const activeWorkspace = key === packageId ? undefined : key.slice(packageId.length + 1);
      await this.disable(packageId, activeWorkspace, 'uninstall');
    }
    if (keys.length === 0) await this.disable(packageId, workspaceId, 'uninstall');
    for (const version of Object.values(installed.versions)) {
      if (version.manifest.entrypoints.runtime) {
        const packagePath = this.versionPath(packageId, version.manifest.version);
        const extension = await this.loader.load(packagePath, version.manifest);
        await extension.uninstall?.({ packagePath, workspaceId });
      }
    }
    const next = { ...this.state.packages };
    delete next[packageId];
    this.state = { ...this.state, packages: next };
    this.persist();
    const packagePath = path.join(this.packagesRoot, packageId);
    if (fs.existsSync(packagePath)) fs.rmSync(packagePath, { recursive: true, force: true });
    const current = installed.versions[installed.currentVersion];
    if (current)
      await this.emit('marketplace.package-uninstalled', current.manifest, identifier('uninstall'), workspaceId, {});
    for (const version of Object.values(installed.versions)) this.graph?.removed(version.manifest, workspaceId);
  }

  async shutdown(): Promise<void> {
    for (const key of [...this.active.keys()]) {
      const separator = key.indexOf(':');
      const packageId = separator < 0 ? key : key.slice(0, separator);
      const workspaceId = separator < 0 ? undefined : key.slice(separator + 1);
      await this.disable(packageId, workspaceId, 'shutdown');
    }
  }

  private assertCompatible(manifest: VestaraPackageManifest): void {
    if (!satisfies(this.vestaraVersion, manifest.compatibility.vestara))
      throw new Error(`Package requires Vestara ${manifest.compatibility.vestara}, current ${this.vestaraVersion}`);
    if (manifest.compatibility.node) {
      const nodeVersion = process.versions.node.split('-')[0] ?? process.versions.node;
      if (!satisfies(nodeVersion, manifest.compatibility.node))
        throw new Error(`Package requires Node ${manifest.compatibility.node}, current ${nodeVersion}`);
    }
    if (manifest.isolation !== 'in-process')
      throw new Error(`Isolation mode is not available in the local MVP: ${manifest.isolation}`);
    if (manifest.compatibility.operatingSystems?.length) {
      const current = process.platform === 'darwin' ? 'macos' : process.platform;
      if (!manifest.compatibility.operatingSystems.includes(current))
        throw new Error(`Package does not support operating system: ${current}`);
    }
    if (manifest.compatibility.architectures?.length && !manifest.compatibility.architectures.includes(process.arch))
      throw new Error(`Package does not support architecture: ${process.arch}`);
  }

  private assertDependencies(manifest: VestaraPackageManifest): void {
    for (const dependency of manifest.dependencies) {
      const installed = this.state.packages[dependency.packageId];
      if (!installed) {
        if (!dependency.optional) throw new Error(`Missing dependency: ${dependency.packageId}`);
        continue;
      }
      if (!satisfies(installed.currentVersion, dependency.version))
        throw new Error(
          `Dependency version mismatch: ${dependency.packageId} requires ${dependency.version}, installed ${installed.currentVersion}`,
        );
    }
  }

  private assertNoDependencyCycle(candidate: VestaraPackageManifest): void {
    const manifests = new Map<string, VestaraPackageManifest>();
    for (const installed of Object.values(this.state.packages)) {
      const version = installed.versions[installed.currentVersion];
      if (version) manifests.set(installed.packageId, version.manifest);
    }
    manifests.set(candidate.id, candidate);
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (packageId: string, path: readonly string[]): void => {
      if (visiting.has(packageId)) throw new Error(`Dependency cycle: ${[...path, packageId].join(' -> ')}`);
      if (visited.has(packageId)) return;
      visiting.add(packageId);
      const manifest = manifests.get(packageId);
      for (const dependency of manifest?.dependencies ?? [])
        if (manifests.has(dependency.packageId)) visit(dependency.packageId, [...path, packageId]);
      visiting.delete(packageId);
      visited.add(packageId);
    };
    for (const packageId of manifests.keys()) visit(packageId, []);
  }

  private async resolvePermissions(
    manifest: VestaraPackageManifest,
    correlationId: string,
    workspaceId?: string,
  ): Promise<readonly GrantedExtensionPermission[]> {
    const grants: GrantedExtensionPermission[] = [];
    for (const permission of manifest.permissions) {
      await this.emit('marketplace.permission-requested', manifest, correlationId, workspaceId, {
        capability: permission.capability,
        scope: permission.scope,
      });
      const decision = await this.permissions.decide(manifest, permission);
      if (!decision.granted) throw new Error(`Permission rejected: ${permission.capability}`);
      grants.push({ ...permission, grantedAt: new Date().toISOString(), grantedBy: decision.grantedBy });
    }
    return grants;
  }

  private assertDeclaredContribution(
    manifest: VestaraPackageManifest,
    kind: keyof VestaraPackageContributions,
    contribution: ContributionReference,
  ): void {
    const declared = manifest.contributions[kind] as readonly ContributionReference[] | undefined;
    if (!declared?.some((item) => item.id === contribution.id))
      throw new Error(`Undeclared contribution: ${String(kind)}:${contribution.id}`);
  }

  private updateVersion(
    packageId: string,
    version: string,
    patch: Partial<Pick<InstalledExtensionVersion, 'state' | 'health'>>,
  ): void {
    const installed = this.requirePackage(packageId);
    const current = installed.versions[version];
    if (!current) throw new Error(`Installed version not found: ${packageId}@${version}`);
    this.replacePackage(packageId, {
      ...installed,
      versions: { ...installed.versions, [version]: { ...current, ...patch } },
    });
  }

  private replacePackage(packageId: string, installed: InstalledExtension): void {
    this.state = { ...this.state, packages: { ...this.state.packages, [packageId]: installed } };
    this.persist();
  }

  private requirePackage(packageId: string): InstalledExtension {
    const installed = this.state.packages[packageId];
    if (!installed) throw new Error(`Package is not installed: ${packageId}`);
    return installed;
  }

  private versionPath(packageId: string, version: string): string {
    if (!/^[a-z0-9._-]+$/.test(packageId) || !/^[0-9A-Za-z.+-]+$/.test(version))
      throw new Error('Unsafe package identity');
    return path.join(this.packagesRoot, packageId, version, 'package');
  }

  private readState(): ExtensionStateFile {
    if (!fs.existsSync(this.statePath)) return { schemaVersion: 1, packages: {} };
    const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf8')) as ExtensionStateFile;
    if (parsed.schemaVersion !== 1 || !parsed.packages) throw new Error('Unsupported extension state file');
    return parsed;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`);
    fs.renameSync(temporary, this.statePath);
  }

  private async emit(
    type: ExtensionEvent['type'],
    manifest: VestaraPackageManifest,
    correlationId: string,
    workspaceId: string | undefined,
    metadata: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.events?.publish({
      type,
      timestamp: new Date().toISOString(),
      packageId: manifest.id,
      version: manifest.version,
      correlationId,
      workspaceId,
      metadata: { publisherId: manifest.publisher.id, ...metadata },
    });
  }
}

export function readManifest(packageDirectory: string): VestaraPackageManifest {
  const manifestPath = resolveInside(packageDirectory, VESTARA_PACKAGE_MANIFEST);
  if (!fs.existsSync(manifestPath)) throw new Error(`Package manifest not found: ${VESTARA_PACKAGE_MANIFEST}`);
  return assertPackageManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown);
}

export function digestPackageDirectory(packageDirectory: string): string {
  const root = path.resolve(packageDirectory);
  assertSafePackageTree(root);
  const hash = createHash('sha256');
  for (const relative of packageFiles(root).filter((file) => file !== VESTARA_PACKAGE_MANIFEST)) {
    hash.update(relative);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function packageFiles(root: string, relative = ''): string[] {
  const directory = path.join(root, relative);
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return packageFiles(root, child);
      return entry.isFile() ? [child] : [];
    })
    .sort();
}

function assertSafePackageTree(root: string): void {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error('Package source must be a directory');
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Package contains a symbolic link: ${path.relative(root, target)}`);
      if (entry.isDirectory()) visit(target);
      else if (!entry.isFile())
        throw new Error(`Package contains an unsupported entry: ${path.relative(root, target)}`);
    }
  };
  visit(root);
}

function resolveInside(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${path.sep}`))
    throw new Error(`Path escapes package root: ${relative}`);
  return target;
}

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scopeKey(packageId: string, workspaceId?: string): string {
  return workspaceId ? `${packageId}:${workspaceId}` : packageId;
}

function parseVersion(version: string): readonly [number, number, number] {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(version);
  if (!match) throw new Error(`Invalid installed version: ${version}`);
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersion(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function satisfies(version: string, range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === '*' || trimmed === 'latest') return true;
  if (trimmed.startsWith('^')) {
    const base = trimmed.slice(1);
    const [major] = parseVersion(base);
    return compareVersion(version, base) >= 0 && compareVersion(version, `${major + 1}.0.0`) < 0;
  }
  const clauses = trimmed.split(/\s+/);
  if (clauses.every((clause) => /^(>=|>|<=|<)\d/.test(clause)))
    return clauses.every((clause) => {
      const operator = /^(>=|>|<=|<)/.exec(clause)?.[0] ?? '';
      const compared = compareVersion(version, clause.slice(operator.length));
      return operator === '>='
        ? compared >= 0
        : operator === '>'
          ? compared > 0
          : operator === '<='
            ? compared <= 0
            : compared < 0;
    });
  return compareVersion(version, trimmed) === 0;
}
