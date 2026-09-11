#!/usr/bin/env node
/**
 * VES-LEAN-003B: Affected Package Calculator
 *
 * Determines which packages are affected by a set of changed files.
 * Uses package.json dependency declarations to compute the transitive
 * closure of affected packages (both dependencies and dependents).
 *
 * Usage:
 *   node scripts/affected.mjs [--base <ref>] [--dogfood] [--full] [--explain]
 *
 * Options:
 *   --base <ref>    Git ref to compare against (default: main or HEAD~1)
 *   --dogfood       Show dogfood build closure
 *   --full          Show full repository build closure
 *   --explain       Show reason for each affected package
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const CWD = process.cwd();

// ─── Git Helpers ────────────────────────────────────────────

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: CWD, encoding: 'utf8' }).trim();
}

function getChangedFiles(base) {
  try {
    // Try comparing against the base ref
    const output = git(
      `diff --name-only ${base}...HEAD 2>/dev/null || git diff --name-only ${base} HEAD 2>/dev/null || git diff --name-only HEAD~1 HEAD 2>/dev/null || echo ""`,
    );
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function findBaseRef() {
  // Try common base refs
  const candidates = ['main', 'origin/main', 'master', 'origin/master', 'HEAD~1'];
  for (const ref of candidates) {
    try {
      git(`rev-parse --verify ${ref} 2>/dev/null`);
      return ref;
    } catch {}
  }
  return 'HEAD~1';
}

// ─── Package Graph ──────────────────────────────────────────

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
      const internalDeps = Object.keys(allDeps).filter((d) => d.startsWith('@vestara/'));

      packages[pkg.name] = {
        name: pkg.name,
        path: path.join(dir, entry),
        deps: internalDeps,
      };
    }
  }

  return packages;
}

// Build reverse dependency map (who depends on me)
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

// ─── Affected Calculation ───────────────────────────────────

function findOwningPackage(filePath, packages) {
  // Find which package owns this file
  for (const [name, pkg] of Object.entries(packages)) {
    const _pkgDir = path.join(CWD, pkg.path);
    if (filePath.startsWith(`${pkg.path}/`) || filePath.startsWith(`${pkg.path}\\`)) {
      return name;
    }
  }
  return null;
}

function computeAffected(changedFiles, packages, reverseDeps) {
  const affected = new Map(); // packageName -> reason

  // Phase 1: Direct changes
  for (const file of changedFiles) {
    const owner = findOwningPackage(file, packages);
    if (owner) {
      affected.set(owner, 'CHANGED');
    }
  }

  // Phase 2: Config/global changes widen scope
  const globalFiles = [
    'tsconfig.json',
    'tsconfig.references.json',
    'vitest.config.ts',
    'biome.json',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'package.json', // root package.json
  ];
  const hasGlobalChange = changedFiles.some((f) => globalFiles.some((g) => f === g || f.endsWith(`/${g}`)));

  if (hasGlobalChange) {
    // Global change: all packages are affected
    for (const name of Object.keys(packages)) {
      if (!affected.has(name)) {
        affected.set(name, 'GLOBAL INVALIDATION');
      }
    }
  }

  // Phase 3: Transitive dependents (who depends on changed packages)
  const queue = [...affected.keys()];
  while (queue.length > 0) {
    const pkg = queue.pop();
    const dependents = reverseDeps[pkg] || [];
    for (const dep of dependents) {
      if (!affected.has(dep)) {
        affected.set(dep, `DEPENDENT of ${pkg}`);
        queue.push(dep);
      }
    }
  }

  return affected;
}

// ─── Dogfood Closure ────────────────────────────────────────

function computeDogfoodClosure(packages) {
  const dogfoodRoots = [
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
  const queue = [...dogfoodRoots];

  while (queue.length > 0) {
    const pkg = queue.pop();
    if (closure.has(pkg)) continue;
    closure.add(pkg);
    const info = packages[pkg];
    if (info) {
      for (const dep of info.deps) {
        if (!closure.has(dep)) queue.push(dep);
      }
    }
  }

  return closure;
}

// ─── Main ───────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const showDogfood = args.includes('--dogfood');
  const showFull = args.includes('--full');
  const explain = args.includes('--explain');
  const baseIdx = args.indexOf('--base');
  const base = baseIdx >= 0 ? args[baseIdx + 1] : findBaseRef();

  const packages = loadPackageGraph();
  const reverseDeps = buildReverseDeps(packages);
  const total = Object.keys(packages).length;

  console.log(`[affected] Total workspace packages: ${total}`);
  console.log(`[affected] Base ref: ${base}`);

  if (showDogfood) {
    const closure = computeDogfoodClosure(packages);
    const excluded = Object.keys(packages).filter((p) => !closure.has(p));
    console.log(`\n[dogfood] Build closure: ${closure.size} packages`);
    console.log(`[dogfood] Excluded: ${excluded.length} packages`);
    for (const pkg of [...closure].sort()) {
      console.log(`  IN  ${pkg}`);
    }
    for (const pkg of excluded.sort()) {
      console.log(`  OUT ${pkg}`);
    }
    return;
  }

  if (showFull) {
    console.log(`\n[full] All ${total} packages in build graph`);
    return;
  }

  // Compute affected from changed files
  const changedFiles = getChangedFiles(base);
  console.log(`[affected] Changed files: ${changedFiles.length}`);

  if (changedFiles.length === 0) {
    console.log('[affected] No changes detected. Nothing to build.');
    return;
  }

  const affected = computeAffected(changedFiles, packages, reverseDeps);
  const dogfoodClosure = computeDogfoodClosure(packages);

  // Separate dogfood-relevant from excluded
  const dogfoodAffected = new Map();
  const nonDogfoodAffected = new Map();
  for (const [pkg, reason] of affected) {
    if (dogfoodClosure.has(pkg)) {
      dogfoodAffected.set(pkg, reason);
    } else {
      nonDogfoodAffected.set(pkg, reason);
    }
  }

  console.log(`\n[affected] Total affected: ${affected.size}`);
  console.log(`[affected] Dogfood-relevant affected: ${dogfoodAffected.size}`);
  console.log(`[affected] Non-dogfood affected: ${nonDogfoodAffected.size}`);

  if (explain) {
    console.log('\n--- Dogfood-Relevant Affected ---');
    for (const [pkg, reason] of [...dogfoodAffected].sort()) {
      console.log(`  ${pkg}  (${reason})`);
    }
    if (nonDogfoodAffected.size > 0) {
      console.log('\n--- Non-Dogfood Affected ---');
      for (const [pkg, reason] of [...nonDogfoodAffected].sort()) {
        console.log(`  ${pkg}  (${reason})`);
      }
    }
  }

  // Summary
  console.log(`\n[summary]`);
  console.log(
    `  Changed projects:      ${new Set(changedFiles.map((f) => findOwningPackage(f, packages)).filter(Boolean)).size}`,
  );
  console.log(`  Affected projects:     ${affected.size}`);
  console.log(`  Dogfood affected:      ${dogfoodAffected.size}`);
  console.log(`  Unaffected:            ${total - affected.size}`);
}

main();
