/**
 * Change event projection — derives `change.*` events from ACTUAL filesystem
 * observations and Git state (never from model output).
 *
 * For a harness thread this captures a workspace baseline (file list + content
 * hashes + git HEAD) and then projects per-file operations and a diff summary
 * against that baseline. The events feed the TUI diff projection and the
 * Execution Center:
 *
 *   change.baseline.captured   baseline payload (root, gitHead, files)
 *   change.file.created        file added since baseline
 *   change.file.updated        file content changed since baseline
 *   change.file.deleted        file removed since baseline
 *   change.file.renamed        file moved (hash preserved)
 *   change.diff.updated        per-file stats + unified git diff + summary
 *   change.summary.updated     aggregate additions/deletions/count
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { contentHash } from '@vestara/diff-engine';
import type { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import type { TaskThreadId } from '@vestara/types';

export interface ChangeBaselineFile {
  readonly path: string;
  readonly hash: string;
}

export interface WorkspaceBaseline {
  readonly root: string;
  readonly gitHead: string;
  readonly files: readonly ChangeBaselineFile[];
  readonly capturedAt: string;
}

export type ChangeOperation = 'created' | 'updated' | 'deleted' | 'renamed';

export interface FileChangeDetection {
  readonly path: string;
  readonly operation: ChangeOperation;
  readonly previousPath?: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface DiffStat {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface ChangeSummary {
  readonly fileCount: number;
  readonly additions: number;
  readonly deletions: number;
  readonly summary: string;
}

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', '.vestara']);

/** All workspace-relative files (skipping generated/ignored directories). */
export function listWorkspaceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const full = path.join(dir, entry.name);
      if (full.startsWith(path.join(dir, '.git'))) continue;
      out.push(path.relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

export function captureFilesystemState(root: string): { gitHead: string; files: ChangeBaselineFile[] } {
  let gitHead = '';
  try {
    gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    gitHead = 'NO-GIT';
  }
  const files: ChangeBaselineFile[] = [];
  for (const file of listWorkspaceFiles(root)) {
    try {
      const full = path.resolve(root, file);
      if (!full.startsWith(`${path.resolve(root)}${path.sep}`) && path.resolve(root) !== full) continue;
      const hash = contentHash(fs.readFileSync(full));
      files.push({ path: file, hash });
    } catch {
      /* file may have been removed between list and read */
    }
  }
  return { gitHead, files };
}

/** Diff stats per file from `git diff --numstat HEAD`. */
export function gitDiffStats(root: string): DiffStat[] {
  try {
    const output = execFileSync('git', ['diff', '--numstat', 'HEAD', '--'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    }).trim();
    if (!output) return [];
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [additions, deletions, ...rest] = line.split('\t');
        return {
          path: rest.join('\t'),
          additions: additions === '-' ? 0 : Number(additions) || 0,
          deletions: deletions === '-' ? 0 : Number(deletions) || 0,
        };
      });
  } catch {
    return [];
  }
}

