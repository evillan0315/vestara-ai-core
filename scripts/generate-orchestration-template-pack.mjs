#!/usr/bin/env node
/**
 * generate-orchestration-template-pack — build the installable Orchestration
 * Templates asset from the TypeScript source of truth.
 *
 * Reads ORCHESTRATION_TEMPLATES from the built @vestara/workflow-orchestrator
 * (rebuild it first: `npx tsc -b packages/workflow-orchestrator`), emits one
 * workflows/<id>.workflow.json per template into
 * packages/orchestration-templates/, refreshes the manifest's description +
 * workflow contributions, stamps the real content digest, and verifies with
 * the real validator, registry scan, and extension-manager install.
 *
 * The pack is metadata-only (no runtime entrypoint): install registers the
 * catalog locally without activation. Templates execute via the Orchestration
 * surface (POST /api/orchestration/projects), not the extension host.
 *
 * Usage:
 *   node scripts/generate-orchestration-template-pack.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = join(root, 'packages', 'orchestration-templates');
const workflowsDir = join(packageDir, 'workflows');

const { ORCHESTRATION_TEMPLATES } = await import(join(root, 'packages', 'workflow-orchestrator', 'dist', 'index.js'));
const { validatePackageManifest } = await import(join(root, 'packages', 'extension-contracts', 'dist', 'index.js'));
const { digestPackageDirectory } = await import(join(root, 'packages', 'extension-runtime', 'dist', 'index.js'));
const { LocalMarketplaceRegistry } = await import(join(root, 'packages', 'marketplace', 'dist', 'index.js'));
const { LocalExtensionManager } = await import(join(root, 'packages', 'extension-runtime', 'dist', 'index.js'));

// 1. Emit one workflow file per template (the TS catalog is the source of
// truth — these files are never hand-edited).
mkdirSync(workflowsDir, { recursive: true });
for (const entry of readdirSync(workflowsDir)) {
  if (entry.endsWith('.workflow.json')) rmSync(join(workflowsDir, entry));
}
for (const template of ORCHESTRATION_TEMPLATES) {
  const document = {
    schemaVersion: 1,
    id: template.id,
    name: template.name,
    description: template.description,
    goal: template.goal,
    tasks: template.tasks.map((task) => ({
      summary: task.summary,
      files: [...task.files],
      requiredCapabilities: [...task.requiredCapabilities],
    })),
  };
  writeFileSync(join(workflowsDir, `${template.id}.workflow.json`), `${JSON.stringify(document, null, 2)}\n`);
}
console.log(`Emitted ${ORCHESTRATION_TEMPLATES.length} workflow files.`);

// 2. Refresh the manifest's description + workflow contributions, keeping
// every other field as authored.
const manifestPath = join(packageDir, 'vestara-package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const taskCount = ORCHESTRATION_TEMPLATES.reduce((total, template) => total + template.tasks.length, 0);
manifest.description =
  `Installable orchestration project-creation presets: ${ORCHESTRATION_TEMPLATES.length} templates, ${taskCount} tasks ` +
  `(generated from ORCHESTRATION_TEMPLATES).`;
manifest.contributions = {
  ...(manifest.contributions ?? {}),
  workflows: ORCHESTRATION_TEMPLATES.map((template) => ({
    id: template.id,
    entrypoint: `workflows/${template.id}.workflow.json`,
    metadata: { tasks: template.tasks.length },
  })),
};
manifest.integrity.digest = '0'.repeat(64);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// 2b. Canonical formatting pass: the repo's Biome formatter collapses short
// arrays, while JSON.stringify expands them. Format first, stamp the digest
// after, so the stamped digest always matches the committed bytes.
try {
  execFileSync('npx', ['biome', 'check', '--write', packageDir], { cwd: root, stdio: 'pipe' });
} catch (error) {
  console.error(`Biome formatting failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

// 3. Validate, stamp the real digest textually (the manifest is excluded
// from its own digest, so splicing the value preserves both the canonical
// formatting and checksum validity), then re-validate the stamped manifest.
const precheck = validatePackageManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
if (!precheck.valid) {
  console.error(`Manifest invalid: ${precheck.errors.join('; ')}`);
  process.exit(1);
}
const digest = digestPackageDirectory(packageDir);
const formatted = readFileSync(manifestPath, 'utf8');
const stampedText = formatted.replace(/("digest":\s*")[0-9a-f]{64}(")/, `$1${digest}$2`);
if (stampedText === formatted) {
  console.error('Digest stamp verification failed: placeholder digest not found.');
  process.exit(1);
}
writeFileSync(manifestPath, stampedText);
const postcheck = validatePackageManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
if (!postcheck.valid || digestPackageDirectory(packageDir) !== digest) {
  console.error('Digest stamp verification failed.');
  process.exit(1);
}
console.log(`Stamped digest ${digest}`);

// 4. Prove discoverability with the real registry scanner.
const registry = new LocalMarketplaceRegistry({ id: 'verify', displayName: 'Verify', roots: [packageDir] });
const report = await registry.scan(true);
const assets = await registry.listAssets();
const asset = assets.find((candidate) => candidate.packageName === manifest.id);
const version = asset?.versions.find((candidate) => candidate.version === manifest.version);
console.log(`Indexed: ${asset ? `${asset.publisherId}/${asset.packageName}@${asset.latestVersion}` : 'MISSING'}`);
if (!asset || version?.checksumVerified !== true) {
  console.error(`Registry verification failed (malformed: ${JSON.stringify(report.malformed)})`);
  process.exit(1);
}

// 5. Prove installability with the real extension manager on an isolated
// state root. No runtime entrypoint is declared, so install registers the
// pack without activation (activated=false by design).
const manager = new LocalExtensionManager(mkdtempSync(join(tmpdir(), 'vestara-tpl-verify-')), {
  decide: async () => ({ granted: true, grantedBy: 'template-pack-verify-harness' }),
});
const installed = await manager.install(packageDir);
const state = manager.get(manifest.id);
console.log(
  `Install: ${installed.installed.packageId}@${installed.installed.currentVersion} activated=${installed.activated}`,
);
if (installed.activated || state?.currentVersion !== manifest.version) {
  console.error('Install verification failed: metadata-only pack must install without activation.');
  process.exit(1);
}
console.log('Verified: installable metadata-only template pack (activation via the Orchestration surface).');
