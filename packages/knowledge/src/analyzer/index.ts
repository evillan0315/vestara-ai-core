import type { ProjectInfo } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════
// REPOSITORY INTELLIGENCE
// ═══════════════════════════════════════════════════════════════

export interface RepositoryAnalyzer {
  analyze(files: string[]): ProjectInfo;
}

export class DefaultRepositoryAnalyzer implements RepositoryAnalyzer {
  analyze(files: string[]): ProjectInfo {
    const fileSet = new Set(files.map((f) => f.toLowerCase()));
    const info: ProjectInfo = {
      type: 'unknown',
      language: 'unknown',
      fileCount: files.length,
      totalSizeKB: 0,
      hasDocker: fileSet.has('dockerfile') || fileSet.has('docker-compose.yml'),
      hasCI: fileSet.has('.github/workflows') || fileSet.has('.gitlab-ci.yml'),
      isMonorepo: fileSet.has('pnpm-workspace.yaml') || fileSet.has('lerna.json') || fileSet.has('nx.json'),
    };

    // Detect project type
    if (fileSet.has('package.json')) {
      if (fileSet.has('tsconfig.json')) {
        if (fileSet.has('next.config.js') || fileSet.has('next.config.ts')) {
          info.type = 'next.js';
          info.language = 'typescript';
          info.framework = 'next.js';
        } else if (fileSet.has('vite.config.ts') || fileSet.has('vite.config.js')) {
          info.type = 'vite';
          info.language = 'typescript';
          info.framework = 'vite';
          info.buildTool = 'vite';
        } else if (fileSet.has('turbo.json')) {
          info.type = 'turborepo';
          info.language = 'typescript';
          info.isMonorepo = true;
          info.buildTool = 'turborepo';
        } else {
          info.type = 'node';
          info.language = 'typescript';
        }
      } else {
        info.type = 'node';
        info.language = 'javascript';
      }
      info.packageManager = fileSet.has('pnpm-lock.yaml') ? 'pnpm' : fileSet.has('yarn.lock') ? 'yarn' : 'npm';
      info.testFramework = fileSet.has('vitest.config.ts')
        ? 'vitest'
        : fileSet.has('jest.config.ts')
          ? 'jest'
          : undefined;
    } else if (fileSet.has('go.mod')) {
      info.type = 'go';
      info.language = 'go';
    } else if (fileSet.has('Cargo.toml')) {
      info.type = 'rust';
      info.language = 'rust';
    } else if (fileSet.has('setup.py') || fileSet.has('pyproject.toml')) {
      info.type = 'python';
      info.language = 'python';
    } else if (fileSet.has('Gemfile')) {
      info.type = 'ruby';
      info.language = 'ruby';
    }

    if (fileSet.has('docker-compose.yml') || fileSet.has('docker-compose.yaml')) info.hasDocker = true;
    if (fileSet.has('.github/') || files.some((f) => f.startsWith('.github/'))) info.hasCI = true;

    return info;
  }
}
