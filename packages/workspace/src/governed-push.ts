/**
 * CI-PUSH-001 — Governed push producer (smallest production boundary).
 *
 * Converts an authorized development result into a governed Git commit + push
 * and registers the CI external-verification wait BEFORE the network push, so
 * a GitHub completion can always resume the originating WorkflowTask.
 *
 * Resolved CI-OBS-002C decisions (see docs/ci-obs-002c-decision-resolution.md):
 *   - H1 registration precedes the push (race-free; the task store wait is
 *     durable and idempotent on the deterministic correlation id).
 *   - H4 protected/integration branches are refused unless an explicit
 *     integration-branch authority is supplied.
 *   - H5 idempotency is satisfied by the deterministic wait reference plus the
 *     durable `externalWait` projection — no second push record.
 *   - H6 the boundary is hosted in this integration module for the first
 *     slice; it can be extracted to a dedicated package if it grows.
 *
 * Authority boundaries (never blurred):
 *   - Commit authority ≠ push authority (separate gate + branch guard).
 *   - Push authority ≠ merge authority (no force, no rewrite, no merge).
 *   - Observation ≠ authorization; CI failure ≠ repair authority.
 *   - No automated commit outside this explicit producer; no merge.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 2 * 1024 * 1024;

// ─── Ports ──────────────────────────────────────────────────────────

/** Git mechanics required by the producer. Never exposes credentials. */
export interface GitPort {
  currentBranch(): Promise<string>;
  add(paths: readonly string[]): Promise<void>;
  hasStagedChanges(): Promise<boolean>;
  commit(message: string): Promise<void>;
  headSha(): Promise<string>;
  remoteUrl(): Promise<string | undefined>;
  /** Push the branch to `origin`. Implementations MUST NOT accept force/flags. */
  push(branch: string): Promise<void>;
}

/** Authoritative coordinator port (workflow task store boundary). */
export interface GovernedPushCoordinator {
  beginExternalVerificationWait(input: {
    readonly taskId: string;
    readonly verifier: 'ci';
    readonly waitRef: string;
    readonly repository: string;
    readonly commitSha: string;
    readonly branch: string;
    readonly provider?: string;
    readonly runRef?: string;
    readonly originatingWorkflowRunId?: string;
    readonly originatingOperationId?: string;
    readonly suspendedAt?: string;
  }): Promise<void>;
  /** Roll back a wait whose push never landed (task → in-progress | failed). */
  abortExternalVerificationWait(input: {
    readonly taskId: string;
    readonly waitRef: string;
    readonly reason: string;
    readonly terminal?: boolean;
  }): Promise<void>;
}

// ─── Vocabulary ─────────────────────────────────────────────────────

export interface GovernedPushWait {
  readonly waitRef: string;
  readonly commitSha: string;
  readonly runRef?: string;
  readonly resumedAt?: string;
  readonly decisionRef?: string;
}

export interface GovernedPushEvidence {
  readonly status: 'passed' | 'failed' | 'inconclusive' | 'blocked';
  readonly summary?: string;
}

export interface GovernedPushInput {
  readonly taskId: string;
  /** Authoritative task status read from the task store. */
  readonly taskStatus: string;
  readonly paths: readonly string[];
  readonly commitMessage: string;
  /** Target branch; defaults to the current branch. */
  readonly branch?: string;
  /** Owner/name override; otherwise derived from the git remote. */
  readonly repository?: string;
  /** Originating operation (e.g. harness turn) — optional lineage. */
  readonly operationId?: string;
  readonly workflowRunId?: string;
  readonly evidence?: GovernedPushEvidence;
  /** Human approval for otherwise-blocked (sensitive) paths. */
  readonly approved?: boolean;
  /** Explicit grant to target a protected/integration branch. */
  readonly integrationAuthority?: boolean;
  /** Present when retrying after a prior wait registration. */
  readonly existingWait?: GovernedPushWait;
}

export type GovernedPushPhase = 'gate' | 'commit' | 'register' | 'push' | 'done';

export type GovernedPushResult =
  | {
      readonly status: 'pushed';
      readonly phase: 'done';
      readonly branch: string;
      readonly repository: string;
      readonly commitSha: string;
      readonly waitRef: string;
      /** Originating operation lineage (caller-supplied or minted). */
      readonly operationId: string;
      readonly pushedAt: string;
    }
  | { readonly status: 'hold'; readonly phase: GovernedPushPhase; readonly reason: string }
  | {
      readonly status: 'failed';
      readonly phase: GovernedPushPhase;
      readonly reason: string;
      readonly commitSha?: string;
      readonly waitRef?: string;
      readonly rollback?: 'in-progress' | 'failed';
    };

// ─── Branch guard (pure) ────────────────────────────────────────────

export interface BranchGuardPolicy {
  /** Branches that require explicit integration authority. */
  readonly protectedBranches?: readonly string[];
  /** Allowed task/feature-branch prefixes. */
  readonly allowedPrefixes?: readonly string[];
}

