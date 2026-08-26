import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteEngineeringEventStore } from '@vestara/engineering-event-store';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type ChangeBaselineFile,
  ChangeEventProjector,
  captureFilesystemState,
  detectChanges,
  gitDiffStats,
  mergeDiffStats,
  summarizeChanges,
} from '../src/bridges/change-event-bridge.js';

const directories: string[] = [];

afterAll(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function tmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-change-'));
  directories.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@vestara.dev'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  return dir;
}

function commitAll(dir: string, message: string): void {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir });
}

describe('change projection pure functions', () => {
  it('captures workspace files with content hashes and git head', async () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'a.txt'), 'hello');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'world');
    commitAll(dir, 'baseline');
    const state = await captureFilesystemState(dir);
    expect(state.gitHead).toMatch(/^[0-9a-f]{40}$/);
    const files = new Map(state.files.map((file) => [file.path, file.hash]));
    expect(files.has('a.txt')).toBe(true);
    expect(files.has('sub/b.txt')).toBe(true);
    expect(files.get('a.txt')).toMatch(/^[0-9a-f]{64}$/);
    expect(state.files.some((file) => file.path.startsWith('.git'))).toBe(false);
  });

  it('detects created, updated, deleted, and renamed files', () => {
    const baseline: ChangeBaselineFile[] = [
      { path: 'same.txt', hash: 'h-same' },
      { path: 'edit.txt', hash: 'h-old' },
      { path: 'gone.txt', hash: 'h-gone' },
      { path: 'old-name.txt', hash: 'h-moved' },
    ];
    const current: ChangeBaselineFile[] = [
      { path: 'same.txt', hash: 'h-same' },
      { path: 'edit.txt', hash: 'h-new' },
      { path: 'new.txt', hash: 'h-new-file' },
      { path: 'new-name.txt', hash: 'h-moved' },
    ];
    const changes = detectChanges(baseline, current);
    const byPath = new Map(changes.map((change) => [change.path, change]));
    expect(changes.find((change) => change.path === 'new.txt')?.operation).toBe('created');
    expect(changes.find((change) => change.path === 'edit.txt')?.operation).toBe('updated');
    expect(changes.find((change) => change.path === 'gone.txt')?.operation).toBe('deleted');
    const renamed = byPath.get('new-name.txt');
    expect(renamed?.operation).toBe('renamed');
    expect(renamed?.previousPath).toBe('old-name.txt');
  });

  it('merges git numstat and summarizes', () => {
    const detections = [
      { path: 'a.ts', operation: 'updated' as const, additions: 0, deletions: 0 },
      { path: 'b.ts', operation: 'created' as const, additions: 0, deletions: 0 },
    ];
    const merged = mergeDiffStats(detections, [
      { path: 'a.ts', additions: 3, deletions: 1 },
      { path: 'b.ts', additions: 10, deletions: 0 },
    ]);
    expect(merged[0].additions).toBe(3);
    expect(merged[1].deletions).toBe(0);
    const summary = summarizeChanges(merged);
    expect(summary.fileCount).toBe(2);
    expect(summary.additions).toBe(13);
    expect(summary.deletions).toBe(1);
    expect(summary.summary).toContain('+13 -1');
  });
});

describe('ChangeEventProjector', () => {
  it('captures a baseline and projects change.* events correlated to a thread', async () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'base.txt'), 'v1');
    commitAll(dir, 'base');

    const events = await SqliteEngineeringEventStore.open(path.join(dir, 'events.db'));
    const projector = new ChangeEventProjector({ events, workspaceId: 'ws-1', environmentId: 'env-1', root: dir });

    await projector.captureBaseline({ threadId: 'thread-1' as never, taskId: 'TASK-1', agentId: 'dev' });

    // Modify + add + remove files, then project.
    fs.writeFileSync(path.join(dir, 'base.txt'), 'v2-changed');
    fs.writeFileSync(path.join(dir, 'new.txt'), 'added');
    fs.rmSync(path.join(dir, 'other.txt'), { force: true });
    const changes = await projector.projectChanges({ threadId: 'thread-1' as never, taskId: 'TASK-1', agentId: 'dev' });

    const stored = events.query({ threadId: 'thread-1' }).filter((event) => event.source === 'change-projection');
    const types = stored.map((event) => event.type);
    expect(types).toContain('change.baseline.captured');
    expect(types).toContain('change.file.created');
    expect(types).toContain('change.file.updated');
    expect(types).toContain('change.diff.updated');
    expect(types).toContain('change.summary.updated');
    expect(stored.every((event) => event.threadId === 'thread-1')).toBe(true);
    expect(stored.every((event) => event.correlationId.startsWith('change:thread-1:'))).toBe(true);
    expect(changes.some((change) => change.path === 'new.txt' && change.operation === 'created')).toBe(true);
    expect(changes.some((change) => change.path === 'base.txt' && change.operation === 'updated')).toBe(true);
    events.close();
  });

  it('merges git numstat into projected changes on a real repo', async () => {
    const dir = tmpRepo();
    fs.writeFileSync(path.join(dir, 'count.ts'), 'line1\nline2\nline3\n');
    commitAll(dir, 'base');
    fs.writeFileSync(path.join(dir, 'count.ts'), 'line1\nline2\nline3\nline4\nline5\n');
    const stats = await gitDiffStats(dir);
    const count = stats.find((stat) => stat.path === 'count.ts');
    expect(count).toBeDefined();
    expect(count!.additions).toBe(2);
  });
});
