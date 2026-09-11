#!/usr/bin/env node
/**
 * VES-LEAN-003B: Affected Test Runner
 *
 * Runs tests only for affected packages.
 * Uses vitest's project filtering to scope test execution.
 *
 * Usage:
 *   node scripts/test-affected.mjs [--base <ref>] [--dogfood] [--dry-run]
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CWD = process.cwd();

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: CWD, encoding: 'utf8' }).trim();
}

function findBaseRef() {
  const candidates = ['main', 'origin/main', 'master', 'origin/master', 'HEAD~1'];
  for (const ref of candidates) {
    try {
      git(`rev-parse --verify ${ref} 2>/dev/null`);
      return ref;
    } catch {}
  }
  return 'HEAD~1';
}

function loadPackageGraph() {
  const packages = {};
  const dirs = ['packages', 'packages/providers', 'packages/tools', 'apps'];
  for (const dir of dirs) {
    const fullDir = path.join(CWD, dir);
    if (!fs.existsSync(fullDir)) continue;
    for (const entry of fs.readdirSync(fullDir)) {
      const pkgPath = path.join(fullDir, entry, 'package.json');
      if (!fs.existsSync(pkgPath)) continue;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (!pkg.name?.startsWith('@vestara/')) continue;
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      packages[pkg.name] = {
        name: pkg.name,
        path: path.join(dir, entry),
        deps: Object.keys(allDeps).filter((d) => d.startsWith('@vestara/')),
      };
    }
  }
  return packages;
}

function buildReverseDeps(packages) {
  const reverse = {};
  for (const [name, pkg] of Object.entries(packages)) {
    for (const dep of pkg.deps) {
      if (!reverse[dep]) reverse[dep] = [];
      reverse[dep].push(name);
    }
  }
  return reverse;
}

function findOwningPackage(filePath, packages) {
  for (const [name, pkg] of Object.entries(packages)) {
    if (filePath.startsWith(`${pkg.path}/`)) return name;
  }
  return null;
}

function computeAffected(changedFiles, packages, reverseDeps) {
  const affected = new Map();
  for (const file of changedFiles) {
    const owner = findOwningPackage(file, packages);
    if (owner) affected.set(owner, 'CHANGED');
  }

  const globalFiles = [
    'tsconfig.json',
    'vitest.config.ts',
    'biome.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'package.json',
  ];
  if (changedFiles.some((f) => globalFiles.some((g) => f === g || f.endsWith(`/${g}`)))) {
    for (const name of Object.keys(packages)) {
      if (!affected.has(name)) affected.set(name, 'GLOBAL INVALIDATION');
    }
  }

  const queue = [...affected.keys()];
  while (queue.length > 0) {
    const pkg = queue.pop();
    for (const dep of reverseDeps[pkg] || []) {
      if (!affected.has(dep)) {
        affected.set(dep, `DEPENDENT of ${pkg}`);
        queue.push(dep);
      }
    }
  }
  return affected;
}

function computeDogfoodClosure(packages) {
  const roots = [
    '@vestara/api',
    '@vestara/workspace',
    '@vestara/agent-harness',
    '@vestara/activity-room',
    '@vestara/conversation',
    '@vestara/provider-runtime',
    '@vestara/opencode-runtime',
    '@vestara/evidence',
    '@vestara/memory',
    '@vestara/interaction-app',
    '@vestara/worktree-runtime',
    '@vestara/tool-runtime',
    '@vestara/kernel',
  ];
  const closure = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const pkg = queue.pop();
    if (closure.has(pkg)) continue;
    closure.add(pkg);
    const info = packages[pkg];
    if (info) for (const dep of info.deps) if (!closure.has(dep)) queue.push(dep);
  }
  return closure;
}

function main() {
  const args = process.argv.slice(2);
  const dogfood = args.includes('--dogfood');
  const dryRun = args.includes('--dry-run');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : findBaseRef();

  const packages = loadPackageGraph();
  const reverseDeps = buildReverseDeps(packages);

  let testPackages;

  if (dogfood) {
    const closure = computeDogfoodClosure(packages);
    testPackages = closure;
    console.log(`[test] Dogfood mode: testing ${testPackages.size} packages`);
  } else {
    let changedFiles = [];
    try {
      changedFiles = git(
        `diff --name-only ${base}...HEAD 2>/dev/null || git diff --name-only ${base} HEAD 2>/dev/null || echo ""`,
      )
        .split('\n')
        .filter(Boolean);
    } catch {
      /* empty */
    }

    if (changedFiles.length === 0) {
      console.log('[test] No changes detected. Running all tests.');
      testPackages = new Set(Object.keys(packages));
    } else {
      const affected = computeAffected(changedFiles, packages, reverseDeps);
      testPackages = new Set(affected.keys());
      console.log(`[test] Affected mode: testing ${testPackages.size} packages`);
    }
  }

  // Find test files for affected packages
  const testFiles = [];
  for (const pkg of testPackages) {
    const info = packages[pkg];
    if (!info) continue;
    const testDir = path.join(CWD, info.path, '__tests__');
    if (fs.existsSync(testDir)) {
      const files = fs
        .readdirSync(testDir, { recursive: true })
        .filter((f) => typeof f === 'string' && (f.endsWith('.test.ts') || f.endsWith('.test.tsx')))
        .map((f) => path.join(info.path, '__tests__', f));
      testFiles.push(...files);
    }
  }

  console.log(`[test] Test files found: ${testFiles.length}`);

  if (dryRun) {
    for (const f of testFiles.slice(0, 20)) {
      console.log(`  ${f}`);
    }
    if (testFiles.length > 20) console.log(`  ... and ${testFiles.length - 20} more`);
    return;
  }

  if (testFiles.length === 0) {
    console.log('[test] No test files found for affected packages.');
    return;
  }

  // Run tests
  const fileArgs = testFiles.join(' ');
  const cmd = `npx vitest run ${fileArgs} --maxWorkers=2`;
  console.log(`[test] Running: ${cmd}`);
  execSync(cmd, { cwd: CWD, stdio: 'inherit' });
}

main();
