/**
 * RepositoryIntelligence — entry point detection.
 *
 * Verifies the workspace analysis detects one entry point per app/package
 * and classifies each correctly: `cli` when a `bin` exists, `app` for
 * `apps/*`, and `library` for `packages/*`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RepositoryDiscovery } from '../src/repository-discovery';
import { RepositoryIntelligence } from '../src/repository-intelligence';
import type { EntryPoint } from '../src/types';

// The test runs from packages/workspace/__tests__; the repo root is three levels up.
const REPO_ROOT = path.resolve(__dirname, '../../..');

// Documented in docs/capabilities/CSP-001-open/CLI.md — `vestara open` reports
// `typescript (86 entry points, 4 risks)`. Keep in sync when the workspace
// gains or loses entry points.
const DOCUMENTED_ENTRY_POINT_COUNT = 86;
const DOCUMENTED_RISK_COUNT = 4;
const DOCUMENTED_LANGUAGE = 'typescript';

describe('RepositoryIntelligence entry point detection', () => {
  it('reports the documented entry point contract (86 entry points, typescript, 4 risks)', async () => {
    const files = await RepositoryDiscovery.walk(REPO_ROOT);
    const analysis = await RepositoryIntelligence.analyze(files, REPO_ROOT);

    expect(analysis.language).toBe(DOCUMENTED_LANGUAGE);
    expect(analysis.entryPoints).toHaveLength(DOCUMENTED_ENTRY_POINT_COUNT);
    expect(analysis.risks).toHaveLength(DOCUMENTED_RISK_COUNT);
  });

  it('detects one entry point per workspace app/package with src/index.ts', async () => {
    const files = await RepositoryDiscovery.walk(REPO_ROOT);
    const analysis = await RepositoryIntelligence.analyze(files, REPO_ROOT);

    // Mirror detectEntryPoints Strategy 3: an entry point is produced for each
    // apps/* and packages/* member whose package.json declares bin|main and that
    // has a src/index.ts (or src/main.ts) on disk.
    const expected: string[] = [];
    for (const appDir of ['apps', 'packages']) {
      const appPath = path.join(REPO_ROOT, appDir);
      let entries: string[];
      try {
        entries = fs.readdirSync(appPath);
      } catch {
        continue;
      }
      for (const entry of entries) {
        const pkgPath = path.join(appPath, entry, 'package.json');
        let pkg: { bin?: unknown; main?: unknown };
        try {
          pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        } catch {
          continue;
        }
        if (!pkg.bin && !pkg.main) continue;
        const rel = `${appDir}/${entry}/src/index.ts`;
        const relMain = `${appDir}/${entry}/src/main.ts`;
        if (files.includes(rel)) expected.push(rel);
        else if (files.includes(relMain)) expected.push(relMain);
      }
    }

    const detected = analysis.entryPoints.map((e) => e.path).sort();
    expected.sort();

    expect(detected).toEqual(expected);
    expect(detected).toHaveLength(DOCUMENTED_ENTRY_POINT_COUNT);
  });

  it('classifies package entry points as library, apps as app, bins as cli', async () => {
    const files = await RepositoryDiscovery.walk(REPO_ROOT);
    const analysis = await RepositoryIntelligence.analyze(files, REPO_ROOT);

    for (const ep of analysis.entryPoints) {
      const pkgPath = ep.path.startsWith('packages/')
        ? path.join(REPO_ROOT, ep.path.replace(/^packages\//, 'packages/').split('/src/')[0], 'package.json')
        : ep.path.startsWith('apps/')
          ? path.join(REPO_ROOT, ep.path.replace(/^apps\//, 'apps/').split('/src/')[0], 'package.json')
          : null;
      if (!pkgPath || !fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

      if (ep.path.startsWith('packages/')) {
        // A package with a bin is a cli entry point; otherwise a library.
        expect(ep.type, ep.path).toBe(pkg.bin ? 'cli' : 'library');
      } else if (ep.path.startsWith('apps/')) {
        expect(ep.type, ep.path).toBe(pkg.bin ? 'cli' : 'app');
      }
      expect(ep.confidence, ep.path).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('does not report low-confidence-entry risks for convention workspace entry points', async () => {
    const files = await RepositoryDiscovery.walk(REPO_ROOT);
    const analysis = await RepositoryIntelligence.analyze(files, REPO_ROOT);

    const lowConfidence = analysis.risks.filter((r) => r.category === 'low-confidence-entry');
    const workspaceEntryPaths = analysis.entryPoints.map((e) => e.path);
    const stale = lowConfidence.filter((r) => workspaceEntryPaths.includes(r.location));
    expect(stale).toEqual([]);
  });

  it('reports every detected entry point on disk with high confidence', async () => {
    const files = await RepositoryDiscovery.walk(REPO_ROOT);
    const analysis = await RepositoryIntelligence.analyze(files, REPO_ROOT);

    for (const ep of analysis.entryPoints) {
      expect(fs.existsSync(path.join(REPO_ROOT, ep.path)), ep.path).toBe(true);
      expect(ep.confidence, ep.path).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('classifies the apps entry points (api app, cli bin, onboarding app)', async () => {
    const files = await RepositoryDiscovery.walk(REPO_ROOT);
    const analysis = await RepositoryIntelligence.analyze(files, REPO_ROOT);

    const byPath = new Map(analysis.entryPoints.map((e) => [e.path, e]));
    expect(byPath.get('apps/api/src/index.ts')?.type).toBe('app');
    expect(byPath.get('apps/cli/src/index.ts')?.type).toBe('cli');
    expect(byPath.get('apps/onboarding-lab/src/index.ts')?.type).toBe('app');
  });
});

// Guard the EntryPoint shape used by consumers.
describe('EntryPoint contract', () => {
  it('has a path, type, source, and confidence', () => {
    const ep: EntryPoint = { path: 'src/index.ts', type: 'library', source: 'convention', confidence: 0.8 };
    expect(ep.path).toBe('src/index.ts');
    expect(ep.type).toBe('library');
    expect(ep.source).toBe('convention');
    expect(ep.confidence).toBe(0.8);
  });
});
