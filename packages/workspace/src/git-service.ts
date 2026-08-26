/**
 * GitService — Git integration for the Workspace Runtime.
 *
 * Provides first-class Git awareness: status, diff, branch, log,
 * checkout, blame, and repository discovery.
 */

import { execSync } from 'node:child_process';

export interface GitStatusEntry {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'unmerged' | 'untracked';
  staged: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  entries: GitStatusEntry[];
  hasUncommitted: boolean;
  hasStaged: boolean;
  hasUntracked: boolean;
}

export interface GitDiffEntry {
  path: string;
  type: 'staged' | 'unstaged';
  additions: number;
  deletions: number;
  hunks: GitDiffHunk[];
}

export interface GitDiffHunk {
  header: string;
  content: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
  body: string;
}

export interface GitLogOptions {
  maxCount?: number;
  file?: string;
  branch?: string;
}

export interface GitBlameEntry {
  commit: string;
  author: string;
  email: string;
  date: string;
  line: number;
  content: string;
}

export class GitService {
  private gitRoot: string | null;
  private workDir: string;

  constructor(workDir: string) {
    this.workDir = workDir;
    this.gitRoot = this._findGitRoot(workDir);
  }

  get isRepository(): boolean {
    return this.gitRoot !== null;
  }

  get root(): string | null {
    return this.gitRoot;
  }

  branch(): string | null {
    if (!this.gitRoot) return null;
    return this._exec('git branch --show-current');
  }

  status(): GitStatus | null {
    if (!this.gitRoot) return null;

    const branch = this.branch() ?? 'unknown';

    const aheadBehind = this._exec('git rev-list --count --left-right HEAD...origin/HEAD 2>/dev/null') ?? '0\t0';
    const [behind, ahead] = aheadBehind.split('\t').map(Number);

    const entries: GitStatusEntry[] = [];

    const stagedRaw = this._exec('git diff --cached --name-status') ?? '';
    for (const line of stagedRaw.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');
      entries.push({ path, status: this._mapStatus(status), staged: true });
    }

    const unstagedRaw = this._exec('git diff --name-status') ?? '';
    for (const line of unstagedRaw.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t');
      const path = pathParts.join('\t');
      entries.push({ path, status: this._mapStatus(status), staged: false });
    }

    const untrackedRaw = this._exec('git ls-files --others --exclude-standard') ?? '';
    for (const path of untrackedRaw.split('\n').filter(Boolean)) {
      entries.push({ path, status: 'untracked', staged: false });
    }

    return {
      branch,
      ahead,
      behind,
      entries,
      hasUncommitted: entries.some((e) => !e.staged),
      hasStaged: entries.some((e) => e.staged),
      hasUntracked: entries.some((e) => e.status === 'untracked'),
    };
  }

  diff(staged: boolean = false): GitDiffEntry[] {
    if (!this.gitRoot) return [];

    const cmd = staged ? 'git diff --cached --unified=3' : 'git diff --unified=3';
    const raw = this._exec(cmd);
    if (!raw) return [];

    return this._parseDiff(raw, staged);
  }

  log(options: GitLogOptions = {}): GitCommit[] {
    if (!this.gitRoot) return [];

    const maxCount = options.maxCount ?? 10;
    const fileArg = options.file ? ` -- "${options.file}"` : '';
    const branchArg = options.branch ?? 'HEAD';
    const cmd = `git log ${branchArg} --max-count=${maxCount} --format="HASH:%H%nAUTHOR:%an%nEMAIL:%ae%nDATE:%aI%nMSG:%s%nBODY:%b%n---"${fileArg}`;
    const raw = this._exec(cmd);
    if (!raw) return [];

    return this._parseLog(raw);
  }

  checkout(ref: string, path?: string): { ref: string; paths: string[] } {
    if (!this.gitRoot) throw new Error('Not a git repository');

    const pathArg = path ? ` -- "${path}"` : '';
    this._exec(`git checkout ${ref}${pathArg}`);
    return { ref, paths: path ? [path] : [] };
  }

  blame(filePath: string): GitBlameEntry[] {
    if (!this.gitRoot) return [];

    const cmd = `git blame --line-porcelain "${filePath}"`;
    const raw = this._exec(cmd);
    if (!raw) return [];

    return this._parseBlame(raw);
  }

  diffForFile(filePath: string, staged: boolean = false): string | null {
    if (!this.gitRoot) return null;
    const cmd = staged ? `git diff --cached -- "${filePath}"` : `git diff -- "${filePath}"`;
    return this._exec(cmd);
  }

  changedFiles(branch: string = 'HEAD'): string[] {
    if (!this.gitRoot) return [];
    const raw = this._exec(`git diff --name-only ${branch}`);
    if (!raw) return [];
    return raw.split('\n').filter(Boolean);
  }

