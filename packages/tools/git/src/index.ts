import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import type { ToolExecutionContext, ToolExecutionResult, ToolInputSchema, VestaraTool } from '@vestara/tool-runtime';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 2 * 1024 * 1024;

interface GitCommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly args: readonly string[];
  readonly durationMs: number;
}

type GitStatusInput = {};
interface GitDiffInput {
  readonly staged?: boolean;
  readonly paths?: readonly string[];
}
interface GitLogInput {
  readonly maxCount?: number;
  readonly path?: string;
}
interface GitAddInput {
  readonly paths: readonly string[];
}
interface GitCommitInput {
  readonly message: string;
  readonly paths: readonly string[];
}

function record(input: unknown): Readonly<Record<string, unknown>> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Git input must be an object');
  return input as Record<string, unknown>;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
  return value;
}

function paths(value: unknown, required = false): readonly string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || (required && value.length === 0) || value.some((item) => typeof item !== 'string'))
    throw new Error('paths must be a non-empty array of strings');
  return value.map((item) => validatePath(item));
}

function validatePath(value: string): string {
  if (!value || value.startsWith('-') || path.isAbsolute(value) || path.normalize(value).startsWith('..'))
    throw new Error(`Unsafe Git path: ${value}`);
  return value;
}

async function git(
  args: readonly string[],
  context: ToolExecutionContext,
): Promise<ToolExecutionResult<GitCommandResult>> {
  if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
  const startedAt = Date.now();
  context.reportProgress?.({ stream: 'status', content: `git ${args[0] ?? ''}` });
  try {
    const result = await execFileAsync('git', [...args], {
      cwd: context.environment.workspaceRoot,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT,
      timeout: 60_000,
      signal: context.signal,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_TERMINAL_PROMPT: '0', NO_COLOR: '1' },
    });
    const output: GitCommandResult = {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: 0,
      args,
      durationMs: Date.now() - startedAt,
    };
    if (result.stdout) context.reportProgress?.({ stream: 'stdout', content: result.stdout });
    if (result.stderr) context.reportProgress?.({ stream: 'stderr', content: result.stderr });
    return {
      status: 'completed',
      output,
      evidence: [
        {
          id: `git-${startedAt}`,
          kind: 'command',
          summary: `git ${args[0]} completed`,
          metadata: { ...output },
        },
      ],
    };
  } catch (error: any) {
    if (context.signal.aborted || error?.name === 'AbortError') return { status: 'cancelled', evidence: [] };
    const stdout = String(error?.stdout ?? '');
    const stderr = String(error?.stderr ?? error?.message ?? 'Git command failed');
    return {
      status: 'failed',
      error: stderr.trim(),
      output: { stdout, stderr, exitCode: Number(error?.code) || 1, args, durationMs: Date.now() - startedAt },
      evidence: [],
    };
  }
}

const emptySchema: ToolInputSchema<GitStatusInput> = {
  jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
  parse(input) {
    record(input);
    return {};
  },
};

export class GitStatusTool implements VestaraTool<GitStatusInput, GitCommandResult> {
  readonly name = 'git.status';
  readonly description = 'Inspect the current branch and machine-readable working tree status';
  readonly risk = 'low' as const;
  readonly inputSchema = emptySchema;
  affectedResources(): readonly string[] {
    return ['.git', '.'];
  }
  execute(_input: GitStatusInput, context: ToolExecutionContext) {
    return git(['status', '--short', '--branch', '--untracked-files=all'], context);
  }
}

export class GitDiffTool implements VestaraTool<GitDiffInput, GitCommandResult> {
  readonly name = 'git.diff';
  readonly description = 'Inspect staged or unstaged changes, optionally restricted to workspace paths';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<GitDiffInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean' },
        paths: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    parse(input) {
      const value = record(input);
      return { staged: optionalBoolean(value.staged, 'staged'), paths: paths(value.paths) };
    },
  };
  affectedResources(input: GitDiffInput): readonly string[] {
    return input.paths?.length ? input.paths : ['.'];
  }
  execute(input: GitDiffInput, context: ToolExecutionContext) {
    return git(['diff', ...(input.staged ? ['--cached'] : []), '--no-ext-diff', '--', ...(input.paths ?? [])], context);
  }
}

