#!/usr/bin/env node
/**
 * publish-tui-package — stage and publish the TUI as a Marketplace asset.
 *
 * packages/tui cannot be published in place: pnpm's node_modules symlinks
 * break content digesting (assertSafePackageTree rejects symlinks), so this
 * assembles a clean stage (manifest + dist + README) and publishes it with
 * the real MarketplacePublisher — the same code path as
 * POST /api/marketplace/publish.
 *
 * Usage:
 *   node scripts/publish-tui-package.mjs              # stage + publish into .vestara/marketplace, then verify
 *   node scripts/publish-tui-package.mjs --stage-only  # print the stage dir (feed it to the Publish UI / API)
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageOnly = process.argv.includes('--stage-only');

const { MarketplacePublisher, LocalMarketplaceRegistry } = await import(
  join(root, 'packages', 'marketplace', 'dist', 'index.js')
);

const sourceDir = join(root, 'packages', 'tui');
for (const required of ['vestara-package.json', 'marketplace-extension.mjs', 'dist/index.js', 'README.md']) {
  if (!existsSync(join(sourceDir, required))) {
    console.error(`Missing required publish input: packages/tui/${required}`);
    process.exit(1);
  }
}

const stage = mkdtempSync(join(tmpdir(), 'vestara-tui-publish-'));
for (const entry of ['vestara-package.json', 'dist', 'README.md']) {
  cpSync(join(sourceDir, entry), join(stage, entry), { recursive: true });
}
// The in-process adapter ships as the runtime entrypoint (see
// packages/tui/marketplace-extension.mjs): the TUI binary itself never loads
// inside the Node API runtime, and the local MVP only installs `in-process`
// extensions whose runtime exports a VestaraExtension.
cpSync(join(sourceDir, 'marketplace-extension.mjs'), join(stage, 'extension.mjs'));
// The source manifest carries a "pending" placeholder digest; normalize it
// to valid 64-hex format so readManifest passes — publish() recomputes and
// overwrites it with the real content digest. The MVP adaptations below are
// documented here (not in the source manifest) to keep the TUI team's
// standalone-binary vision (`isolation: process`) intact for runtimes that
// support it.
const stagedManifestPath = join(stage, 'vestara-package.json');
const stagedManifest = JSON.parse(readFileSync(stagedManifestPath, 'utf8'));
stagedManifest.integrity.digest = '0'.repeat(64);
stagedManifest.isolation = 'in-process';
stagedManifest.entrypoints = { ...(stagedManifest.entrypoints ?? {}), runtime: 'extension.mjs' };
stagedManifest.contributions = {
  ...(stagedManifest.contributions ?? {}),
  tuiViews: [
    {
      id: 'vestara-terminal',
      entrypoint: 'dist/index.js',
      metadata: { label: 'Vestara Terminal', launch: 'standalone-executable' },
    },
  ],
};
writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, null, 2)}\n`);
console.log(`Staged TUI package at ${stage}`);
if (stageOnly) {
  console.log(
    'Stage-only mode: publish this directory via the Marketplace Publish UI or POST /api/marketplace/publish.',
  );
  process.exit(0);
}

const publishRoot = join(root, '.vestara', 'marketplace');
mkdirSync(publishRoot, { recursive: true });
const publisher = new MarketplacePublisher();
const result = publisher.publishIntoRoot({ source: { packagePath: stage }, root: publishRoot });
console.log(`Published ${result.publisherId}/${result.packageName}@${result.version}`);
console.log(`  target: ${result.targetPath}`);
console.log(`  digest: ${result.digest} (signed: ${result.signed})`);

const registry = new LocalMarketplaceRegistry({ id: 'verify', displayName: 'Verify', roots: [publishRoot] });
const report = await registry.scan(true);
const assets = await registry.listAssets();
const asset = assets.find((candidate) => candidate.packageName === result.packageName);
if (!asset) {
  console.error(
    `Verification failed: ${result.packageName} not indexed (malformed: ${JSON.stringify(report.malformed)})`,
  );
  process.exit(1);
}
const version = asset.versions.find((candidate) => candidate.version === result.version);
console.log(`Verified: indexed with checksumVerified=${version?.checksumVerified === true}`);
if (version?.checksumVerified !== true) process.exit(1);

// End-to-end install proof with the real extension manager on an isolated
// state root: install (compat + integrity + loader) then enable (activate +
// declared-contribution registration + health check).
const { LocalExtensionManager } = await import(join(root, 'packages', 'extension-runtime', 'dist', 'index.js'));
const extensionRoot = mkdtempSync(join(tmpdir(), 'vestara-ext-verify-'));
const manager = new LocalExtensionManager(extensionRoot, {
  decide: async () => ({ granted: true, grantedBy: 'publish-verify-harness' }),
});
const installed = await manager.install(result.targetPath);
console.log(
  `Install: ${installed.installed.packageId}@${installed.installed.currentVersion} activated=${installed.activated}`,
);
const enabled = await manager.enable(result.packageName);
const current = enabled.versions[enabled.currentVersion];
console.log(`Enable: state=${current?.state} health=${current?.health.status} (${current?.health.message})`);
const views = manager.contributionRegistry().list('tuiViews');
console.log(`Contributions: tuiViews=[${views.map((view) => view.id).join(', ')}]`);
if (current?.state !== 'active' || !views.some((view) => view.id === 'vestara-terminal')) {
  console.error('Verification failed: extension did not reach active state with its declared view.');
  process.exit(1);
}
console.log('Verified: install + enable succeed — the asset is installable.');
