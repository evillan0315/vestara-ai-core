import { describe, expect, it } from 'vitest';
import {
  deriveCorrelationId,
  evaluateBranchGuard,
  type GitPort,
  type GovernedPushCoordinator,
  type GovernedPushInput,
  GovernedPushService,
  parseRepositoryFromRemote,
  validatePushPaths,
} from '../src/governed-push';

class FakeGit implements GitPort {
  branch = 'vestara/task-1';
  staged = true;
  head = 'sha-abc';
  remote: string | undefined = 'git@github.com:vestara/core.git';
  pushError?: Error;
  constructor(readonly timeline: string[]) {}

  async currentBranch(): Promise<string> {
    this.timeline.push('currentBranch');
    return this.branch;
  }
  async add(): Promise<void> {
    this.timeline.push('add');
  }
  async hasStagedChanges(): Promise<boolean> {
    this.timeline.push('hasStagedChanges');
    return this.staged;
  }
  async commit(): Promise<void> {
    this.timeline.push('commit');
  }
  async headSha(): Promise<string> {
    this.timeline.push('headSha');
    return this.head;
  }
  async remoteUrl(): Promise<string | undefined> {
    this.timeline.push('remoteUrl');
    return this.remote;
  }
  async push(): Promise<void> {
    this.timeline.push('push');
    if (this.pushError) throw this.pushError;
  }
}

class RecordingCoordinator implements GovernedPushCoordinator {
  constructor(readonly timeline: string[]) {}

  async beginExternalVerificationWait(): Promise<void> {
    this.timeline.push('register-wait');
  }
  async abortExternalVerificationWait(): Promise<void> {
    this.timeline.push('abort-wait');
  }
}

function setup() {
  const timeline: string[] = [];
  const git = new FakeGit(timeline);
  const coordinator = new RecordingCoordinator(timeline);
  const service = new GovernedPushService({ git, coordinator });
  return { timeline, git, coordinator, service };
}

const BASE: GovernedPushInput = {
  taskId: 'task-1',
  taskStatus: 'in-progress',
  paths: ['packages/a/src/index.ts'],
  commitMessage: 'feat(a): governed change',
};

describe('governed push — pure helpers', () => {
  it('parses owner/name from GitHub remotes', () => {
    expect(parseRepositoryFromRemote('git@github.com:vestara/core.git')).toBe('vestara/core');
    expect(parseRepositoryFromRemote('https://github.com/vestara/core.git')).toBe('vestara/core');
    expect(parseRepositoryFromRemote('https://gitlab.com/vestara/core.git')).toBeUndefined();
    expect(parseRepositoryFromRemote(undefined)).toBeUndefined();
  });

  it('derives the deterministic correlation id', () => {
    expect(deriveCorrelationId('vestara/core', 'sha', 'task-1')).toBe('ci-corr:vestara/core:sha:task-1');
  });

  it('refuses unsafe paths', () => {
    expect(validatePushPaths([])).not.toBeNull();
    expect(validatePushPaths(['/etc/passwd'])).not.toBeNull();
    expect(validatePushPaths(['../outside.ts'])).not.toBeNull();
    expect(validatePushPaths(['-rf'])).not.toBeNull();
    expect(validatePushPaths(['src/a.ts', 'src/b.ts'])).toBeNull();
  });

  it('guards protected and non-task branches', () => {
    // Protected/integration targets are refused without explicit authority.
    expect(evaluateBranchGuard({ current: 'main', target: 'main' }).ok).toBe(false);
    expect(evaluateBranchGuard({ current: 'main', target: 'main', integrationAuthority: true }).ok).toBe(true);
    // Non-task branches require the default task/feature prefix (or authority).
    expect(evaluateBranchGuard({ current: 'release/1', target: 'release/1' }).ok).toBe(false);
    expect(evaluateBranchGuard({ current: 'release/1', target: 'release/1', integrationAuthority: true }).ok).toBe(
      true,
    );
    // Authorized task branch is allowed.
    expect(evaluateBranchGuard({ current: 'vestara/task-1', target: 'vestara/task-1' }).ok).toBe(true);
    // The current branch must match the target — never push a branch that is
    // not checked out, even with integration authority.
    expect(evaluateBranchGuard({ current: 'vestara/task-1', target: 'vestara/task-2' }).ok).toBe(false);
  });
});

