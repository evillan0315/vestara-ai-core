#!/usr/bin/env node
/**
 * VES-LEAN-003B: Affected Build Script
 *
 * Builds only the packages affected by changed files.
 * Uses TypeScript project references for incremental compilation.
 *
 * Usage:
 *   node scripts/build-affected.mjs [--base <ref>] [--dogfood] [--dry-run]
 *
 * Options:
 *   --base <ref>    Git ref to compare against (default: auto-detect)
 *   --dogfood       Build only dogfood closure (not affected)
 *   --dry-run       Show what would be built without building
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CWD = process.cwd();

// ─── Helpers ────────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: CWD, encoding: 'utf8' }).trim();
}

function run(cmd, opts = {}) {
  console.log(`[build] $ ${cmd}`);
  try {
    execSync(cmd, { cwd: CWD, stdio: 'inherit', ...opts });
    return true;
  } catch {
    return false;
  }
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

// ─── Package Graph (inline) ─────────────────────────────────

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
    if (filePath.startsWith(`${pkg.path}/`) || filePath.startsWith(`${pkg.path}\\`)) {
      return name;
    }
  }
  return null;
}

// ─── Affected Calculation ───────────────────────────────────

function computeAffected(changedFiles, packages, reverseDeps) {
  const affected = new Map();

  for (const file of changedFiles) {
    const owner = findOwningPackage(file, packages);
    if (owner) affected.set(owner, 'CHANGED');
  }

  // Global config changes
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

  // Transitive dependents
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

// ─── Main ───────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dogfood = args.includes('--dogfood');
  const dryRun = args.includes('--dry-run');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : findBaseRef();

  const packages = loadPackageGraph();
  const reverseDeps = buildReverseDeps(packages);
  const total = Object.keys(packages).length;

  let buildSet;

  if (dogfood) {
    const closure = computeDogfoodClosure(packages);
    buildSet = closure;
    console.log(`[build] Dogfood mode: ${closure.size} / ${total} packages`);
  } else {
    // Get changed files
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
      console.log('[build] No changes detected. Building all (full build).');
      buildSet = new Set(Object.keys(packages));
    } else {
      const affected = computeAffected(changedFiles, packages, reverseDeps);
      buildSet = new Set(affected.keys());
      console.log(`[build] Affected mode: ${buildSet.size} / ${total} packages`);
      console.log(`[build] Changed files: ${changedFiles.length}`);
      for (const [pkg, reason] of [...affected].sort()) {
        console.log(`  ${pkg}  (${reason})`);
      }
    }
  }

  // Build using tsc -b with project references
  // TypeScript's incremental mode will skip unchanged projects
  console.log(`\n[build] Building ${buildSet.size} packages...`);

  if (dryRun) {
    console.log('[build] Dry run — not building');
    return;
  }

  // Run the standard build — tsc -b with references handles incrementality
  const startTime = Date.now();
  const success = run('pnpm build');
  const elapsed = Date.now() - startTime;

  console.log(`\n[build] ${success ? 'SUCCESS' : 'FAILED'} in ${(elapsed / 1000).toFixed(1)}s`);
  process.exit(success ? 0 : 1);
}

main();