export interface BranchGuardInput {
  readonly current: string;
  readonly target: string;
  readonly integrationAuthority?: boolean;
}

export type BranchGuardResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const DEFAULT_PROTECTED = ['main', 'master'] as const;
const DEFAULT_PREFIXES = ['vestara/'] as const;
const SAFE_BRANCH = /^[a-zA-Z0-9._/-]+$/;

/**
 * Inspect the current AND target branch before pushing. Refuses protected /
 * integration targets unless explicit authority is supplied, refuses
 * unsafe ref names, and refuses to push a branch that is not checked out.
 */
export function evaluateBranchGuard(input: BranchGuardInput, policy: BranchGuardPolicy = {}): BranchGuardResult {
  const protectedBranches = (policy.protectedBranches ?? DEFAULT_PROTECTED).map((b) => b.toLowerCase());
  const allowedPrefixes = policy.allowedPrefixes ?? DEFAULT_PREFIXES;
  const target = input.target.trim();

  if (!target) return { ok: false, reason: 'Target branch is required' };
  if (!SAFE_BRANCH.test(target) || target.includes('..') || target.startsWith('-') || target.startsWith('refs/')) {
    return { ok: false, reason: `Unsafe target branch name: ${target}` };
  }
  if (input.current !== target) {
    return { ok: false, reason: `Current branch "${input.current}" does not match target "${target}"` };
  }
  if (protectedBranches.includes(target.toLowerCase()) && !input.integrationAuthority) {
    return {
      ok: false,
      reason: `Target "${target}" is a protected/integration branch; explicit integration-branch authority is required`,
    };
  }
  if (
    allowedPrefixes.length > 0 &&
    !allowedPrefixes.some((prefix) => target.startsWith(prefix)) &&
    !input.integrationAuthority
  ) {
    return {
      ok: false,
      reason: `Target "${target}" is not an authorized task/feature branch (expected prefix: ${allowedPrefixes.join(', ')})`,
    };
  }
  return { ok: true };
}

// ─── Pure helpers ───────────────────────────────────────────────────

/** Deterministic push↔task correlation id (mirrors CI-OBS-002A derivation). */
export function deriveCorrelationId(repository: string, commitSha: string, taskId: string): string {
  return `ci-corr:${repository}:${commitSha}:${taskId}`;
}

/** Derive owner/name from a GitHub remote URL. Returns undefined when unknown. */
export function parseRepositoryFromRemote(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const match = /github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : undefined;
}

const SENSITIVE_PATTERNS = [/\.env($|\.)/i, /\.pem$/i, /\.key$/i, /secret/i, /credential/i];

/** Validate explicit relative workspace paths. Returns an error string or null. */
export function validatePushPaths(paths: readonly string[]): string | null {
  if (paths.length === 0) return 'At least one explicit path is required';
  for (const value of paths) {
    if (!value || value.startsWith('-')) return `Unsafe path: ${value}`;
    if (value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value)) return `Absolute paths are not allowed: ${value}`;
    const normalized = value.split('\\').join('/');
    if (normalized.split('/').includes('..')) return `Paths must not escape the workspace: ${value}`;
  }
  return null;
}

/** First sensitive path in the set, if any. */
export function sensitivePath(paths: readonly string[]): string | undefined {
  return paths.find((path) => SENSITIVE_PATTERNS.some((pattern) => pattern.test(path)));
}

// ─── Service ────────────────────────────────────────────────────────

export interface GovernedPushDeps {
  readonly git: GitPort;
  readonly coordinator: GovernedPushCoordinator;
  readonly branchPolicy?: BranchGuardPolicy;
  readonly provider?: string;
  readonly now?: () => string;
}

export class GovernedPushService {
  constructor(private readonly deps: GovernedPushDeps) {}