describe('governed push — service', () => {
  it('registers the CI wait BEFORE pushing and returns the correlation', async () => {
    const { timeline, service } = setup();
    const result = await service.execute(BASE);

    expect(result.status).toBe('pushed');
    if (result.status !== 'pushed') return;
    expect(result.repository).toBe('vestara/core');
    expect(result.commitSha).toBe('sha-abc');
    expect(result.waitRef).toBe('ci-corr:vestara/core:sha-abc:task-1');
    expect(timeline.indexOf('register-wait')).toBeGreaterThanOrEqual(0);
    expect(timeline.indexOf('register-wait')).toBeLessThan(timeline.indexOf('push'));
    expect(timeline.indexOf('commit')).toBeLessThan(timeline.indexOf('register-wait'));
  });

  it('holds when the task is not in-progress', async () => {
    const { timeline, service } = setup();
    const result = await service.execute({ ...BASE, taskStatus: 'assigned' });
    expect(result.status).toBe('hold');
    expect(timeline).toHaveLength(0);
  });

  it('holds sensitive paths without approval', async () => {
    const { service } = setup();
    const result = await service.execute({ ...BASE, paths: ['.env.local'] });
    expect(result.status).toBe('hold');
    if (result.status === 'hold') expect(result.reason).toContain('Sensitive path');
  });

  it('holds protected targets', async () => {
    const { git, service } = setup();
    git.branch = 'main';
    const result = await service.execute(BASE);
    expect(result.status).toBe('hold');
    if (result.status === 'hold') expect(result.reason).toContain('protected');
  });

  it('holds when repository identity cannot be derived', async () => {
    const { git, service } = setup();
    git.remote = undefined;
    const result = await service.execute(BASE);
    expect(result.status).toBe('hold');
    if (result.status === 'hold') expect(result.reason).toContain('Repository identity');
  });

  it('fails without staged changes', async () => {
    const { git, service } = setup();
    git.staged = false;
    const result = await service.execute(BASE);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.phase).toBe('commit');
  });

  it('rolls the wait back to in-progress when the push fails', async () => {
    const { timeline, git, service } = setup();
    git.pushError = new Error('remote rejected');
    const result = await service.execute(BASE);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.phase).toBe('push');
      expect(result.rollback).toBe('in-progress');
      expect(result.commitSha).toBe('sha-abc');
      expect(result.waitRef).toBe('ci-corr:vestara/core:sha-abc:task-1');
    }
    expect(timeline).toContain('abort-wait');
    expect(timeline.indexOf('register-wait')).toBeLessThan(timeline.indexOf('abort-wait'));
  });

  it('retries idempotently without re-committing or re-registering', async () => {
    const { timeline, git, service } = setup();
    const result = await service.execute({
      ...BASE,
      taskStatus: 'awaiting-verification',
      existingWait: { waitRef: 'ci-corr:vestara/core:sha-abc:task-1', commitSha: 'sha-abc' },
    });
    expect(result.status).toBe('pushed');
    expect(timeline).not.toContain('add');
    expect(timeline).not.toContain('commit');
    expect(timeline).not.toContain('register-wait');
    expect(timeline).toContain('push');
    expect(git.head).toBe('sha-abc');
  });

  it('holds when HEAD moved past the registered commit', async () => {
    const { git, service } = setup();
    git.head = 'sha-moved';
    const result = await service.execute({
      ...BASE,
      taskStatus: 'awaiting-verification',
      existingWait: { waitRef: 'ci-corr:vestara/core:sha-abc:task-1', commitSha: 'sha-abc' },
    });
    expect(result.status).toBe('hold');
    if (result.status === 'hold') expect(result.reason).toContain('moved');
  });
});
