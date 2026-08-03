/**
 * `vestara marketplace` — the Marketplace (Engineering Exchange) command group.
 *
 * Operates directly on the local filesystem (no API dependency):
 *   - discovers packages from `<workspace>/.vestara/marketplace/`,
 *     `<workspace>/.vestara/packages/`, `~/.config/vestara/marketplace/`, and
 *     `$VESTARA_MARKETPLACE_ROOTS`;
 *   - owns catalog, discovery, search, resolution, and update projections;
 *   - delegates install/activate/rollback/uninstall to `extension-runtime`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createInterface } from 'node:readline/promises';
import type {
  VestaraPackageManifest,
  VestaraPackageType,
  VestaraPermissionRequest,
} from '@vestara/extension-contracts';
import { type ExtensionPermissionApprover, LocalExtensionManager } from '@vestara/extension-runtime';
import {
  LocalMarketplaceRegistry,
  type MarketplaceEvent,
  type MarketplaceInstallRequest,
  MarketplacePublisher,
  type MarketplaceSearchQuery,
  MarketplaceService,
  MarketplaceVersionTracker,
  parsePackageReference,
} from '@vestara/marketplace';
import { BOLD, GOLD, GRAY, GREEN, RED, RESET } from '../output/format.js';

export async function runMarketplace(args: readonly string[]): Promise<void> {
  const subcommand = args[0] ?? '';
  const json = args.includes('--json');
  try {
    switch (subcommand) {
      case 'search':
        await runSearch(rest(args), json);
        return;
      case 'list':
        await runSearch([], json);
        return;
      case 'info':
        await runInfo(rest(args), json);
        return;
      case 'installed':
        await runInstalled(json);
        return;
      case 'updates':
        await runUpdates(json);
        return;
      case 'install':
        await runInstall(rest(args), json);
        return;
      case 'update':
        await runUpdate(rest(args), json);
        return;
      case 'uninstall':
        await runUninstall(rest(args), json);
        return;
      case 'enable':
        await runEnable(rest(args), json);
        return;
      case 'disable':
        await runDisable(rest(args), json);
        return;
      case 'configure':
        await runConfigure(rest(args), json);
        return;
      case 'status':
        await runPackageStatus(rest(args), json);
        return;
      case 'verify':
        await runVerify(rest(args), json);
        return;
      case 'rescan':
        await runRescan(json);
        return;
      case 'publish':
        await runPublish(rest(args), json);
        return;
      case 'keys':
        await runKeys(rest(args), json);
        return;
      case 'registry':
        await runRegistry(rest(args), json);
        return;
      case 'track':
        await runTrack(json);
        return;
      default:
        printUsage();
        if (subcommand) process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ error: message }, null, 2));
    else console.error(`${RED}Marketplace command failed: ${message}${RESET}`);
    process.exitCode = 1;
  }
}

// ─── Command handlers ───────────────────────────────────────────────────────

async function runSearch(args: readonly string[], json: boolean): Promise<void> {
  const query = args.find((arg) => !arg.startsWith('--')) ?? '';
  const { service } = createContext();
  const typeValue = optionValue(args, '--type') as VestaraPackageType | undefined;
  const publisherValue = optionValue(args, '--publisher');
  const tagValue = optionValue(args, '--tag');
  const searchQuery: MarketplaceSearchQuery = {
    query,
    filters: {
      types: typeValue ? [typeValue] : undefined,
      publisherIds: publisherValue ? [publisherValue] : undefined,
      tags: tagValue ? [tagValue] : undefined,
    },
    limit: Number(optionValue(args, '--limit') ?? 50),
    sort: optionValue(args, '--sort') as MarketplaceSearchQuery['sort'],
  };
  const result = await service.search(searchQuery);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${BOLD}${GOLD}Marketplace — ${result.total} result(s)${RESET}`);
  renderTable(
    ['type', 'package', 'publisher', 'latest', 'verified'],
    result.items.map((hit) => [
      hit.asset.type,
      `${hit.asset.packageName}${hit.registryId ? ` ${GRAY}(${hit.registryId})${RESET}` : ''}`,
      hit.asset.publisherId,
      hit.asset.latestVersion,
      hit.asset.verification.checksumVerified ? `${GREEN}✓${RESET}` : `${GRAY}○${RESET}`,
    ]),
  );
  if (result.registryErrors?.length) {
    console.log(`${GOLD}Registry warnings:${RESET}`);
    for (const error of result.registryErrors) console.log(`  ${GOLD}⚠${RESET} ${error}`);
  }
}

async function runInfo(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace info <package> [--json]');
  const { service } = createContext();
  const details = await service.getAsset(reference);
  if (json) {
    console.log(JSON.stringify(details, null, 2));
    return;
  }
  console.log(
    `${BOLD}${GOLD}${details.asset.displayName}${RESET} ${GRAY}${details.asset.id}@${details.asset.latestVersion}${RESET}`,
  );
  console.log(`  ${GRAY}Type:${RESET}       ${details.asset.type}`);
  console.log(
    `  ${GRAY}Publisher:${RESET}  ${details.asset.publisherId} ${GRAY}(${details.registryId} registry)${RESET}`,
  );
  console.log(`  ${GRAY}Summary:${RESET}    ${details.asset.summary}`);
  console.log(
    `  ${GRAY}Verified:${RESET}   ${details.integrityVerified ? `${GREEN}checksum ✓${RESET}` : `${RED}checksum ✗${RESET}`}${details.asset.verification.signed ? ` ${GREEN}signature declared${RESET}` : ''}`,
  );
  if (details.asset.versions.length)
    console.log(`  ${GRAY}Versions:${RESET}   ${details.asset.versions.map((v) => v.version).join(', ')}`);
  if (details.dependencies.length) {
    console.log(`  ${GRAY}Dependencies:${RESET}`);
    for (const dependency of details.dependencies)
      console.log(`    - ${dependency.packageName} ${dependency.version}${dependency.optional ? ' (optional)' : ''}`);
  }
  if (details.permissions.length) {
    console.log(`  ${GRAY}Permissions:${RESET}`);
    for (const permission of details.permissions)
      console.log(`    - ${permission.capability} ${GRAY}(${permission.scope})${RESET}`);
  }
}

async function runInstalled(json: boolean): Promise<void> {
  const { service } = createContext();
  const installed = await service.listInstalled();
  if (json) {
    console.log(JSON.stringify(installed, null, 2));
    return;
  }
  console.log(`${BOLD}${GOLD}Installed (${installed.length})${RESET}`);
  renderTable(
    ['package', 'version', 'state', 'updates'],
    installed.map((item) => [
      item.packageName,
      item.installedVersion,
      item.state,
      item.updateStatus === 'current'
        ? `${GREEN}current${RESET}`
        : item.updateStatus === 'update-available'
          ? `${GOLD}${item.latestCompatibleVersion ?? 'update'}${RESET}`
          : item.updateStatus,
    ]),
  );
}

async function runUpdates(json: boolean): Promise<void> {
  const { service } = createContext();
  const updates = await service.listUpdates();
  if (json) {
    console.log(JSON.stringify(updates, null, 2));
    return;
  }
  if (updates.length === 0) {
    console.log(`${GREEN}All installed packages are up to date.${RESET}`);
    return;
  }
  console.log(`${BOLD}${GOLD}Updates available (${updates.length})${RESET}`);
  renderTable(
    ['package', 'installed', 'target', 'type', 'compatible'],
    updates.map((update) => [
      update.packageName,
      update.installedVersion,
      update.targetVersion,
      update.updateType,
      update.compatible ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`,
    ]),
  );
}

async function runInstall(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace install <package>[@version] [--dry-run] [--yes]');
  const { name, version } = splitReference(reference);
  const { service } = createContext(flag(args, '--yes'));
  const request: MarketplaceInstallRequest = {
    reference: parsePackageReference(name),
    version,
    dryRun: flag(args, '--dry-run'),
  };
  const operation = await service.install(request);
  if (json) {
    console.log(JSON.stringify(operation, null, 2));
    return;
  }
  if (operation.dryRun) {
    console.log(`${GOLD}Dry run: would install ${name}@${operation.version}${RESET}`);
    for (const pkg of operation.resolution?.installOrder ?? [])
      console.log(`  ${GRAY}→ ${pkg.packageName}@${pkg.version} (${pkg.source})${RESET}`);
    if (operation.permissions?.length) {
      console.log(`${GOLD}Permissions:${RESET}`);
      for (const permission of operation.permissions)
        console.log(`  - ${permission.capability} ${GRAY}(${permission.scope})${RESET}`);
    }
    return;
  }
  console.log(`${GREEN}✓${RESET} Installed ${name}@${operation.version}`);
}

async function runUpdate(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace update <package> [--dry-run] [--yes]');
  const { service } = createContext(flag(args, '--yes'));
  const operation = await service.update({
    packageName: reference,
    dryRun: flag(args, '--dry-run'),
  });
  if (json) {
    console.log(JSON.stringify(operation, null, 2));
    return;
  }
  if (operation.message === 'already up to date') {
    console.log(`${GREEN}${reference} is already up to date.${RESET}`);
    return;
  }
  console.log(
    operation.dryRun
      ? `${GOLD}Dry run: would update ${reference} to ${operation.version}${RESET}`
      : `${GREEN}✓${RESET} Updated ${reference} to ${operation.version}`,
  );
}

async function runUninstall(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace uninstall <package> [--yes] [--purge]');
  if (!flag(args, '--yes') && !(await confirm(`Uninstall ${reference}?`))) {
    console.log(`${GRAY}Aborted.${RESET}`);
    return;
  }
  const { service } = createContext(true);
  const operation = await service.uninstall({ packageName: reference });
  if (json) {
    console.log(JSON.stringify(operation, null, 2));
    return;
  }
  console.log(`${GREEN}✓${RESET} Uninstalled ${reference}`);
  if (flag(args, '--purge')) {
    const packageId = normalizePackageId(reference);
    const configPath = path.join(os.homedir(), '.config', 'vestara', 'packages', `${packageId}.json`);
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log(`${GRAY}Purged configuration: ${configPath}${RESET}`);
    }
  }
}

async function runEnable(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace enable <package>');
  const packageId = normalizePackageId(reference);
  const { manager } = createContext(true);
  await manager.enable(packageId);
  if (json) {
    console.log(JSON.stringify({ packageId, enabled: true }, null, 2));
    return;
  }
  console.log(`${GREEN}✓${RESET} Enabled ${packageId}`);
}

async function runDisable(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace disable <package>');
  const packageId = normalizePackageId(reference);
  const { manager } = createContext(true);
  await manager.disable(packageId);
  if (json) {
    console.log(JSON.stringify({ packageId, enabled: false }, null, 2));
    return;
  }
  console.log(`${GREEN}✓${RESET} Disabled ${packageId}`);
}

async function runConfigure(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace configure <package> [key=value ...]');
  const packageId = normalizePackageId(reference);
  const pairs = args.filter((arg) => arg.includes('='));
  const configPath = path.join(os.homedir(), '.config', 'vestara', 'packages', `${packageId}.json`);
  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {}
  }
  for (const pair of pairs) {
    const equals = pair.indexOf('=');
    const key = pair.slice(0, equals);
    const raw = pair.slice(equals + 1);
    config[key] = coerceValue(raw);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  if (json) {
    console.log(JSON.stringify({ packageId, configPath, config }, null, 2));
    return;
  }
  console.log(`${GREEN}✓${RESET} Configured ${packageId} → ${configPath}`);
  for (const [key, value] of Object.entries(config)) console.log(`  ${GRAY}${key}${RESET} = ${value}`);
}

async function runPackageStatus(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace status <package>');
  const packageId = normalizePackageId(reference);
  const { manager } = createContext(true);
  const installed = manager.get(packageId);
  if (!installed) {
    if (json) {
      console.log(JSON.stringify({ packageId, installed: false }, null, 2));
      return;
    }
    console.log(`${GRAY}${packageId} is not installed.${RESET}`);
    return;
  }
  const version = installed.versions[installed.currentVersion];
  if (json) {
    console.log(
      JSON.stringify(
        {
          packageId,
          installed: true,
          currentVersion: installed.currentVersion,
          enabled: installed.enabledWorkspaces.length > 0,
          state: version?.state,
          health: version?.health?.status,
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log(`${BOLD}${packageId}${RESET}`);
  console.log(`  Version:  ${GOLD}${installed.currentVersion}${RESET}`);
  console.log(`  Enabled:  ${installed.enabledWorkspaces.length > 0 ? `${GREEN}yes${RESET}` : `${GRAY}no${RESET}`}`);
  console.log(`  State:    ${version?.state ?? 'unknown'}`);
  console.log(`  Health:   ${version?.health?.status ?? 'unknown'}`);
}

async function runVerify(args: readonly string[], json: boolean): Promise<void> {
  const reference = args.find((arg) => !arg.startsWith('--'));
  if (!reference) throw new Error('Usage: vestara marketplace verify <package> [--json]');
  const { service } = createContext();
  const operation = await service.verify({ reference });
  if (json) {
    console.log(JSON.stringify(operation, null, 2));
    return;
  }
  console.log(
    operation.message?.includes('verified')
      ? `${GREEN}✓${RESET} ${operation.message}`
      : `${RED}✗${RESET} ${operation.message}`,
  );
}

async function runRescan(json: boolean): Promise<void> {
  const { service } = createContext();
  const operation = await service.rescan();
  if (json) {
    console.log(JSON.stringify(operation, null, 2));
    return;
  }
  for (const scan of operation.scanResults ?? []) {
    console.log(
      `${BOLD}${GOLD}${scan.registryId}${RESET} — ${scan.assetsFound} asset(s), ${scan.packagesFound} package(s)`,
    );
    if (scan.malformed.length) console.log(`  ${RED}✗ ${scan.malformed.length} malformed package(s)${RESET}`);
    if (scan.conflicts.length) console.log(`  ${GOLD}⚠ ${scan.conflicts.length} conflict(s)${RESET}`);
    if (scan.errors.length) console.log(`  ${GOLD}⚠ ${scan.errors.length} error(s)${RESET}`);
    if (scan.skipped.length) console.log(`  ${GRAY}${scan.skipped.length} skipped entrie(s)${RESET}`);
  }
}

async function runPublish(args: readonly string[], json: boolean): Promise<void> {
  const packageDir = args.find((arg) => !arg.startsWith('--'));
  if (!packageDir) throw new Error('Usage: vestara marketplace publish <dir> [--key <pem-file>] [--json]');
  const keyFile = optionValue(args, '--key');
  const publisher = new MarketplacePublisher();
  const keyText = keyFile ? fs.readFileSync(path.resolve(keyFile), 'utf8') : undefined;
  const result = publisher.publish({
    source: { packagePath: packageDir },
    signing: keyText ? { privateKeyPem: keyText } : undefined,
  });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${GREEN}✓${RESET} Published ${result.packageName}@${result.version}`);
  console.log(`  ${GRAY}digest:${RESET} ${result.digest}`);
  console.log(`  ${GRAY}signed:${RESET} ${result.signed ? (result.signatureValid ? 'yes' : 'invalid') : 'no'}`);
}

async function runKeys(args: readonly string[], json: boolean): Promise<void> {
  const output = args.find((arg) => !arg.startsWith('--'));
  if (!output) throw new Error('Usage: vestara marketplace keys <output-dir> [--json]');
  const publisher = new MarketplacePublisher();
  const keys = publisher.generateKeys();
  fs.mkdirSync(output, { recursive: true });
  const privatePath = path.join(output, 'private.pem');
  const publicPath = path.join(output, 'public.pem');
  fs.writeFileSync(privatePath, keys.privateKeyPem);
  fs.writeFileSync(publicPath, keys.publicKeyPem);
  if (json) {
    console.log(JSON.stringify({ privatePath, publicPath }, null, 2));
    return;
  }
  console.log(`${GREEN}✓${RESET} Generated publisher keys:`);
  console.log(`  ${GRAY}private:${RESET} ${privatePath}`);
  console.log(`  ${GRAY}public:${RESET} ${publicPath}`);
}

async function runRegistry(args: readonly string[], json: boolean): Promise<void> {
  const subcommand = args[0] ?? '';
  const { service } = createContext();
  if (subcommand === 'list') {
    const statuses = await service.registryStatuses();
    if (json) {
      console.log(JSON.stringify(statuses, null, 2));
      return;
    }
    for (const status of statuses)
      console.log(`${BOLD}${status.id}${RESET} (${status.kind}) — ${status.health.status}`);
    return;
  }
  throw new Error('Usage: vestara marketplace registry list');
}

async function runTrack(json: boolean): Promise<void> {
  const workspace = process.env.VESTARA_REPO ? path.resolve(process.env.VESTARA_REPO) : process.cwd();
  const tracker = new MarketplaceVersionTracker({
    storePath: path.join(workspace, '.vestara', 'marketplace', 'versions.json'),
  });
  const { service } = createContext();
  const assets = new Map(service.catalog.list().map((entry) => [entry.asset.packageName, entry.asset]));
  const snapshot = tracker.snapshot(service.manager.list(), assets, service.context);
  if (json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(`${BOLD}Marketplace update tracker${RESET}`);
  for (const update of snapshot.pendingNotifications)
    console.log(`  ${GOLD}${update.packageName}: ${update.installedVersion} → ${update.targetVersion}${RESET}`);
  if (snapshot.pendingNotifications.length === 0) console.log(`  ${GREEN}No pending update notifications.${RESET}`);
}

// ─── Context and helpers ────────────────────────────────────────────────────

function createContext(confirmAll = false): { service: MarketplaceService; manager: LocalExtensionManager } {
  const workspace = process.env.VESTARA_REPO ? path.resolve(process.env.VESTARA_REPO) : process.cwd();
  const roots = [
    path.join(workspace, '.vestara', 'marketplace'),
    path.join(workspace, '.vestara', 'packages'),
    path.join(os.homedir(), '.config', 'vestara', 'marketplace'),
  ];
  if (process.env.VESTARA_MARKETPLACE_ROOTS)
    roots.push(...process.env.VESTARA_MARKETPLACE_ROOTS.split(path.delimiter).filter(Boolean));
  const extensionStore = path.join(workspace, '.vestara', 'extensions');
  const events: MarketplaceEvent[] = [];
  const eventSink = { publish: (event: MarketplaceEvent) => void events.push(event) };
  const manager = new LocalExtensionManager(
    extensionStore,
    new CliApprover(confirmAll),
    undefined,
    undefined,
    eventSink,
    undefined,
    '1.0.0',
  );
  const registry = new LocalMarketplaceRegistry({ id: 'local', displayName: 'Local', roots, eventSink });
  const service = new MarketplaceService({
    registries: [registry],
    manager,
    eventSink,
    vestaraVersion: '1.0.0',
    workspaceId: workspace,
  });
  return { service, manager };
}

/** Approval flow: `--yes` approves everything; otherwise prompt per permission. */
class CliApprover implements ExtensionPermissionApprover {
  constructor(private readonly confirmAll: boolean) {}
  async decide(manifest: VestaraPackageManifest, permission: VestaraPermissionRequest) {
    if (this.confirmAll) return { granted: true, grantedBy: 'cli' };
    const ok = await confirm(`Grant ${permission.capability} (${permission.scope}) to ${manifest.id}?`);
    return ok ? { granted: true, grantedBy: 'cli' } : { granted: false, grantedBy: 'cli', reason: 'denied by user' };
  }
}

