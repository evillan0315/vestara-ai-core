import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { EvidenceArtifact, HarnessVerificationResult } from '@vestara/types';

export type EngineeringVerificationProfile = 'focused' | 'standard' | 'strict';

export interface EngineeringVerificationProgress {
  readonly checkId: string;
  readonly phase: 'started' | 'stdout' | 'stderr' | 'completed';
  readonly content: string;
}

export interface EngineeringVerificationInput {
  readonly workspaceRoot: string;
  readonly changedFiles: readonly string[];
  readonly profile?: EngineeringVerificationProfile;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: EngineeringVerificationProgress) => void;
}

interface PackageTarget {
  readonly root: string;
  readonly name?: string;
  readonly scripts: Readonly<Record<string, string>>;
  readonly changedFiles: readonly string[];
}

interface SelectedCheck {
  readonly id: string;
  readonly name: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly mandatory: boolean;
}

interface CheckExecution {
  readonly status: 'passed' | 'failed' | 'blocked';
  readonly summary: string;
  readonly evidence?: EvidenceArtifact;
}

const MAX_OUTPUT = 1024 * 1024;

export class EngineeringVerificationProfiles {
  async verify(input: EngineeringVerificationInput): Promise<HarnessVerificationResult> {
    const root = path.resolve(input.workspaceRoot);
    const files = [...new Set(input.changedFiles.map((file) => normalizeChangedFile(root, file)))];
    if (files.length === 0) {
      return {
        status: 'passed',
        checks: [
          {
            id: 'no-changes',
            name: 'Change-aware verification',
            status: 'skipped',
            summary: 'No files were modified by this turn',
          },
        ],
        evidence: [],
        uncoveredRisks: ['No executable verification was required because the turn made no file changes'],
        confidence: 0.8,
      };
    }

    const manager = detectPackageManager(root);
    const targets = packageTargets(root, files);
    const packageChecks = selectChecks(root, manager, targets, input.profile ?? 'standard');
    if (packageChecks.length === 0) {
      return {
        status: 'inconclusive',
        checks: [
          {
            id: 'no-profile-checks',
            name: 'Verification profile selection',
            status: 'blocked',
            summary: `No build or test scripts cover ${files.join(', ')}`,
          },
        ],
        evidence: [],
        uncoveredRisks: ['Changed files have no deterministic verification command'],
        confidence: 0.25,
      };
    }
    const checks: readonly SelectedCheck[] = [
      ...(fs.existsSync(path.join(root, '.git'))
        ? [
            {
              id: 'git-diff-check',
              name: 'Git change inspection',
              executable: 'git',
              args: ['diff', '--check', '--', ...files],
              cwd: root,
              mandatory: true,
            },
          ]
        : []),
      ...packageChecks,
    ];

    const results: Array<SelectedCheck & CheckExecution> = [];
    for (const check of checks) {
      if (input.signal?.aborted) {
        results.push({ ...check, status: 'blocked', summary: 'Verification cancelled' });
        break;
      }
      results.push({ ...check, ...(await executeCheck(check, root, input)) });
      if (results.at(-1)?.status === 'failed' && check.mandatory) break;
    }

    const mandatoryFailure = results.some((result) => result.mandatory && result.status === 'failed');
    const blocked = results.some((result) => result.mandatory && result.status === 'blocked');
    const immutableImplementation = !fs.existsSync(path.join(root, '.git')) || gitPathsAreCommitted(root, files);
    return {
      status: mandatoryFailure ? 'failed' : blocked ? 'blocked' : immutableImplementation ? 'passed' : 'inconclusive',
      checks: results.map((result) => ({
        id: result.id,
        name: result.name,
        status: result.status,
        summary: result.summary,
      })),
      evidence: results.flatMap((result) => (result.evidence ? [result.evidence] : [])),
      uncoveredRisks: mandatoryFailure
        ? ['At least one mandatory verification check failed']
        : blocked
          ? ['Mandatory verification did not complete']
          : immutableImplementation
            ? []
            : ['Changed files are not committed; verification cannot be bound to an immutable implementation commit'],
      confidence: mandatoryFailure ? 0.1 : blocked ? 0.3 : immutableImplementation ? 0.98 : 0.6,
    };
  }
}

function normalizeChangedFile(root: string, file: string): string {
  const absolute = path.resolve(root, file);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`Changed file escapes workspace: ${file}`);
  return relative;
}

