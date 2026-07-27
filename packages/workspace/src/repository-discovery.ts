/**
 * RepositoryDiscovery — Stage 1 of the open pipeline.
 *
 * Walks the directory tree, collects file metadata, and produces
 * a DiscoveryResult. Pure function — no side effects beyond I/O.
 *
 * Architecture Traceability:
 *   Epic: EPIC-001 — Repository Comprehension
 */

import type { DiscoveryResult } from './types';

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.cache',
  'target',
  '.venv',
  '.vestara',
  '.idea',
  '.vscode',
  '.DS_Store',
]);

const IGNORE_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.gitignore',
]);

export class RepositoryDiscovery {
  /**
   * Walk the directory tree and collect relative file paths.
   * Skips ignored directories and files.
   */
  static async walk(rootDir: string): Promise<string[]> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const files: string[] = [];

    const walkDir = (dir: string, relative: string): void => {
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (IGNORE_FILES.has(entry)) continue;
        const fullPath = path.join(dir, entry);
        const relPath = relative ? `${relative}/${entry}` : entry;
        let stat: any;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          if (!IGNORE_DIRS.has(entry)) {
            walkDir(fullPath, relPath);
          }
        } else if (stat.isFile()) {
          files.push(relPath);
        }
      }
    };

    walkDir(rootDir, '');
    return files;
  }

  /**
   * Compute aggregate stats from the file list, including mtime cache.
   */
  static async stats(
    rootDir: string,
    files: string[],
  ): Promise<{
    totalFiles: number;
    totalSizeKB: number;
    byExtension: Record<string, number>;
    mtimeCache: Record<string, string>;
  }> {
    const fs = await import('node:fs');
    const path = await import('node:path');
    let totalSize = 0;
    const byExtension: Record<string, number> = {};
    const mtimeCache: Record<string, string> = {};

    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase() ?? '(none)';
      byExtension[ext] = (byExtension[ext] ?? 0) + 1;

      try {
        const stat = fs.statSync(path.join(rootDir, file));
        totalSize += stat.size;
        mtimeCache[file] = stat.mtimeMs.toFixed(0);
      } catch {
        // skip files that disappeared between walk and stats
      }
    }

    return {
      totalFiles: files.length,
      totalSizeKB: Math.round(totalSize / 1024),
      byExtension,
      mtimeCache,
    };
  }

  /**
   * Full discovery: walk + stats in one call.
   * Optionally pass a previous mtimeCache to only return changed files.
   */
  static async discover(rootDir: string, _previousMtimes?: Record<string, string>): Promise<DiscoveryResult> {
    const files = await RepositoryDiscovery.walk(rootDir);
    const stats = await RepositoryDiscovery.stats(rootDir, files);
    return {
      files,
      totalFiles: stats.totalFiles,
      totalSizeKB: stats.totalSizeKB,
      byExtension: stats.byExtension,
      mtimeCache: stats.mtimeCache,
      discoveredAt: new Date().toISOString(),
    };
  }
}
