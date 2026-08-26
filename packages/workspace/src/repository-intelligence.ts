/**
 * RepositoryIntelligence — Stage 3 of the open pipeline.
 *
 * "Small but correct" deterministic analysis. No stubs, no placeholder data.
 * Phase 1 ships three real risk rules and real entry point detection.
 * Users forgive incomplete; they don't forgive inaccurate.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 *   Specification: Knowledge + Conversation + Reasoning
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DependencyEdge,
  DependencyGraph,
  DetectedRisk,
  EntryPoint,
  HealthScore,
  Layer,
  LayerAssignment,
  PackageNode,
  RepositoryProfile,
} from './types';

// Reuse the language mapping from @vestara/knowledge
const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  tsx: 'tsx',
  jsx: 'jsx',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  rb: 'ruby',
  php: 'php',
  cs: 'csharp',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  vue: 'vue',
  svelte: 'svelte',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
  md: 'markdown',
  toml: 'toml',
};

function detectPrimaryLanguage(_files: string[], byExtension: Record<string, number>): string {
  // Score by extension count, weighting source-code extensions higher
  const sourceWeight: Record<string, number> = {
    ts: 3,
    js: 3,
    tsx: 3,
    jsx: 3,
    py: 3,
    rs: 3,
    go: 3,
    java: 2,
    rb: 2,
    php: 2,
    cs: 2,
    swift: 2,
    kt: 2,
  };

  let bestLang = 'unknown';
  let bestScore = 0;

  for (const [ext, count] of Object.entries(byExtension)) {
    const lang = EXTENSION_LANGUAGE[ext];
    if (!lang) continue;
    const weight = sourceWeight[ext] ?? 1;
    const score = count * weight;
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  return bestLang;
}

function detectEntryPoints(rootDir: string, files: string[]): EntryPoint[] {
  const entryPoints: EntryPoint[] = [];
  const _fileSet = new Set(files);

  // Strategy 1: package.json bin/main/module/exports fields
  const pkgJsonPath = path.join(rootDir, 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        entryPoints.push({ path: pkg.bin, type: 'cli', source: 'package.json', confidence: 0 });
      } else {
        for (const [, binPath] of Object.entries(pkg.bin)) {
          entryPoints.push({ path: binPath as string, type: 'cli', source: 'package.json', confidence: 0 });
        }
      }
    }
    if (pkg.main) {
      entryPoints.push({ path: pkg.main, type: 'library', source: 'package.json', confidence: 0 });
    }
    if (pkg.module) {
      entryPoints.push({ path: pkg.module, type: 'library', source: 'package.json', confidence: 0 });
    }
    if (pkg.exports) {
      if (typeof pkg.exports === 'string') {
        entryPoints.push({ path: pkg.exports, type: 'library', source: 'package.json', confidence: 0 });
      } else if (typeof pkg.exports === 'object') {
        for (const [key, val] of Object.entries(pkg.exports)) {
          if (key === '.' || key === './') {
            const expPath = typeof val === 'string' ? val : ((val as any).default ?? (val as any).import);
            if (expPath && typeof expPath === 'string') {
              entryPoints.push({ path: expPath, type: 'library', source: 'package.json', confidence: 0 });
            }
          }
        }
      }
    }
  } catch {
    // no package.json or invalid JSON
  }

  // Strategy 2: Common convention filenames at root or in src/
  const conventions = [
    'src/main.ts',
    'src/index.ts',
    'main.ts',
    'index.ts',
    'app.ts',
    'server.ts',
    'cli.ts',
    'src/app.ts',
    'src/server.ts',
    'src/cli.ts',
    'main.py',
    'app.py',
    'main.rs',
    'main.go',
    'cmd/main.go',
    'lib/main.dart',
  ];

  const conventionLookup = new Set(files.map((f) => f.replace(/\\/g, '/')));
  for (const conv of conventions) {
    if (conventionLookup.has(conv)) {
      const type = conv.includes('cli')
        ? 'cli'
        : conv.includes('app') || conv.includes('server')
          ? 'app'
          : conv.includes('main') || conv.includes('index')
            ? 'app'
            : 'library';
      // Avoid duplicates
      if (!entryPoints.some((e) => e.path === conv)) {
        entryPoints.push({ path: conv, type, source: 'convention', confidence: 0 });
      }
    }
  }

  // Strategy 3: Workspace apps (apps/*/src/index.ts, packages/*/src/index.ts with bin)
  for (const appDir of ['apps', 'packages']) {
    const appPath = path.join(rootDir, appDir);
    try {
      const entries = fs.readdirSync(appPath);
      for (const entry of entries) {
        const candidatePkg = path.join(appPath, entry, 'package.json');
        const _candidateIndex = path.join(appPath, entry, 'src', 'index.ts');
        const _candidateMain = path.join(appPath, entry, 'src', 'main.ts');
        try {
          const pkg = JSON.parse(fs.readFileSync(candidatePkg, 'utf-8'));
          if (pkg.bin || pkg.main) {
            const rel = `${appDir}/${entry}/src/index.ts`;
            const relMain = `${appDir}/${entry}/src/main.ts`;
            const type: EntryPoint['type'] = pkg.bin ? 'cli' : appDir === 'apps' ? 'app' : 'library';
            if (files.includes(rel) && !entryPoints.some((e) => e.path === rel)) {
              entryPoints.push({ path: rel, type, source: 'convention', confidence: 0 });
            } else if (files.includes(relMain) && !entryPoints.some((e) => e.path === relMain)) {
              entryPoints.push({ path: relMain, type, source: 'convention', confidence: 0 });
            }
          }
        } catch {
          // skip entries without valid package.json
        }
      }
    } catch {
      // apps/ or packages/ doesn't exist
    }
  }

  return entryPoints;
}

function detectRisks(rootDir: string, files: string[]): DetectedRisk[] {
  const risks: DetectedRisk[] = [];

  // Risk 1: Large files (>2000 lines)
  for (const file of files.slice(0, 500)) {
    // limit to 500 files for performance
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    if (!['ts', 'js', 'tsx', 'jsx', 'py', 'rs', 'go', 'java', 'rb', 'php', 'cs', 'swift'].includes(ext)) {
      continue;
    }
    try {
      const content = fs.readFileSync(path.join(rootDir, file), 'utf-8');
      const lines = content.split('\n').length;
      if (lines > 2000) {
        risks.push({
          category: 'large-file',
          severity: lines > 5000 ? 'high' : 'medium',
          location: file,
          detail: `${lines} lines (threshold: 2000)`,
        });
      }
    } catch {
      // skip unreadable files
    }
  }

  // Risk 2: TODO/FIXME hotspots
  const todoFiles: Array<{ file: string; count: number }> = [];
  for (const file of files.slice(0, 500)) {
    try {
      const content = fs.readFileSync(path.join(rootDir, file), 'utf-8');
      const matches = content.match(/\b(TODO|FIXME|HACK|XXX|WORKAROUND)\b/g);
      if (matches && matches.length > 5) {
        todoFiles.push({ file, count: matches.length });
      }
    } catch {
      // skip unreadable
    }
  }
  // Report top 5 TODO hotspots
  todoFiles.sort((a, b) => b.count - a.count);
  for (const tf of todoFiles.slice(0, 5)) {
    risks.push({
      category: 'todo-hotspot',
      severity: tf.count > 20 ? 'high' : 'medium',
      location: tf.file,
      detail: `${tf.count} TODO/FIXME/HACK markers`,
    });
  }

  // Risk 3: Missing tests — packages without __tests__/ or *.test.ts
  const pkgDirs = new Set<string>();
  for (const file of files) {
    if (file.endsWith('package.json') && !file.includes('node_modules')) {
      pkgDirs.add(path.dirname(file));
    }
  }
  for (const pkgDir of pkgDirs) {
    const hasTestDir = files.some((f) => f.startsWith(`${pkgDir}/__tests__`) || f.startsWith(`${pkgDir}/test`));
    const hasTestFiles = files.some(
      (f) => f.startsWith(pkgDir) && (f.endsWith('.test.ts') || f.endsWith('.test.js') || f.endsWith('.spec.ts')),
    );
    if (!hasTestDir && !hasTestFiles) {
      const pkgName = pkgDir === '.' ? 'root' : pkgDir;
      try {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, pkgDir, 'package.json'), 'utf-8'));
        if (!pkgJson.scripts?.test || pkgJson.scripts.test === 'echo') {
          risks.push({
            category: 'missing-tests',
            severity: 'low',
            location: pkgName,
            detail: 'No test directory, test files, or test script found',
          });
        }
      } catch {
        // no package.json in this dir — skip
      }
    }
  }

  return risks;
}

function buildPackageMap(rootDir: string, files: string[]): PackageNode[] {
  const packages: PackageNode[] = [];

  for (const file of files) {
    if (file.endsWith('package.json') && !file.includes('node_modules')) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, file), 'utf-8'));
        packages.push({
          name: pkg.name ?? '(unnamed)',
          path: path.dirname(file),
          dependencies: Object.keys(pkg.dependencies ?? {}),
          devDependencies: Object.keys(pkg.devDependencies ?? {}),
          isPrivate: pkg.private ?? false,
        });
      } catch {
        // skip invalid package.json
      }
    }
  }

  return packages;
}

function detectPackageManager(files: string[]): string | undefined {
  const fileSet = new Set(files.map((f) => f.toLowerCase()));
  if (fileSet.has('pnpm-workspace.yaml') || fileSet.has('pnpm-lock.yaml')) return 'pnpm';
  if (fileSet.has('yarn.lock')) return 'yarn';
  if (fileSet.has('package-lock.json')) return 'npm';
  if (fileSet.has('bun.lockb')) return 'bun';
  return undefined;
}

function detectTestFramework(files: string[]): string | undefined {
  const fileSet = new Set(files.map((f) => f.toLowerCase()));
  if (fileSet.has('vitest.config.ts') || fileSet.has('vitest.config.js')) return 'vitest';
  if (fileSet.has('jest.config.ts') || fileSet.has('jest.config.js')) return 'jest';
  if (fileSet.has('mocha.opts') || files.some((f) => f.includes('mocha'))) return 'mocha';
  if (fileSet.has('playwright.config.ts') || fileSet.has('playwright.config.js')) return 'playwright';
  return undefined;
}

function buildDependencyGraph(packages: PackageNode[]): DependencyGraph {
  const nodes: string[] = [];
  const edges: DependencyEdge[] = [];
  const nodeSet = new Set<string>();

  for (const pkg of packages) {
    if (!nodeSet.has(pkg.name)) {
      nodes.push(pkg.name);
      nodeSet.add(pkg.name);
    }
    for (const dep of pkg.dependencies) {
      edges.push({ source: pkg.name, target: dep, type: 'dependency' });
      if (!nodeSet.has(dep)) {
        nodes.push(dep);
        nodeSet.add(dep);
      }
    }
    for (const dep of pkg.devDependencies) {
      edges.push({ source: pkg.name, target: dep, type: 'devDependency' });
      if (!nodeSet.has(dep)) {
        nodes.push(dep);
        nodeSet.add(dep);
      }
    }
  }

  const cycles = detectCircularDependencies(nodes, edges);

  return { nodes, edges, cycles };
}

function detectCircularDependencies(nodes: string[], edges: DependencyEdge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const node of nodes) adj.set(node, []);
  for (const edge of edges) {
    if (adj.has(edge.source) && adj.has(edge.target)) {
      adj.get(edge.source)!.push(edge.target);
    }
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const parent = new Map<string, string | null>();

  function dfs(node: string) {
    visited.add(node);
    inStack.add(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        parent.set(neighbor, node);
        dfs(neighbor);
      } else if (inStack.has(neighbor)) {
        // Reconstruct cycle
        const cycle: string[] = [neighbor, node];
        let cur = node;
        while (cur !== neighbor) {
          cur = parent.get(cur) ?? '';
          if (!cur || cur === neighbor) break;
          cycle.push(cur);
        }
        cycle.reverse();
        cycles.push(cycle);
      }
    }
    inStack.delete(node);
  }

  for (const node of nodes) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

function assignLayers(packages: PackageNode[], files: string[]): LayerAssignment[] {
  const _fileSet = new Set(files.map((f) => f.toLowerCase()));
  const result: LayerAssignment[] = [];

  for (const pkg of packages) {
    let layer: Layer = 'unknown';
    let confidence = 0.5;

    const name = pkg.name.toLowerCase();
    const pkgPath = pkg.path.toLowerCase();

    // Heuristic: zero dependency contracts
    if (
      pkg.dependencies.length === 0 &&
      (name.includes('shared') || name.includes('types') || name.includes('contracts') || name.includes('interfaces'))
    ) {
      layer = 'contracts';
      confidence = 0.9;
    }
    // Heuristic: named tools/*
    else if (pkgPath.includes('tools/')) {
      layer = 'tools';
      confidence = 0.95;
    }
    // Heuristic: has bin or main (app entry)
    else if (pkgPath.startsWith('apps/') && !pkgPath.includes('workspace-ui')) {
      layer = 'app';
      confidence = 0.9;
    }
    // Heuristic: depends on react/vue (UI)
    else if (
      pkg.dependencies.some((d) => d === 'react' || d === 'vue' || d === 'svelte') ||
      pkgPath.includes('workspace-ui')
    ) {
      layer = 'ui';
      confidence = 0.9;
    }
    // Heuristic: infrastructure (provides plumbing, depends on contracts)
    else if (
      pkg.dependencies.some((d) => d.includes('shared') || d.includes('logger')) &&
      !pkg.dependencies.some((d) => d.includes('workspace') || d.includes('service'))
    ) {
      layer = 'infrastructure';
      confidence = 0.7;
    }
    // Heuristic: services (depends on infrastructure, provides business logic)
    else if (pkg.dependencies.length > 2) {
      layer = 'services';
      confidence = 0.65;
    }

    result.push({ packageName: pkg.name, layer, confidence });
  }

  return result;
}

function scoreEntryPointConfidence(ep: EntryPoint, _files: string[], rootDir: string): number {
  let score = 0;

  // Source-based score
  if (ep.source === 'package.json') score += 0.4;
  else if (ep.source === 'convention') score += 0.2;

  // File existence
  const fullPath = path.join(rootDir, ep.path);
  try {
    if (fs.statSync(fullPath).isFile()) score += 0.4;
  } catch {
    // file doesn't exist — low confidence
  }

  // Type bonus
  if (ep.type === 'app' || ep.type === 'api' || ep.type === 'library') score += 0.1;
  else if (ep.type === 'cli') score += 0.15;

  // Convention match bonus: common src/index.ts patterns
  if (ep.path.endsWith('/src/index.ts') || ep.path.endsWith('/src/main.ts')) score += 0.1;

  return Math.min(1, Math.round(score * 100) / 100);
}

export class RepositoryIntelligence {
  /**
   * Analyze the repository at the given root directory.
   * Pure deterministic analysis — no AI involved.
   */
  static async analyze(files: string[], rootDir: string): Promise<RepositoryProfile> {
    const byExtension: Record<string, number> = {};
    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase() ?? '(none)';
      byExtension[ext] = (byExtension[ext] ?? 0) + 1;
    }

    const language = detectPrimaryLanguage(files, byExtension);
    const packages = buildPackageMap(rootDir, files);
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    const isMonorepo =
      fileSet.has('pnpm-workspace.yaml') ||
      fileSet.has('lerna.json') ||
      fileSet.has('nx.json') ||
      fileSet.has('turbo.json') ||
      packages.filter((p) => p.path !== '.').length > 1;

    const totalDeps = packages.reduce((sum, p) => sum + p.dependencies.length + p.devDependencies.length, 0);
    const entryPoints = detectEntryPoints(rootDir, files).map((ep) => ({
      ...ep,
      confidence: scoreEntryPointConfidence(ep, files, rootDir),
    }));
    const risks = detectRisks(rootDir, files);

    const dependencyGraph = buildDependencyGraph(packages);
    const layers = assignLayers(packages, files);

    // Add circular dependency risks
    for (const cycle of dependencyGraph.cycles) {
      risks.push({
        category: 'circular-dependency',
        severity: 'high',
        location: cycle.join(' → '),
        detail: `Circular dependency: ${cycle.join(' → ')}`,
      });
    }

    // Add low-confidence entry point risks
    for (const ep of entryPoints) {
      if (ep.confidence < 0.5) {
        risks.push({
          category: 'low-confidence-entry',
          severity: 'low',
          location: ep.path,
          detail: `Entry point "${ep.path}" has low confidence (${ep.confidence})`,
        });
      }
    }

    // Detect framework from entry points or package.json
    let framework: string | undefined;
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
      if (deps.next) framework = 'next.js';
      else if (deps.react) framework = deps.vite ? 'react + vite' : 'react';
      else if (deps['@fastify/fastify'] || deps.fastify) framework = 'fastify';
      else if (deps.express) framework = 'express';
      else if (deps['@sveltejs/kit']) framework = 'sveltekit';
      else if (deps.vue) framework = 'vue';
      else if (deps.nest) framework = 'nestjs';
    } catch {
      // no package.json
    }

    return {
      name: path.basename(rootDir),
      language,
      framework,
      packageManager: detectPackageManager(files),
      buildTool: isMonorepo ? (fileSet.has('turbo.json') ? 'turborepo' : 'nx') : undefined,
      testFramework: detectTestFramework(files),
      isMonorepo,
      fileCount: files.length,
      totalSizeKB: 0, // filled by discovery stage
      packageCount: packages.length,
      dependencyCount: totalDeps,
      entryPoints,
      risks,
      packages,
      dependencyGraph,
      layers,
      healthScore: computeHealthScore(risks, packages, files, rootDir),
      hasDocker: fileSet.has('dockerfile') || fileSet.has('docker-compose.yml'),
      hasCI: files.some((f) => f.startsWith('.github/') || f.startsWith('.gitlab-ci.yml')),
      detectedAt: new Date().toISOString(),
    };
  }
}