function detectPackageManager(root: string): 'pnpm' | 'npm' | 'yarn' {
  if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function packageTargets(root: string, files: readonly string[]): readonly PackageTarget[] {
  const grouped = new Map<string, string[]>();
  for (const file of files) {
    let directory = path.dirname(path.join(root, file));
    while (directory.startsWith(root)) {
      if (fs.existsSync(path.join(directory, 'package.json'))) break;
      if (directory === root) break;
      directory = path.dirname(directory);
    }
    const target = fs.existsSync(path.join(directory, 'package.json')) ? directory : root;
    grouped.set(target, [...(grouped.get(target) ?? []), file]);
  }
  return [...grouped.entries()].map(([targetRoot, changedFiles]) => {
    const manifestPath = path.join(targetRoot, 'package.json');
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
    return { root: targetRoot, name: manifest.name, scripts: manifest.scripts ?? {}, changedFiles };
  });
}

function selectChecks(
  workspaceRoot: string,
  manager: 'pnpm' | 'npm' | 'yarn',
  targets: readonly PackageTarget[],
  profile: EngineeringVerificationProfile,
): readonly SelectedCheck[] {
  const selected: SelectedCheck[] = [];
  for (const target of targets) {
    const scripts =
      profile === 'focused' ? ['test'] : profile === 'standard' ? ['build', 'test'] : ['lint', 'build', 'test'];
    for (const script of scripts) {
      if (!target.scripts[script]) continue;
      const identity = target.name ?? path.basename(target.root);
      const args = packageScriptArgs(workspaceRoot, manager, target, script);
      selected.push({
        id: `${script}-${identity.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
        name: `${identity} ${script}`,
        executable: manager,
        args,
        cwd: target.root,
        mandatory: script === 'build' || script === 'test',
      });
    }
  }
  return selected;
}

function packageScriptArgs(
  workspaceRoot: string,
  manager: 'pnpm' | 'npm' | 'yarn',
  target: PackageTarget,
  script: string,
): readonly string[] {
  const isWorkspaceRoot = path.resolve(target.root) === path.resolve(workspaceRoot);
  if (!isWorkspaceRoot && manager === 'pnpm' && target.name) return ['--filter', target.name, 'run', script];
  if (!isWorkspaceRoot && manager === 'npm' && target.name) return ['--workspace', target.name, 'run', script];
  if (!isWorkspaceRoot && manager === 'yarn' && target.name) return ['workspace', target.name, script];
  return ['run', script];
}

async function executeCheck(
  check: SelectedCheck,
  workspaceRoot: string,
  input: EngineeringVerificationInput,
): Promise<CheckExecution> {
  input.onProgress?.({ checkId: check.id, phase: 'started', content: `${check.executable} ${check.args.join(' ')}` });
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(check.executable, [...check.args], {
      cwd: check.cwd,
      detached: process.platform !== 'win32',
      shell: false,
      env: { PATH: process.env.PATH, CI: '1', FORCE_COLOR: '0', NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stop = (): void => {
      if (!child.pid || child.killed) return;
      try {
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
        else child.kill('SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    };
    input.signal?.addEventListener('abort', stop, { once: true });
    const timer = setTimeout(stop, 120_000);
    timer.unref();
    child.stdout.on('data', (chunk: Buffer) => {
      const content = chunk.toString('utf8');
      stdout = appendOutput(stdout, content);
      input.onProgress?.({ checkId: check.id, phase: 'stdout', content });
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const content = chunk.toString('utf8');
      stderr = appendOutput(stderr, content);
      input.onProgress?.({ checkId: check.id, phase: 'stderr', content });
    });
    child.once('error', (error) => finish('failed', error.message, null));
    child.once('close', (exitCode, signal) => {
      if (input.signal?.aborted) finish('blocked', 'Verification cancelled', exitCode);
      else if (exitCode === 0) finish('passed', `${check.name} passed`, exitCode);
      else finish('failed', stderr.trim() || `${check.name} exited ${exitCode ?? signal}`, exitCode);
    });

    function finish(status: CheckExecution['status'], summary: string, exitCode: number | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', stop);
      const durationMs = Date.now() - startedAt;
      input.onProgress?.({ checkId: check.id, phase: 'completed', content: summary });
      resolve({
        status,
        summary,
        evidence: {
          id: `verification-${check.id}-${startedAt}`,
          kind: 'test',
          summary,
          metadata: {
            command: check.executable,
            args: check.args,
            cwd: path.relative(workspaceRoot, check.cwd) || '.',
            exitCode,
            stdout,
            stderr,
            durationMs,
            mandatory: check.mandatory,
          },
        },
      });
    }
  });
}

function appendOutput(current: string, content: string): string {
  const remaining = MAX_OUTPUT - Buffer.byteLength(current);
  if (remaining <= 0) return current;
  return current + Buffer.from(content).subarray(0, remaining).toString('utf8');
}

function gitPathsAreCommitted(root: string, files: readonly string[]): boolean {
  try {
    const result = spawnSync('git', ['status', '--porcelain', '--', ...files], {
      cwd: root,
      encoding: 'utf8',
      timeout: 10_000,
    });
    return result.status === 0 && !result.stdout.trim();
  } catch {
    return false;
  }
}
