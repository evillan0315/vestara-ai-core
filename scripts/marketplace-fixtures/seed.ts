#!/usr/bin/env tsx
/**
 * Seed the local marketplace registry with approved fixture assets.
 *
 * Writes valid packages (with computed sha256 digests) under
 * `<workspace>/.vestara/marketplace/` so Discover/Categories/Installed/Updates
 * have real content to render. Fixtures are safe, self-contained test data —
 * no secrets, no network access, no executable payloads beyond a stub runtime.
 *
 *   pnpm marketplace:fixtures:seed [--root <path>]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VestaraPackageManifest } from '@vestara/extension-contracts';
import { digestPackageDirectory, VESTARA_PACKAGE_MANIFEST } from '@vestara/extension-runtime';

interface FixtureSeed {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly type: VestaraPackageManifest['type'];
  readonly capabilities: readonly string[];
  readonly permissions: readonly VestaraPackageManifest['permissions'];
  readonly contributions: VestaraPackageManifest['contributions'];
  readonly runtime?: string;
}

const FIXTURES: readonly FixtureSeed[] = [
  {
    id: 'vestara.analysis',
    name: 'Vestara Analysis Pack',
    version: '1.2.0',
    description: 'Engineering analysis helpers: complexity, coupling, and dependency reports.',
    type: 'module',
    capabilities: ['analysis:complexity', 'analysis:coupling'],
    permissions: [
      {
        capability: 'filesystem:read',
        scope: 'repository',
        approval: 'automatic',
        reason: 'Read repository source for analysis',
      },
    ],
    contributions: { providers: [{ id: 'analysis', name: 'Analysis' }] },
    runtime: 'runtime.js',
  },
  {
    id: 'vestara.git-helper',
    name: 'Vestara Git Helper',
    version: '0.4.1',
    description: 'Governed git workflow commands: staged diffs, atomic commits, and status summaries.',
    type: 'plugin',
    capabilities: ['git:status', 'git:commit', 'git:diff'],
    permissions: [
      {
        capability: 'process:execute',
        scope: 'workspace',
        approval: 'explicit',
        reason: 'Run git commands on behalf of the workspace',
      },
      {
        capability: 'filesystem:write',
        scope: 'repository',
        approval: 'policy',
        reason: 'Apply staged changes',
      },
    ],
    contributions: {
      commands: [
        { id: 'git-status', name: 'Git Status' },
        { id: 'git-commit', name: 'Git Commit' },
      ],
    },
    runtime: 'runtime.js',
  },
  {
    id: 'vestara.review-standards',
    name: 'Vestara Review Standards',
    version: '2.0.0',
    description: 'Standards-pack of review and verification profiles for engineering gate checks.',
    type: 'standards-pack',
    capabilities: ['verification:profile', 'review:standards'],
    permissions: [],
    contributions: { verificationProfiles: [{ id: 'standard', name: 'Standard' }] },
    runtime: 'runtime.js',
  },
];

function rootDir(): string {
  if (process.argv.includes('--root')) {
    const index = process.argv.indexOf('--root');
    return path.resolve(process.argv[index + 1] ?? '.vestara/marketplace');
  }
  return path.resolve(process.cwd(), '.vestara', 'marketplace');
}

function writePackage(dir: string, seed: FixtureSeed): VestaraPackageManifest {
  fs.mkdirSync(dir, { recursive: true });
  if (seed.runtime) {
    fs.writeFileSync(
      path.join(dir, seed.runtime),
      [
        `const manifest = { id: ${JSON.stringify(seed.id)}, version: ${JSON.stringify(seed.version)} };`,
        'export default {',
        '  manifest,',
        '  activate: async () => {},',
        '  deactivate: async () => {},',
        '  healthCheck: async () => ({ status: "healthy", checkedAt: new Date().toISOString() }),',
        '};',
        '',
      ].join('\n'),
    );
  }
  const base: VestaraPackageManifest = {
    schemaVersion: 1,
    id: seed.id,
    name: seed.name,
    version: seed.version,
    description: seed.description,
    type: seed.type,
    publisher: { id: 'vestara', name: 'Vestara' },
    compatibility: { vestara: '>=0.3.0' },
    entrypoints: { runtime: seed.runtime },
    capabilities: seed.capabilities,
    permissions: seed.permissions,
    dependencies: [],
    contributions: seed.contributions,
    isolation: 'in-process',
    integrity: { algorithm: 'sha256', digest: '' },
  };
  const manifest: VestaraPackageManifest = {
    ...base,
    integrity: { algorithm: 'sha256' as const, digest: digestPackageDirectory(dir) },
  };
  fs.writeFileSync(path.join(dir, VESTARA_PACKAGE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function main(): void {
  const root = rootDir();
  fs.mkdirSync(root, { recursive: true });
  const written: string[] = [];
  for (const fixture of FIXTURES) {
    const dir = path.join(root, fixture.id);
    const manifest = writePackage(dir, fixture);
    written.push(`${manifest.id}@${manifest.version} → ${dir}`);
  }
  console.log(`Seeded ${written.length} fixture(s) into ${root}`);
  for (const line of written) console.log(`  ${line}`);
}

main();
