/**
 * WorkspaceIndex — in-memory index of workspace files and directories.
 *
 * Features:
 *   - Lazy scanning (only indexes what's needed)
 *   - Configurable ignore rules
 *   - Directory tree representation
 *   - Extension and location lookups
 *   - Incremental updates
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface IndexOptions {
  rootDir: string;
  ignoreDirs?: string[];
  ignoreFiles?: string[];
  maxFiles?: number;
}

export interface IndexEntry {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: number;
  isDirectory: boolean;
}

export interface IndexNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: IndexNode[];
  size: number;
}

const DEFAULT_IGNORE_DIRS = [
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
  '.turbo',
  '.nx',
  'cache',
  '.bin',
  '.serverless',
  'cdk.out',
  '.terraform',
];

const DEFAULT_IGNORE_FILES = [
  '.DS_Store',
  'Thumbs.db',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.gitignore',
  '*.log',
];

export class WorkspaceIndex {
  private rootDir: string;
  private entries: Map<string, IndexEntry> = new Map();
  private byExtension: Map<string, IndexEntry[]> = new Map();
  private directories: string[] = [];
  private ignoreDirs: Set<string>;
  private ignoreFiles: Set<string>;
  private maxFiles: number;
  private _isIndexed = false;
  private _lastIndexedAt: string | null = null;

  constructor(options: IndexOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.ignoreDirs = new Set(options.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
    this.ignoreFiles = new Set(options.ignoreFiles ?? DEFAULT_IGNORE_FILES);
    this.maxFiles = options.maxFiles ?? 500_000;
  }

  get isIndexed(): boolean {
    return this._isIndexed;
  }

  get lastIndexedAt(): string | null {
    return this._lastIndexedAt;
  }

  get totalFiles(): number {
    return this.entries.size;
  }

  get totalDirectories(): number {
    return this.directories.length;
  }

  async scan(): Promise<void> {
    const startTime = performance.now();
    this.entries.clear();
    this.byExtension.clear();
    this.directories = [];
    let fileCount = 0;

    const walkDir = (dirPath: string, relativePath: string): void => {
      let dirEntries: string[];
      try {
        dirEntries = fs.readdirSync(dirPath);
      } catch {
        return;
      }

      this.directories.push(relativePath || '.');

      for (const entry of dirEntries) {
        if (fileCount >= this.maxFiles) return;

        const fullPath = path.join(dirPath, entry);
        const relPath = relativePath ? `${relativePath}/${entry}` : entry;

        let stat: fs.Stats;
        try {
          stat = fs.statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          if (this.ignoreDirs.has(entry)) continue;
          walkDir(fullPath, relPath);
        } else if (stat.isFile()) {
          if (this.shouldIgnoreFile(entry)) continue;

          const ext = path.extname(entry).toLowerCase();
          const indexEntry: IndexEntry = {
            path: relPath,
            name: entry,
            extension: ext,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            isDirectory: false,
          };

          this.entries.set(relPath, indexEntry);

          const extList = this.byExtension.get(ext) ?? [];
          extList.push(indexEntry);
          this.byExtension.set(ext, extList);

          fileCount++;
        }
      }
    };

    walkDir(this.rootDir, '');
    this._isIndexed = true;
    this._lastIndexedAt = new Date().toISOString();
  }

  getEntry(relativePath: string): IndexEntry | undefined {
    return this.entries.get(relativePath);
  }

  hasEntry(relativePath: string): boolean {
    return this.entries.has(relativePath);
  }

  findByExtension(ext: string): IndexEntry[] {
    const extLower = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return this.byExtension.get(extLower) ?? [];
  }

  searchByName(query: string): IndexEntry[] {
    const lower = query.toLowerCase();
    const results: IndexEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.name.toLowerCase().includes(lower) || entry.path.toLowerCase().includes(lower)) {
        results.push(entry);
      }
    }
    return results;
  }

  findByDirectory(dirPath: string): IndexEntry[] {
    const prefix = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
    const results: IndexEntry[] = [];
    for (const entry of this.entries.values()) {
      if (entry.path.startsWith(prefix)) {
        results.push(entry);
      }
    }
    return results;
  }

  getDirectoryTree(depth: number = Infinity): IndexNode {
    const root: IndexNode = {
      name: path.basename(this.rootDir),
      path: '',
      type: 'directory',
      children: [],
      size: 0,
    };

    const sortedEntries = Array.from(this.entries.values()).sort((a, b) => a.path.localeCompare(b.path));

    for (const entry of sortedEntries) {
      const parts = entry.path.split('/');
      if (parts.length > depth + 1) continue;

      let current = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        let child = current.children.find((c) => c.name === part && c.type === 'directory');
        if (!child) {
          child = {
            name: part,
            path: parts.slice(0, i + 1).join('/'),
            type: 'directory',
            children: [],
            size: 0,
          };
          current.children.push(child);
        }
        current = child;
      }

      const fileName = parts[parts.length - 1];
      current.children.push({
        name: fileName,
        path: entry.path,
        type: 'file',
        children: [],
        size: entry.size,
      });
      current.size += entry.size;
    }

    return root;
  }

  getFilesByPattern(pattern: RegExp): IndexEntry[] {
    const results: IndexEntry[] = [];
    for (const entry of this.entries.values()) {
      if (pattern.test(entry.path)) {
        results.push(entry);
      }
    }
    return results;
  }

  addEntry(relativePath: string): void {
    const fullPath = path.join(this.rootDir, relativePath);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const ext = path.extname(relativePath).toLowerCase();
        const entry: IndexEntry = {
          path: relativePath,
          name: path.basename(relativePath),
          extension: ext,
          size: stat.size,
          modifiedAt: stat.mtimeMs,
          isDirectory: false,
        };
        this.entries.set(relativePath, entry);
        const extList = this.byExtension.get(ext) ?? [];
        extList.push(entry);
        this.byExtension.set(ext, extList);
      }
    } catch {
      // file doesn't exist
    }
  }

  removeEntry(relativePath: string): void {
    const entry = this.entries.get(relativePath);
    if (entry) {
      this.entries.delete(relativePath);
      const extList = this.byExtension.get(entry.extension);
      if (extList) {
        const idx = extList.findIndex((e) => e.path === relativePath);
        if (idx >= 0) extList.splice(idx, 1);
      }
    }
  }

  private shouldIgnoreFile(fileName: string): boolean {
    if (this.ignoreFiles.has(fileName)) return true;
    for (const pattern of this.ignoreFiles) {
      if (pattern.startsWith('*') && fileName.endsWith(pattern.slice(1))) return true;
    }
    return false;
  }
}
