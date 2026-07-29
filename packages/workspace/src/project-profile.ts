/**
 * ProjectProfile — Enhanced project detection and context generation.
 *
 * Detects frameworks, languages, backends, package managers, build tools,
 * test frameworks, CI/CD, and generates structured project context
 * for AI consumption.
 */

import { execSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ProjectIdentity {
  name: string;
  rootPath: string;
  gitRoot: string | null;
  gitRemote: string | null;
  gitBranch: string | null;
  repositoryHash: string;
}

export interface DetectedFramework {
  name: string;
  version?: string;
  category: 'frontend' | 'backend' | 'fullstack' | 'mobile' | 'library';
  confidence: 'high' | 'medium' | 'low';
}

export interface DetectedLanguage {
  name: string;
  version?: string;
  percentage: number;
  files: number;
}

export interface DetectedPackageManager {
  name: 'pnpm' | 'npm' | 'yarn' | 'bun';
  workspaceType?: 'monorepo' | 'single';
  lockFile?: string;
}

export interface DetectedTooling {
  buildTool?: string;
  testFramework?: string;
  linter?: string;
  formatter?: string;
}

export interface DetectedInfrastructure {
  hasDocker: boolean;
  hasDockerCompose: boolean;
  hasCI: boolean;
  ciProvider?: 'github-actions' | 'gitlab-ci' | 'circle-ci' | 'jenkins' | 'other';
  hasTerraform?: boolean;
}

export interface ProjectProfile {
  identity: ProjectIdentity;
  name: string;
  frameworks: DetectedFramework[];
  primaryLanguage: DetectedLanguage;
  languages: DetectedLanguage[];
  packageManager: DetectedPackageManager | null;
  tooling: DetectedTooling;
  infrastructure: DetectedInfrastructure;
  isMonorepo: boolean;
  packageCount: number;
  fileCount: number;
  apps: string[];
  packages: string[];
}

export class ProjectProfileService {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  detect(): ProjectProfile {
    const name = path.basename(this.rootDir);
    const allFiles = this._walkAllFiles(this.rootDir);
    const pkgJson = this._readJson('package.json');

    const identity: ProjectIdentity = {
      name,
      rootPath: this.rootDir,
      gitRoot: this._findGitRoot(),
      gitRemote: this._getGitRemote(),
      gitBranch: this._getGitBranch(),
      repositoryHash: this._computeHash(),
    };

    const fileCounts = this._countByExtension(allFiles);
    const languages = this._detectLanguages(fileCounts);
    const primaryLanguage = languages[0] ?? { name: 'unknown', percentage: 100, files: allFiles.length };

    const packageManager = this._detectPackageManager(allFiles);
    const isMonorepo = this._isMonorepo(allFiles);

    const deps = pkgJson ? ({ ...pkgJson.dependencies, ...pkgJson.devDependencies } as Record<string, string>) : {};
    const frameworks = this._detectFrameworks(deps, allFiles);

    const tooling = this._detectTooling(allFiles, deps);
    const infrastructure = this._detectInfrastructure(allFiles);

    const packageCount = this._countPackages(allFiles);
    const appDirs = this._findAppDirs(allFiles);
    const packageDirs = this._findPackageDirs(allFiles);

    return {
      identity,
      name,
      frameworks,
      primaryLanguage,
      languages,
      packageManager,
      tooling,
      infrastructure,
      isMonorepo,
      packageCount,
      fileCount: allFiles.length,
      apps: appDirs,
      packages: packageDirs,
    };
  }

  generateContext(profile: ProjectProfile): string {
    const lines: string[] = [
      `Project: ${profile.name}`,
      ...(profile.identity.gitRoot
        ? [`Repository: ${profile.identity.gitRemote ?? path.basename(profile.identity.gitRoot)}`]
        : []),
      ...(profile.identity.gitBranch ? [`Git Branch: ${profile.identity.gitBranch}`] : []),
      '',
    ];

    if (profile.frameworks.length > 0) {
      lines.push('Frameworks:');
      for (const fw of profile.frameworks) {
        lines.push(`  ${fw.name}${fw.version ? ` ${fw.version}` : ''} (${fw.category})`);
      }
      lines.push('');
    }

    lines.push('Languages:');
    for (const lang of profile.languages) {
      lines.push(`  ${lang.name}${lang.version ? ` ${lang.version}` : ''} — ${lang.percentage}%`);
    }
    lines.push('');

    if (profile.packageManager) {
      lines.push(`Package Manager: ${profile.packageManager.name}`);
      if (profile.isMonorepo) {
        lines.push(`Workspace: ${profile.packageManager.workspaceType ?? 'monorepo'}`);
      }
      lines.push('');
    }

    if (profile.tooling.buildTool) lines.push(`Build: ${profile.tooling.buildTool}`);
    if (profile.tooling.testFramework) lines.push(`Test: ${profile.tooling.testFramework}`);
    if (profile.tooling.linter) lines.push(`Lint: ${profile.tooling.linter}`);
    if (profile.tooling.formatter) lines.push(`Format: ${profile.tooling.formatter}`);
    lines.push('');

    if (profile.apps.length > 0) {
      lines.push('Apps:');
      for (const app of profile.apps) lines.push(`  ${app}`);
      lines.push('');
    }

    if (profile.packages.length > 0) {
      lines.push('Packages:');
      for (const pkg of profile.packages) lines.push(`  ${pkg}`);
      lines.push('');
    }

    if (profile.infrastructure.hasDocker) lines.push('Docker: yes');
    if (profile.infrastructure.hasCI) lines.push(`CI: ${profile.infrastructure.ciProvider ?? 'yes'}`);

    return lines.join('\n');
  }

  private _walkAllFiles(dir: string): string[] {
    const files: string[] = [];
    const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.vestara']);

    const walk = (d: string, relative: string): void => {
      let entries: string[];
      try {
        entries = fs.readdirSync(d);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (ignored.has(entry) || entry.startsWith('.')) continue;
        const full = path.join(d, entry);
        const rel = relative ? `${relative}/${entry}` : entry;
        try {
          if (fs.statSync(full).isDirectory()) walk(full, rel);
          else files.push(rel);
        } catch {}
      }
    };

    walk(dir, '');
    return files;
  }

  private _readJson(relativePath: string): Record<string, any> | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.rootDir, relativePath), 'utf-8'));
    } catch {
      return null;
    }
  }

  private _findGitRoot(): string | null {
    try {
      return execSync('git rev-parse --show-toplevel', { cwd: this.rootDir, encoding: 'utf-8', timeout: 3000 }).trim();
    } catch {
      return null;
    }
  }

  private _getGitRemote(): string | null {
    try {
      if (!this._findGitRoot()) return null;
      return execSync('git remote get-url origin', { cwd: this.rootDir, encoding: 'utf-8', timeout: 3000 }).trim();
    } catch {
      return null;
    }
  }

  private _getGitBranch(): string | null {
    try {
      if (!this._findGitRoot()) return null;
      return execSync('git branch --show-current', { cwd: this.rootDir, encoding: 'utf-8', timeout: 3000 }).trim();
    } catch {
      return null;
    }
  }

  private _computeHash(): string {
    const hash = crypto.createHash('sha256');
    for (const configFile of ['package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'pyproject.toml']) {
      try {
        hash.update(fs.readFileSync(path.join(this.rootDir, configFile)));
      } catch {}
    }
    return hash.digest('hex').slice(0, 16);
  }

  private _countByExtension(files: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of files) {
      const ext = path.extname(f).toLowerCase();
      counts[ext] = (counts[ext] ?? 0) + 1;
    }
    return counts;
  }

  private _detectLanguages(byExtension: Record<string, number>): DetectedLanguage[] {
    const extToLang: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript (React)',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript (React)',
      '.py': 'Python',
      '.rs': 'Rust',
      '.go': 'Go',
      '.java': 'Java',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.scala': 'Scala',
      '.vue': 'Vue',
      '.svelte': 'Svelte',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.html': 'HTML',
      '.sql': 'SQL',
      '.sh': 'Shell',
      '.yaml': 'YAML',
      '.yml': 'YAML',
      '.json': 'JSON',
      '.md': 'Markdown',
      '.toml': 'TOML',
    };

    const sourceExtensions = new Set([
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.rs',
      '.go',
      '.java',
      '.rb',
      '.php',
      '.cs',
      '.swift',
      '.kt',
      '.scala',
      '.vue',
      '.svelte',
    ]);

    const totalFiles = Object.values(byExtension).reduce((a, b) => a + b, 0);
    const langMap = new Map<string, number>();

    for (const [ext, count] of Object.entries(byExtension)) {
      const lang = extToLang[ext] ?? ext.slice(1);
      const weighted = sourceExtensions.has(ext) ? count * 10 : count;
      langMap.set(lang, (langMap.get(lang) ?? 0) + weighted);
    }

    return Array.from(langMap.entries())
      .map(([name, weighted]) => {
        const rawCount = Object.entries(byExtension)
          .filter(([ext]) => (extToLang[ext] ?? ext.slice(1)) === name)
          .reduce((sum, [, count]) => sum + count, 0);
        return {
          name,
          percentage: Math.round(
            (weighted /
              Math.max(
                1,
                Object.values(byExtension).reduce((a, b) => a + b * 10, 0),
              )) *
              100,
          ),
          files: rawCount,
        };
      })
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 10);
  }

  private _detectFrameworks(deps: Record<string, string>, files: string[]): DetectedFramework[] {
    const frameworks: DetectedFramework[] = [];
    const fileSet = new Set(files.map((f) => f.toLowerCase()));

    if (deps['next'])
      frameworks.push({ name: 'Next.js', version: deps['next'], category: 'fullstack', confidence: 'high' });
    if (deps['react']) {
      const version = deps['react'];
      const cleanVersion = version?.replace(/^[\^~>=<]/, '');
      const is19 = cleanVersion && (cleanVersion.startsWith('19.') || cleanVersion.startsWith('19 '));
      frameworks.push({
        name: is19 ? 'React 19' : 'React',
        version,
        category: 'frontend',
        confidence: deps['react-dom'] ? 'high' : 'medium',
      });
    }
    if (deps['vue'] || deps['vue-router'])
      frameworks.push({ name: 'Vue.js', version: deps['vue'], category: 'frontend', confidence: 'high' });
    if (deps['svelte'] || deps['@sveltejs/kit'])
      frameworks.push({
        name: 'Svelte',
        version: deps['svelte'] ?? deps['@sveltejs/kit'],
        category: 'frontend',
        confidence: 'high',
      });
    if (deps['solid-js'])
      frameworks.push({ name: 'Solid', version: deps['solid-js'], category: 'frontend', confidence: 'high' });
    if (deps['angular'] || deps['@angular/core'])
      frameworks.push({
        name: 'Angular',
        version: deps['angular'] ?? deps['@angular/core'],
        category: 'frontend',
        confidence: 'high',
      });
    if (deps['electron'])
      frameworks.push({ name: 'Electron', version: deps['electron'], category: 'frontend', confidence: 'high' });

    if (deps['express'])
      frameworks.push({ name: 'Express', version: deps['express'], category: 'backend', confidence: 'high' });
    if (deps['fastify'] || deps['@fastify/fastify'])
      frameworks.push({
        name: 'Fastify',
        version: deps['fastify'] ?? deps['@fastify/fastify'],
        category: 'backend',
        confidence: 'high',
      });
    if (deps['@nestjs/core'] || deps['nest'])
      frameworks.push({
        name: 'NestJS',
        version: deps['@nestjs/core'] ?? deps['nest'],
        category: 'backend',
        confidence: 'high',
      });
    if (deps['flask']) frameworks.push({ name: 'Flask', category: 'backend', confidence: 'medium' });
    if (deps['django']) frameworks.push({ name: 'Django', category: 'backend', confidence: 'medium' });

    if (deps['vite'] || fileSet.has('vite.config.ts') || fileSet.has('vite.config.js')) {
      const viteIdx = frameworks.findIndex((f) => f.name === 'Vite');
      if (viteIdx >= 0) frameworks[viteIdx].confidence = 'high';
      else frameworks.push({ name: 'Vite', category: 'frontend', confidence: 'high' });
    }
    if (deps['tailwindcss']) {
      frameworks.push({ name: 'Tailwind CSS', version: deps['tailwindcss'], category: 'frontend', confidence: 'high' });
    }
    if (deps['@mui/material'] || deps['@material-ui/core']) {
      frameworks.push({ name: 'Material UI', category: 'frontend', confidence: 'high' });
    }

    return frameworks;
  }

  private _detectPackageManager(files: string[]): DetectedPackageManager | null {
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    if (files.includes('pnpm-workspace.yaml') || fileSet.has('pnpm-lock.yaml')) {
      return {
        name: 'pnpm',
        workspaceType: files.includes('pnpm-workspace.yaml') ? 'monorepo' : 'single',
        lockFile: 'pnpm-lock.yaml',
      };
    }
    if (fileSet.has('yarn.lock')) {
      return { name: 'yarn', workspaceType: fileSet.has('package.json') ? 'single' : 'single', lockFile: 'yarn.lock' };
    }
    if (fileSet.has('package-lock.json')) {
      return { name: 'npm', lockFile: 'package-lock.json' };
    }
    if (fileSet.has('bun.lockb')) {
      return { name: 'bun', lockFile: 'bun.lockb' };
    }
    return null;
  }

  private _detectTooling(files: string[], deps: Record<string, string>): DetectedTooling {
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    const tooling: DetectedTooling = {};

    if (deps['typescript'] || fileSet.has('tsconfig.json')) tooling.buildTool = 'tsc';
    if (deps['vite']) tooling.buildTool = 'vite';
    if (deps['webpack'] || deps['webpack-cli']) tooling.buildTool = 'webpack';
    if (deps['esbuild']) tooling.buildTool = 'esbuild';
    if (deps['rollup']) tooling.buildTool = 'rollup';
    if (deps['turbo']) tooling.buildTool = 'turborepo';
    if (deps['nx']) tooling.buildTool = 'nx';

    if (deps['vitest']) tooling.testFramework = 'vitest';
    else if (deps['jest']) tooling.testFramework = 'jest';
    else if (deps['mocha']) tooling.testFramework = 'mocha';
    else if (deps['playwright']) tooling.testFramework = 'playwright';
    else if (deps['cypress']) tooling.testFramework = 'cypress';
    else if (deps['pytest']) tooling.testFramework = 'pytest';
    else if (deps['@playwright/test']) tooling.testFramework = 'playwright';

    if (deps['eslint']) tooling.linter = 'eslint';
    if (deps['biome']) tooling.linter = tooling.formatter = 'biome';
    if (deps['prettier']) tooling.formatter = 'prettier';

    return tooling;
  }

  private _detectInfrastructure(files: string[]): DetectedInfrastructure {
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    const infra: DetectedInfrastructure = {
      hasDocker: fileSet.has('dockerfile') || files.some((f) => f.startsWith('Dockerfile')),
      hasDockerCompose: files.some((f) => f.startsWith('docker-compose') || f.startsWith('compose.yaml')),
      hasCI: false,
    };

    if (files.some((f) => f.startsWith('.github/workflows/'))) {
      infra.hasCI = true;
      infra.ciProvider = 'github-actions';
    } else if (files.some((f) => f.startsWith('.gitlab-ci.yml'))) {
      infra.hasCI = true;
      infra.ciProvider = 'gitlab-ci';
    }

    infra.hasTerraform = files.some((f) => f.endsWith('.tf')) || files.some((f) => f.endsWith('.tfstate'));

    return infra;
  }

  private _isMonorepo(files: string[]): boolean {
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    if (files.includes('pnpm-workspace.yaml')) return true;
    if (fileSet.has('lerna.json') || fileSet.has('nx.json') || fileSet.has('turbo.json')) return true;
    const packagesInRoot = files.filter((f) => f.startsWith('packages/') && f.endsWith('package.json')).length;
    const appsInRoot = files.filter((f) => f.startsWith('apps/') && f.endsWith('package.json')).length;
    return packagesInRoot > 1 || (packagesInRoot > 0 && appsInRoot > 0);
  }

  private _countPackages(files: string[]): number {
    return files.filter((f) => f.endsWith('package.json') && !f.includes('node_modules')).length;
  }

  private _findAppDirs(files: string[]): string[] {
    const pkgs = files.filter(
      (f) => f.startsWith('apps/') && f.endsWith('package.json') && !f.includes('node_modules'),
    );
    return pkgs.map((f) => path.dirname(f));
  }

  private _findPackageDirs(files: string[]): string[] {
    const pkgs = files.filter(
      (f) => f.startsWith('packages/') && f.endsWith('package.json') && !f.includes('node_modules'),
    );
    return pkgs.map((f) => path.dirname(f));
  }
}