async function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${GOLD}${prompt}${RESET} ${GRAY}(y/N)${RESET} `);
  rl.close();
  return answer.trim().toLowerCase() === 'y';
}

/** Split `publisher/name@1.0.0` into reference and version. */
function splitReference(reference: string): { name: string; version?: string } {
  const at = reference.lastIndexOf('@');
  if (at > 0) return { name: reference.slice(0, at), version: reference.slice(at + 1) };
  return { name: reference };
}

/** Normalize `@vestara/tui` → `vestara.tui` for Marketplace package identity. */
function normalizePackageId(reference: string): string {
  return reference.replace(/^@/, '').replace(/\//g, '.');
}

function coerceValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const number = Number(raw);
  if (raw.trim() !== '' && Number.isFinite(number)) return number;
  return raw;
}

function rest(args: readonly string[]): string[] {
  return args.slice(1);
}

function flag(args: readonly string[], name: string): boolean {
  return args.includes(name);
}

function optionValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function renderTable(headers: readonly string[], rows: readonly (readonly string[])[]): void {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => stripAnsi(row[index] ?? '').length)),
  );
  console.log(widths.map((width, index) => headers[index].padEnd(width)).join('  '));
  for (const row of rows) console.log(widths.map((width, index) => (row[index] ?? '').padEnd(width)).join('  '));
}

function stripAnsi(value: string): string {
  const escapeChar = String.fromCharCode(27);
  return value.replace(new RegExp(`${escapeChar}\\[[0-9;]*m`, 'g'), '');
}

function printUsage(): void {
  console.log(`${BOLD}${GOLD}Marketplace (Engineering Exchange)${RESET}`);
  console.log(`${GRAY}Usage: vestara marketplace <command> [options]${RESET}`);
  console.log();
  console.log(
    `  ${BOLD}search${RESET} <query>          ${GRAY}Search assets [--type T] [--publisher P] [--tag T] [--limit N]${RESET}`,
  );
  console.log(`  ${BOLD}list${RESET}                    ${GRAY}List all catalog assets [--type T]${RESET}`);
  console.log(`  ${BOLD}info${RESET} <package>          ${GRAY}Show asset details, dependencies, permissions${RESET}`);
  console.log(`  ${BOLD}installed${RESET}               ${GRAY}List installed packages with update status${RESET}`);
  console.log(`  ${BOLD}updates${RESET}                 ${GRAY}List available updates${RESET}`);
  console.log(`  ${BOLD}install${RESET} <pkg>[@ver]     ${GRAY}Install [--dry-run] [--yes]${RESET}`);
  console.log(
    `  ${BOLD}update${RESET} <package>        ${GRAY}Update to the latest compatible version [--dry-run] [--yes]${RESET}`,
  );
  console.log(`  ${BOLD}uninstall${RESET} <package>     ${GRAY}Uninstall [--yes] [--purge]${RESET}`);
  console.log(
    `  ${BOLD}enable${RESET} <package>        ${GRAY}Enable a package (register interactive interface)${RESET}`,
  );
  console.log(`  ${BOLD}disable${RESET} <package>       ${GRAY}Disable a package (restore standard CLI)${RESET}`);
  console.log(`  ${BOLD}configure${RESET} <package>     ${GRAY}Configure a package (key=value ...)${RESET}`);
  console.log(`  ${BOLD}status${RESET} <package>        ${GRAY}Show package install/enabled/health status${RESET}`);
  console.log(`  ${BOLD}verify${RESET} <package>        ${GRAY}Verify package integrity${RESET}`);
  console.log(`  ${BOLD}rescan${RESET}                  ${GRAY}Rescan local registry directories${RESET}`);
  console.log(
    `  ${BOLD}publish${RESET} <dir>           ${GRAY}Validate, digest, sign, and publish a package [--key <pem>]${RESET}`,
  );
  console.log(`  ${BOLD}keys${RESET} <dir>              ${GRAY}Generate a publisher Ed25519 key pair${RESET}`);
  console.log(`  ${BOLD}registry${RESET} list           ${GRAY}List configured registries and health${RESET}`);
  console.log(`  ${BOLD}track${RESET}                   ${GRAY}Show persisted update notifications${RESET}`);
  console.log();
  console.log(`${GRAY}Global options: --json${RESET}`);
}