/** Unified diff against HEAD (used by the streaming TUI diff projection). */
export function gitUnifiedDiff(root: string): string {
  try {
    return execFileSync('git', ['diff', '--no-ext-diff', '--no-color', 'HEAD', '--'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return '';
  }
}

/**
 * Detect per-file operations between a baseline and the current state.
 * Renames are inferred when a newly-created file carries the hash of a file
 * that disappeared from the baseline.
 */
export function detectChanges(
  baseline: readonly ChangeBaselineFile[],
  current: readonly ChangeBaselineFile[],
): FileChangeDetection[] {
  const byPath = new Map(current.map((file) => [file.path, file]));
  const baselineByPath = new Map(baseline.map((file) => [file.path, file]));
  const deleted = baseline.filter((file) => !byPath.has(file.path));
  const deletedByHash = new Map<string, string>();
  for (const file of deleted) deletedByHash.set(file.hash, file.path);

  const detections: FileChangeDetection[] = [];
  const claimed = new Set<string>();

  for (const file of current) {
    const prior = baselineByPath.get(file.path);
    if (!prior) {
      // Possible rename source (same content hash) or genuine creation.
      const source = deletedByHash.get(file.hash);
      if (source && !claimed.has(source)) {
        claimed.add(source);
        detections.push({ path: file.path, operation: 'renamed', previousPath: source, additions: 0, deletions: 0 });
      } else {
        detections.push({ path: file.path, operation: 'created', additions: 0, deletions: 0 });
      }
      continue;
    }
    if (prior.hash !== file.hash)
      detections.push({ path: file.path, operation: 'updated', additions: 0, deletions: 0 });
  }

  for (const file of deleted) {
    if (claimed.has(file.path)) continue;
    detections.push({ path: file.path, operation: 'deleted', additions: 0, deletions: 0 });
  }

  return detections;
}

/** Merge git numstat additions/deletions into detections by path. */
export function mergeDiffStats(
  detections: readonly FileChangeDetection[],
  stats: readonly DiffStat[],
): FileChangeDetection[] {
  const statsByPath = new Map(stats.map((stat) => [stat.path, stat]));
  return detections.map((detection) => {
    const stat = statsByPath.get(detection.path);
    return stat ? { ...detection, additions: stat.additions, deletions: stat.deletions } : detection;
  });
}

export function summarizeChanges(changes: readonly FileChangeDetection[]): ChangeSummary {
  const additions = changes.reduce((sum, change) => sum + change.additions, 0);
  const deletions = changes.reduce((sum, change) => sum + change.deletions, 0);
  const summary =
    changes.length === 0
      ? 'No changes'
      : `${changes.length} file${changes.length === 1 ? '' : 's'} changed, +${additions} -${deletions}`;
  return { fileCount: changes.length, additions, deletions, summary };
}

export interface ChangeEventProjectorOptions {
  readonly events: SqliteEngineeringEventStore;
  readonly workspaceId: string;
  readonly environmentId: string;
  readonly root: string;
}

let changeCounter = 0;

export class ChangeEventProjector {
  constructor(private readonly options: ChangeEventProjectorOptions) {}

  /** Capture a baseline for a thread so later diffs are relative to it. */
  async captureBaseline(input: { threadId: TaskThreadId; taskId?: string; agentId?: string }): Promise<void> {
    const state = captureFilesystemState(this.options.root);
    const baseline: WorkspaceBaseline = {
      root: this.options.root,
      gitHead: state.gitHead,
      files: state.files,
      capturedAt: new Date().toISOString(),
    };
    this.append('change.baseline.captured', input, baseline);
  }

  /**
   * Project the current workspace state against the thread's latest baseline
   * and append `change.file.*`, `change.diff.updated`, and
   * `change.summary.updated` events. Returns the detected changes.
   */
  async projectChanges(input: {
    threadId: TaskThreadId;
    taskId?: string;
    agentId?: string;
  }): Promise<FileChangeDetection[]> {
    const baseline = this.latestBaseline(input.threadId);
    const current = captureFilesystemState(this.options.root);
    const baselineFiles = baseline ? baseline.files : [];
    const detections = mergeDiffStats(detectChanges(baselineFiles, current.files), gitDiffStats(this.options.root));
    const summary = summarizeChanges(detections);

    // Idempotent: a read/GET must not emit duplicate change events.
    const latestSummary = this.latestSummary(input.threadId);
    if (
      latestSummary &&
      latestSummary.fileCount === summary.fileCount &&
      latestSummary.additions === summary.additions
    ) {
      return detections;
    }

    for (const change of detections) {
      this.append(`change.file.${change.operation}`, input, change);
    }
    this.append('change.diff.updated', input, {
      files: detections,
      diff: gitUnifiedDiff(this.options.root),
      summary: summary.summary,
    });
    this.append('change.summary.updated', input, summary);
    return detections;
  }

  private latestSummary(threadId: TaskThreadId): ChangeSummary | null {
    const events = this.options.events.query({ threadId });
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event.type !== 'change.summary.updated') continue;
      const payload = event.payload as Record<string, unknown>;
      return {
        fileCount: Number(payload.fileCount ?? 0) || 0,
        additions: Number(payload.additions ?? 0) || 0,
        deletions: Number(payload.deletions ?? 0) || 0,
        summary: String(payload.summary ?? ''),
      };
    }
    return null;
  }

  private latestBaseline(threadId: TaskThreadId): WorkspaceBaseline | null {
    const events = this.options.events.query({ threadId });
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event.type !== 'change.baseline.captured') continue;
      const payload = event.payload as Record<string, unknown>;
      return {
        root: String(payload.root ?? ''),
        gitHead: String(payload.gitHead ?? ''),
        files: Array.isArray(payload.files) ? (payload.files as ChangeBaselineFile[]) : [],
        capturedAt: String(payload.capturedAt ?? event.at),
      };
    }
    return null;
  }

  private append(
    type: string,
    input: { threadId: TaskThreadId; taskId?: string; agentId?: string },
    payload: unknown,
  ): void {
    try {
      this.options.events.append({
        type,
        source: 'change-projection',
        actorId: input.agentId ?? 'change-projector',
        authority: 'system',
        workspaceId: this.options.workspaceId,
        environmentId: this.options.environmentId,
        threadId: input.threadId,
        taskId: input.taskId,
        correlationId: `change:${input.threadId}:${++changeCounter}`,
        payload: payload as Readonly<Record<string, unknown>>,
      });
    } catch {
      /* change projection must never break the request */
    }
  }
}