/**
 * Compute a composite health score for the repository (0.0 — 10.0).
 */
function computeHealthScore(
  risks: DetectedRisk[],
  packages: PackageNode[],
  files: string[],
  rootDir: string,
): HealthScore {
  // Code quality: large file ratio and TODO density
  const largeFiles = risks.filter((r) => r.category === 'large-file').length;
  const todoFiles = risks.filter((r) => r.category === 'todo-hotspot').length;
  const codeQuality = Math.max(0, 10 - largeFiles * 2 - todoFiles * 1.5);

  // Test coverage: packages that have tests
  const packagesWithTests = packages.filter((p) => {
    const pkgDir = rootDir ? p.path : '';
    return files.some(
      (f) => f.startsWith(pkgDir) && (f.endsWith('.test.ts') || f.includes('__tests__') || f.includes('/test/')),
    );
  }).length;
  const testCoverage = packages.length > 0 ? (packagesWithTests / packages.length) * 10 : 0;

  // Dependency health
  const dependencyHealth = Math.max(0, 10 - risks.length * 0.5);

  // Documentation
  const hasReadme = files.some((f) => f.toLowerCase() === 'readme.md');
  const docFiles = files.filter((f) => f.endsWith('.md')).length;
  const docRatio = Math.min(1, docFiles / Math.max(1, files.length * 0.02));
  const documentation = (hasReadme ? 3 : 0) + docRatio * 7;

  const overall = Math.round(((codeQuality + testCoverage + dependencyHealth + documentation) / 40) * 100) / 10;

  return {
    overall: Math.max(0, Math.min(10, overall)),
    categories: {
      codeQuality: Math.round(codeQuality * 10) / 10,
      testCoverage: Math.round(testCoverage * 10) / 10,
      dependencyHealth: Math.round(dependencyHealth * 10) / 10,
      documentation: Math.round(documentation * 10) / 10,
    },
  };
}