  show(hash: string): string | null {
    if (!this.gitRoot) return null;
    return this._exec(`git show ${hash} --format="%H%n%an%n%ae%n%aI%n%s%n%b" --no-patch`);
  }

  private _exec(cmd: string): string | null {
    try {
      return execSync(cmd, { cwd: this.gitRoot ?? this.workDir, encoding: 'utf-8', timeout: 10000 }).trim();
    } catch {
      return null;
    }
  }

  private _findGitRoot(dir: string): string | null {
    try {
      const root = execSync('git rev-parse --show-toplevel', {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 5000,
      }).trim();
      return root || null;
    } catch {
      return null;
    }
  }

  private _mapStatus(s: string): GitStatusEntry['status'] {
    switch (s) {
      case 'M':
        return 'modified';
      case 'A':
        return 'added';
      case 'D':
        return 'deleted';
      case 'R':
        return 'renamed';
      case 'C':
        return 'copied';
      case 'U':
        return 'unmerged';
      case '??':
        return 'untracked';
      default:
        return 'modified';
    }
  }

  private _parseDiff(raw: string, staged: boolean): GitDiffEntry[] {
    const entries: GitDiffEntry[] = [];
    const fileBlocks = raw.split('\ndiff --git ');
    for (const block of fileBlocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const _headerLine = lines.find((l) => l.startsWith('--- a/') || l.startsWith('+++ b/'));
      const pathMatch = block.match(/^\+\+\+ b\/(.+)/m);
      const filePath = pathMatch ? pathMatch[1] : 'unknown';

      const hunks: GitDiffHunk[] = [];
      let currentHunk: GitDiffHunk | null = null;

      for (const line of lines) {
        const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
        if (hunkMatch) {
          if (currentHunk) hunks.push(currentHunk);
          currentHunk = {
            header: line,
            content: '',
            oldStart: parseInt(hunkMatch[1], 10),
            oldLines: parseInt(hunkMatch[2] || '1', 10),
            newStart: parseInt(hunkMatch[3], 10),
            newLines: parseInt(hunkMatch[4] || '1', 10),
          };
        } else if (currentHunk) {
          currentHunk.content += `${line}\n`;
        }
      }
      if (currentHunk) hunks.push(currentHunk);

      const additions = lines.filter((l) => l.startsWith('+')).length;
      const deletions = lines.filter((l) => l.startsWith('-')).length;

      entries.push({
        path: filePath,
        type: staged ? 'staged' : 'unstaged',
        additions,
        deletions,
        hunks,
      });
    }
    return entries;
  }

  private _parseLog(raw: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const blocks = raw.split('\n---\n');
    for (const block of blocks) {
      if (!block.trim()) continue;
      const lines = block.split('\n');
      const commit: Partial<GitCommit> = {};
      for (const line of lines) {
        if (line.startsWith('HASH:')) commit.hash = line.slice(5);
        else if (line.startsWith('AUTHOR:')) commit.author = line.slice(7);
        else if (line.startsWith('EMAIL:')) commit.email = line.slice(6);
        else if (line.startsWith('DATE:')) commit.date = line.slice(5);
        else if (line.startsWith('MSG:')) commit.message = line.slice(4);
        else if (line.startsWith('BODY:')) commit.body = line.slice(5);
      }
      if (commit.hash) {
        commits.push(commit as GitCommit);
      }
    }
    return commits;
  }

  private _parseBlame(raw: string): GitBlameEntry[] {
    const entries: GitBlameEntry[] = [];
    const lines = raw.split('\n');
    let current: Partial<GitBlameEntry> = {};
    let _lineNum = 0;

    for (const line of lines) {
      if (!line.trim()) continue;

      const headerMatch = line.match(/^([a-f0-9]+)\s+(\d+)\s+(\d+)/);
      if (headerMatch) {
        if (current.commit && current.line) {
          entries.push(current as GitBlameEntry);
        }
        current = {
          commit: headerMatch[1],
          line: parseInt(headerMatch[2], 10),
        };
        _lineNum = 0;
        continue;
      }

      if (line.startsWith('author ')) {
        current.author = line.slice(7);
      } else if (line.startsWith('author-mail ')) {
        current.email = line.slice(12).replace(/[<>]/g, '');
      } else if (line.startsWith('author-time ')) {
        current.date = new Date(parseInt(line.slice(11), 10) * 1000).toISOString();
      } else if (line.startsWith('\t')) {
        current.content = line.slice(1);
      }
    }

    if (current.commit && current.line) {
      entries.push(current as GitBlameEntry);
    }

    return entries;
  }
}
