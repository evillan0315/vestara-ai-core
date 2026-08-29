import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorktreeLeaseRuntime } from '../src/index.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(): { root: string; repository: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-worktree-'));
  roots.push(root);
  const repository = path.join(root, 'repository');
  fs.mkdirSync(repository);
  execFileSync('git', ['init', '-b', 'main'], { cwd: repository });
  execFileSync('git', ['config', 'user.email', 'test@vestara.local'], { cwd: repository });
  execFileSync('git', ['config', 'user.name', 'Vestara Test'], { cwd: repository });
  fs.writeFileSync(path.join(repository, 'README.md'), 'Vestara\n');
  execFileSync('git', ['add', 'README.md'], { cwd: repository });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: repository });
  return { root, repository };
}

describe('WorktreeLeaseRuntime', () => {
  it('acquires durable isolated worktrees and detects file ownership conflicts', async () => {
    const { root, repository } = fixture();
    const dbPath = path.join(root, 'state', 'leases.db');
    const leaseRoot = path.join(root, 'worktrees');
    const first = await WorktreeLeaseRuntime.open({ dbPath, leaseRoot });
    const one = first.acquire({ taskId: 'TASK-1', agentId: 'developer-1', repositoryRoot: repository });
    const two = first.acquire({ taskId: 'TASK-2', agentId: 'developer-2', repositoryRoot: repository });
    expect(one.worktreePath).not.toBe(two.worktreePath);
    expect(fs.existsSync(path.join(one.worktreePath, 'README.md'))).toBe(true);
    first.claimFiles(one.id, ['packages/tui/src/app.tsx']);
    expect(() => first.claimFiles(two.id, ['packages/tui/src/app.tsx'])).toThrow('already leased');
    first.close();

    const reopened = await WorktreeLeaseRuntime.open({ dbPath, leaseRoot });
    expect(reopened.get(one.id)?.baseRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(reopened.list({ activeOnly: true })).toHaveLength(2);
    reopened.release(one.id);
    reopened.release(two.id);
    expect(reopened.list({ activeOnly: true })).toHaveLength(0);
    reopened.close();
  });

  it('refuses dirty release and reconciles missing worktrees as orphaned', async () => {
    const { root, repository } = fixture();
    const runtime = await WorktreeLeaseRuntime.open({
      dbPath: path.join(root, 'leases.db'),
      leaseRoot: path.join(root, 'worktrees'),
    });
    const dirty = runtime.acquire({ taskId: 'TASK-DIRTY', agentId: 'developer-dirty', repositoryRoot: repository });
    fs.writeFileSync(path.join(dirty.worktreePath, 'dirty.txt'), 'pending');
    expect(() => runtime.release(dirty.id)).toThrow('uncommitted');
    runtime.release(dirty.id, { force: true });

    const missing = runtime.acquire({
      taskId: 'TASK-MISSING',
      agentId: 'developer-missing',
      repositoryRoot: repository,
    });
    execFileSync('git', ['worktree', 'remove', '--force', missing.worktreePath], { cwd: repository });
    expect(runtime.recover()).toEqual([expect.objectContaining({ id: missing.id, status: 'orphaned' })]);
    runtime.close();
  });
});