  async execute(input: GovernedPushInput): Promise<GovernedPushResult> {
    const now = this.deps.now?.() ?? new Date().toISOString();

    // ── Gate ────────────────────────────────────────────────────────
    const pathError = validatePushPaths(input.paths);
    if (pathError) return hold('gate', pathError);
    if (!input.commitMessage.trim()) return hold('gate', 'A commit message is required');

    const retry = input.existingWait !== undefined;
    const allowedStatus = input.taskStatus === 'in-progress' || (input.taskStatus === 'awaiting-verification' && retry);
    if (!allowedStatus) {
      return hold('gate', `Task ${input.taskId} is ${input.taskStatus}; expected in-progress`);
    }
    if (retry && input.existingWait?.resumedAt) {
      return hold('gate', `Wait ${input.existingWait.waitRef} was already resumed`);
    }
    if (input.evidence?.status === 'failed') return hold('gate', 'Local verification failed');
    if (!input.approved) {
      const sensitive = sensitivePath(input.paths);
      if (sensitive) return hold('gate', `Sensitive path "${sensitive}" requires explicit approval`);
    }

    // ── Branch invariant (inspect current AND target) ───────────────
    const current = await this.deps.git.currentBranch();
    const target = input.branch ?? current;
    const guard = evaluateBranchGuard(
      {
        current,
        target,
        ...(input.integrationAuthority !== undefined ? { integrationAuthority: input.integrationAuthority } : {}),
      },
      this.deps.branchPolicy ?? {},
    );
    if (!guard.ok) return hold('gate', guard.reason);

    // ── Commit (skipped when retrying an existing wait) ─────────────
    let commitSha: string;
    if (input.existingWait) {
      commitSha = input.existingWait.commitSha;
      const head = await this.deps.git.headSha();
      if (head !== commitSha) {
        return hold('gate', `HEAD ${head} moved beyond the registered commit ${commitSha}`);
      }
    } else {
      await this.deps.git.add(input.paths);
      if (!(await this.deps.git.hasStagedChanges())) {
        return failed('commit', 'No staged changes to commit');
      }
      await this.deps.git.commit(input.commitMessage.trim());
      commitSha = await this.deps.git.headSha();
    }

    // ── Repository identity ─────────────────────────────────────────
    const repository = input.repository ?? parseRepositoryFromRemote(await this.deps.git.remoteUrl());
    if (!repository) {
      return hold('commit', 'Repository identity (owner/name) could not be derived from the git remote');
    }

    // ── Register the CI wait BEFORE the push (H1) ───────────────────
    // Operation lineage: the caller's operation id when supplied, otherwise a
    // deterministic id for the governed-push operation itself.
    const operationId = input.operationId ?? `op:governed-push:${input.taskId}:${commitSha}`;
    let waitRef: string;
    if (input.existingWait) {
      waitRef = input.existingWait.waitRef;
    } else {
      waitRef = deriveCorrelationId(repository, commitSha, input.taskId);
      try {
        await this.deps.coordinator.beginExternalVerificationWait({
          taskId: input.taskId,
          verifier: 'ci',
          waitRef,
          repository,
          commitSha,
          branch: target,
          provider: this.deps.provider ?? 'github-actions',
          ...(input.workflowRunId !== undefined ? { originatingWorkflowRunId: input.workflowRunId } : {}),
          originatingOperationId: operationId,
          suspendedAt: now,
        });
      } catch (error) {
        return failed('register', error instanceof Error ? error.message : 'Failed to register the CI wait');
      }
    }

    // ── Push (non-atomic external boundary) ─────────────────────────
    try {
      await this.deps.git.push(target);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'git push failed';
      await this.deps.coordinator
        .abortExternalVerificationWait({ taskId: input.taskId, waitRef, reason, terminal: false })
        .catch(() => undefined);
      return { status: 'failed', phase: 'push', reason, commitSha, waitRef, rollback: 'in-progress' };
    }

    return {
      status: 'pushed',
      phase: 'done',
      branch: target,
      repository,
      commitSha,
      waitRef,
      operationId,
      pushedAt: now,
    };
  }
}

// ─── Exec git port ──────────────────────────────────────────────────

/** GitPort backed by the `git` binary. No credentials are read or returned. */
export class ExecGitPort implements GitPort {
  constructor(private readonly cwd: string) {}

  private async run(args: readonly string[]): Promise<string> {
    const result = await execFileAsync('git', [...args], {
      cwd: this.cwd,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT,
      timeout: 120_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1' },
    });
    return result.stdout;
  }

  async currentBranch(): Promise<string> {
    return (await this.run(['branch', '--show-current'])).trim();
  }

  async add(paths: readonly string[]): Promise<void> {
    await this.run(['add', '--', ...paths]);
  }

  async hasStagedChanges(): Promise<boolean> {
    return (await this.run(['diff', '--cached', '--name-only'])).trim().length > 0;
  }

  async commit(message: string): Promise<void> {
    // Mirrors the accepted governed `git.commit` tool: repository hooks are
    // bypassed so the governed boundary owns the commit, not ambient policy.
    await this.run(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', message]);
  }

  async headSha(): Promise<string> {
    return (await this.run(['rev-parse', 'HEAD'])).trim();
  }

  async remoteUrl(): Promise<string | undefined> {
    try {
      const url = (await this.run(['config', '--get', 'remote.origin.url'])).trim();
      return url.length > 0 ? url : undefined;
    } catch {
      return undefined;
    }
  }

  async push(branch: string): Promise<void> {
    // Fixed argv: no force, no mirror, no delete, no refs — ever.
    await this.run(['push', '--set-upstream', 'origin', branch]);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function hold(phase: GovernedPushPhase, reason: string): GovernedPushResult {
  return { status: 'hold', phase, reason };
}

function failed(phase: GovernedPushPhase, reason: string): GovernedPushResult {
  return { status: 'failed', phase, reason };
}
