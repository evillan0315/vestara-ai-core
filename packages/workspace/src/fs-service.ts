/**
 * FilesystemService — strongly typed filesystem operations for the Workspace Runtime.
 *
 * Every operation goes through PathSecurity for sandboxing.
 * Returns structured data instead of plain text.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PathSecurity } from './path-security';
import type { WorkspaceIndex } from './workspace-index';

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  modifiedAt: string;
  createdAt: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modifiedAt: string;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeEntry[];
  size: number;
}

export interface GrepResult {
  file: string;
  line: number;
  column: number;
  content: string;
}

export interface ReadResult {
  content: string;
  path: string;
  size: number;
  encoding: string;
}

export interface WriteResult {
  path: string;
  size: number;
  wasCreated: boolean;
}

export interface CopyResult {
  source: string;
  destination: string;
  size: number;
}

export interface HashResult {
  path: string;
  md5: string;
  sha256: string;
  size: number;
}

export class FilesystemService {
  private security: PathSecurity;
  private index: WorkspaceIndex;

  constructor(workspaceRoot: string, index: WorkspaceIndex) {
    this.security = new PathSecurity(workspaceRoot);
    this.index = index;
  }

  get workspaceRoot(): string {
    return this.security['workspaceRoot'];
  }

  pwd(): string {
    return this.workspaceRoot;
  }

  ls(relativePath: string = '.'): DirectoryEntry[] {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    const entries: DirectoryEntry[] = [];

    try {
      const dirEntries = fs.readdirSync(resolved, { withFileTypes: true });
      for (const entry of dirEntries) {
        const stat = fs.statSync(path.join(resolved, entry.name));
        entries.push({
          name: entry.name,
          path: path.join(relativePath, entry.name),
          type: entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file',
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
        });
      }
    } catch (error) {
      throw new Error(`Cannot list directory: ${(error as Error).message}`);
    }

    return entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  tree(relativePath: string = '.', depth: number = 2): TreeEntry[] {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    const result: TreeEntry[] = [];

    const buildTree = (dirPath: string, relPath: string, currentDepth: number): TreeEntry[] => {
      if (currentDepth > depth) return [];

      const entries: TreeEntry[] = [];
      let dirEntries: fs.Dirent[];

      try {
        dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        return entries;
      }

      const sorted = dirEntries.sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      for (const entry of sorted) {
        const childRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          entries.push({
            name: entry.name,
            path: childRelPath,
            type: 'directory',
            children: buildTree(path.join(dirPath, entry.name), childRelPath, currentDepth + 1),
            size: 0,
          });
        } else {
          try {
            const stat = fs.statSync(path.join(dirPath, entry.name));
            entries.push({
              name: entry.name,
              path: childRelPath,
              type: 'file',
              size: stat.size,
            });
          } catch {
            entries.push({
              name: entry.name,
              path: childRelPath,
              type: 'file',
              size: 0,
            });
          }
        }
      }

      return entries;
    };

    return buildTree(resolved, relativePath === '.' ? '' : relativePath, 0);
  }

  glob(pattern: string): string[] {
    const resolvedRoot = this.security.assertWithinWorkspace('.');
    const results: string[] = [];
    const parts = pattern.replace(/\\/g, '/').split('/');
    const hasGlobstar = pattern.includes('**');
    const hasWildcard = pattern.includes('*') || pattern.includes('?');

    if (!hasWildcard) {
      const resolved = path.resolve(resolvedRoot, pattern);
      if (fs.existsSync(resolved)) {
        return [pattern];
      }
      return [];
    }

    const walkDir = (dirPath: string, relPath: string, patternParts: string[], idx: number): void => {
      if (idx >= patternParts.length) return;

      const currentPart = patternParts[idx];

      if (currentPart === '**') {
        if (idx === patternParts.length - 1) {
          const walkAll = (d: string, r: string): void => {
            let entries: string[];
            try {
              entries = fs.readdirSync(d);
            } catch {
              return;
            }
            for (const e of entries) {
              const full = path.join(d, e);
              const rel = r ? `${r}/${e}` : e;
              try {
                if (fs.statSync(full).isFile()) results.push(rel);
              } catch {}
            }
          };
          walkAll(dirPath, relPath);
          return;
        }
        const walkRecursive = (d: string, r: string): void => {
          walkDir(d, r, patternParts, idx + 1);
          let entries: string[];
          try {
            entries = fs.readdirSync(d);
          } catch {
            return;
          }
          for (const e of entries) {
            const full = path.join(d, e);
            const rel = r ? `${r}/${e}` : e;
            try {
              if (fs.statSync(full).isDirectory()) {
                walkRecursive(full, rel);
              }
            } catch {}
          }
        };
        walkRecursive(dirPath, relPath);
        return;
      }

      if (!currentPart.includes('*') && !currentPart.includes('?')) {
        const full = path.join(dirPath, currentPart);
        const rel = relPath ? `${relPath}/${currentPart}` : currentPart;
        try {
          if (fs.statSync(full).isDirectory()) {
            walkDir(full, rel, patternParts, idx + 1);
          } else if (idx === patternParts.length - 1) {
            results.push(rel);
          }
        } catch {}
        return;
      }

      const regexStr = currentPart.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.');
      const regex = new RegExp(`^${regexStr}$`);

      let entries: string[];
      try {
        entries = fs.readdirSync(dirPath);
      } catch {
        return;
      }

      for (const e of entries) {
        if (!regex.test(e)) continue;
        const full = path.join(dirPath, e);
        const rel = relPath ? `${relPath}/${e}` : e;
        try {
          const stat = fs.statSync(full);
          if (stat.isDirectory()) {
            walkDir(full, rel, patternParts, idx + 1);
          } else if (idx === patternParts.length - 1) {
            results.push(rel);
          }
        } catch {}
      }
    };

    const rootParts = pattern.replace(/\\/g, '/').split('/');
    walkDir(resolvedRoot, '', rootParts, 0);
    return results.sort();
  }

  search(query: string, maxResults: number = 50): string[] {
    return this.index
      .searchByName(query)
      .slice(0, maxResults)
      .map((e) => e.path);
  }

  exists(relativePath: string): boolean {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    return fs.existsSync(resolved);
  }

  stat(relativePath: string): FileInfo {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    try {
      const stat = fs.statSync(resolved);
      return {
        path: relativePath,
        name: path.basename(resolved),
        extension: path.extname(resolved),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        createdAt: stat.birthtime.toISOString(),
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        isSymlink: stat.isSymbolicLink(),
      };
    } catch (error) {
      throw new Error(`Cannot stat path: ${(error as Error).message}`);
    }
  }

  readFile(relativePath: string): ReadResult {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    try {
      const content = fs.readFileSync(resolved, 'utf-8');
      return {
        content,
        path: relativePath,
        size: content.length,
        encoding: 'utf-8',
      };
    } catch (error) {
      throw new Error(`Cannot read file: ${(error as Error).message}`);
    }
  }

  readFileBinary(relativePath: string): Buffer {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    return fs.readFileSync(resolved);
  }

  writeFile(relativePath: string, content: string | Buffer): WriteResult {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    const wasCreated = !fs.existsSync(resolved);

    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content);
      const stat = fs.statSync(resolved);
      this.index.addEntry(relativePath);

      return {
        path: relativePath,
        size: stat.size,
        wasCreated,
      };
    } catch (error) {
      throw new Error(`Cannot write file: ${(error as Error).message}`);
    }
  }

  rename(oldPath: string, newPath: string): { oldPath: string; newPath: string } {
    const resolvedOld = this.security.assertWithinWorkspace(oldPath);
    const resolvedNew = this.security.assertWithinWorkspace(newPath);

    try {
      fs.mkdirSync(path.dirname(resolvedNew), { recursive: true });
      fs.renameSync(resolvedOld, resolvedNew);
      this.index.removeEntry(oldPath);
      this.index.addEntry(newPath);
      return { oldPath, newPath };
    } catch (error) {
      throw new Error(`Cannot rename: ${(error as Error).message}`);
    }
  }

  copy(source: string, destination: string): CopyResult {
    const resolvedSource = this.security.assertWithinWorkspace(source);
    const resolvedDest = this.security.assertWithinWorkspace(destination);

    try {
      fs.mkdirSync(path.dirname(resolvedDest), { recursive: true });
      fs.copyFileSync(resolvedSource, resolvedDest);
      const stat = fs.statSync(resolvedDest);
      this.index.addEntry(destination);
      return { source, destination, size: stat.size };
    } catch (error) {
      throw new Error(`Cannot copy: ${(error as Error).message}`);
    }
  }

  move(source: string, destination: string): { oldPath: string; newPath: string } {
    return this.rename(source, destination);
  }

  delete(relativePath: string): { path: string; recovered: number } {
    const resolved = this.security.assertWithinWorkspace(relativePath);

    try {
      let recovered = 0;
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        const size = this._dirSize(resolved);
        fs.rmSync(resolved, { recursive: true, force: true });
        recovered = size;
      } else {
        recovered = stat.size;
        fs.unlinkSync(resolved);
      }

      this.index.removeEntry(relativePath);
      return { path: relativePath, recovered };
    } catch (error) {
      throw new Error(`Cannot delete: ${(error as Error).message}`);
    }
  }

  mkdir(relativePath: string, recursive: boolean = true): { path: string; existed: boolean } {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    const existed = fs.existsSync(resolved);

    if (!existed) {
      try {
        fs.mkdirSync(resolved, { recursive });
      } catch (error) {
        throw new Error(`Cannot create directory: ${(error as Error).message}`);
      }
    }

    return { path: relativePath, existed };
  }

  hash(relativePath: string): HashResult {
    const resolved = this.security.assertWithinWorkspace(relativePath);
    try {
      const content = fs.readFileSync(resolved);
      const md5 = crypto.createHash('md5').update(content).digest('hex');
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      return {
        path: relativePath,
        md5,
        sha256,
        size: content.length,
      };
    } catch (error) {
      throw new Error(`Cannot hash file: ${(error as Error).message}`);
    }
  }

  resolve(relativePath: string): string {
    return path.resolve(this.workspaceRoot, relativePath);
  }

  relative(absolutePath: string): string {
    return path.relative(this.workspaceRoot, absolutePath);
  }

  private _dirSize(dirPath: string): number {
    let total = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            total += this._dirSize(fullPath);
          } else {
            total += fs.statSync(fullPath).size;
          }
        } catch {}
      }
    } catch {}
    return total;
  }
}