export class GitLogTool implements VestaraTool<GitLogInput, GitCommandResult> {
  readonly name = 'git.log';
  readonly description = 'Inspect recent commit history, optionally for one workspace path';
  readonly risk = 'low' as const;
  readonly inputSchema: ToolInputSchema<GitLogInput> = {
    jsonSchema: {
      type: 'object',
      properties: { maxCount: { type: 'number', minimum: 1, maximum: 100 }, path: { type: 'string' } },
      additionalProperties: false,
    },
    parse(input) {
      const value = record(input);
      if (value.maxCount !== undefined && (typeof value.maxCount !== 'number' || !Number.isFinite(value.maxCount)))
        throw new Error('maxCount must be a number');
      if (value.path !== undefined && typeof value.path !== 'string') throw new Error('path must be a string');
      return {
        maxCount: Math.max(1, Math.min(100, Math.floor((value.maxCount as number | undefined) ?? 10))),
        path: value.path === undefined ? undefined : validatePath(value.path),
      };
    },
  };
  affectedResources(input: GitLogInput): readonly string[] {
    return [input.path ?? '.git'];
  }
  execute(input: GitLogInput, context: ToolExecutionContext) {
    return git(
      [
        'log',
        `--max-count=${input.maxCount ?? 10}`,
        '--format=%H%x09%aI%x09%an%x09%s',
        ...(input.path ? ['--', input.path] : []),
      ],
      context,
    );
  }
}

export class GitAddTool implements VestaraTool<GitAddInput, GitCommandResult> {
  readonly name = 'git.add';
  readonly description = 'Stage an explicit list of workspace paths after approval';
  readonly risk = 'high' as const;
  readonly inputSchema: ToolInputSchema<GitAddInput> = {
    jsonSchema: {
      type: 'object',
      properties: { paths: { type: 'array', items: { type: 'string' }, minItems: 1 } },
      required: ['paths'],
      additionalProperties: false,
    },
    parse(input) {
      return { paths: paths(record(input).paths, true) as readonly string[] };
    },
  };
  affectedResources(input: GitAddInput): readonly string[] {
    return input.paths;
  }
  execute(input: GitAddInput, context: ToolExecutionContext) {
    return git(['add', '--', ...input.paths], context);
  }
}

export class GitCommitTool implements VestaraTool<GitCommitInput, GitCommandResult> {
  readonly name = 'git.commit';
  readonly description = 'Commit the currently staged changes with an explicit message after approval';
  readonly risk = 'high' as const;
  readonly inputSchema: ToolInputSchema<GitCommitInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', minLength: 1, maxLength: 5000 },
        paths: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['message', 'paths'],
      additionalProperties: false,
    },
    parse(input) {
      const message = record(input).message;
      if (typeof message !== 'string' || !message.trim() || message.length > 5000)
        throw new Error('message must be between 1 and 5000 characters');
      return { message: message.trim(), paths: paths(record(input).paths, true) as readonly string[] };
    },
  };
  affectedResources(input: GitCommitInput): readonly string[] {
    return input.paths;
  }
  async execute(input: GitCommitInput, context: ToolExecutionContext) {
    const staged = await git(['diff', '--cached', '--name-only'], context);
    if (staged.status !== 'completed') return staged;
    const actual = new Set((staged.output?.stdout ?? '').split('\n').filter(Boolean));
    if (actual.size !== input.paths.length || input.paths.some((file) => !actual.has(file))) {
      return {
        status: 'failed' as const,
        error: 'Staged files changed after approval preview; inspect status and request approval again',
        evidence: staged.evidence,
      };
    }
    return git(['-c', 'core.hooksPath=/dev/null', 'commit', '-m', input.message], context);
  }
}

export const governedGitTools = [GitStatusTool, GitDiffTool, GitLogTool, GitAddTool, GitCommitTool] as const;
