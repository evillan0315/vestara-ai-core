import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RepositoryIntelligence } from '../src/repository-intelligence';

function writePkg(
  root: string,
  rel: string,
  pkg: Record<string, unknown>,
  srcFiles: string[] = ['src/index.ts'],
): void {
  const dir = path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  for (const f of srcFiles) {
    const full = path.join(dir, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'export const x = 1;\n');
  }
}

function collectFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string): void => {
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      const r = rel ? `${rel}/${entry}` : entry;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else out.push(r);
    }
  };
  walk(root, '');
  return out;
}

describe('RepositoryIntelligence layer + coverage fixes', () => {
  it('classifies UI peerDeps, runtime infra, registry services; excludes fixtures; names unnamed with path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-layer-'));
    try {
      writePkg(root, 'packages/my-runtime', { name: '@vestara/my-runtime', dependencies: {} });
      writePkg(root, 'packages/my-registry', { name: '@vestara/my-registry', dependencies: {} });
      writePkg(root, 'packages/my-ui', {
        name: '@vestara/my-ui',
        dependencies: {},
        peerDependencies: { react: '^19.0.0' },
      });
      writePkg(root, 'packages/evaluation/fixtures/empty-project', { name: 'empty-project' });
      // Unnamed package: no name field
      writePkg(root, 'packages/nameless', { private: true });

      const profile = await RepositoryIntelligence.analyze(collectFiles(root), root);
      const byName = new Map((profile.layers ?? []).map((l) => [l.packageName, l]));

      expect(byName.get('@vestara/my-runtime')?.layer).toBe('infrastructure');
      expect(byName.get('@vestara/my-registry')?.layer).toBe('services');
      expect(byName.get('@vestara/my-ui')?.layer).toBe('ui');
      // Fixture excluded from package map entirely
      expect(profile.packages.some((p) => p.name === 'empty-project')).toBe(false);
      // Unnamed carries its path for Activity Room display
      expect(profile.packages.some((p) => p.name === '(unnamed:packages/nameless)')).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('excludes zero-src shims from the coverage denominator', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-coverage-'));
    try {
      writePkg(root, 'packages/real-a', { name: '@vestara/real-a' });
      writePkg(root, 'packages/real-b', { name: '@vestara/real-b' });
      // Shim: package.json only, no src/ files
      const shim = path.join(root, 'packages/shim');
      fs.mkdirSync(shim, { recursive: true });
      fs.writeFileSync(path.join(shim, 'package.json'), JSON.stringify({ name: '@vestara/shim' }));
      const testFile = path.join(root, 'packages/real-a/__tests__/a.test.ts');
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
      fs.writeFileSync(testFile, 'it("x", () => {});\n');

      const profile = await RepositoryIntelligence.analyze(collectFiles(root), root);
      // 1 of 2 coverable packages has tests → 5.0, shim must not drag it to 3.3
      expect(profile.healthScore?.categories.testCoverage).toBe(5);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers real V8 line coverage over the heuristic when a report exists', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-real-coverage-'));
    try {
      writePkg(root, 'packages/uncovered', { name: '@vestara/uncovered' });
      const coverageDir = path.join(root, 'coverage');
      fs.mkdirSync(coverageDir, { recursive: true });
      fs.writeFileSync(
        path.join(coverageDir, 'coverage-summary.json'),
        JSON.stringify({ total: { lines: { pct: 62 } } }),
      );

      const profile = await RepositoryIntelligence.analyze(collectFiles(root), root);
      // No tests exist, yet the real 62% line coverage drives the score.
      expect(profile.healthScore?.categories.testCoverage).toBe(6.2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
