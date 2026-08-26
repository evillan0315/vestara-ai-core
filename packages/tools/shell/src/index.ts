/**
 * @vestara/tools-shell — Shell/Bash execution tool
 *
 * Executes shell commands with timeout, output capture, and working directory
 * control. Integrates with the Action Runtime for permission-gated execution.
 *
 * Architecture Traceability:
 *   Foundation: TOOL-CATALOG.md → T-003
 */

import { execSync } from 'node:child_process';
import { isAbsolute, relative, resolve } from 'node:path';
import type { Tool } from '@vestara/action';
import type { ActionRequest, ToolDefinition } from '@vestara/shared';
import type { ToolExecutionContext, ToolExecutionResult, ToolInputSchema, VestaraTool } from '@vestara/tool-runtime';

export const version = '0.1.0';

const SHELL_DEF: ToolDefinition = {
  id: 'vestara.shell.exec',
  name: 'Execute Shell Command',
  description: 'Execute a shell command and return its output. Supports any bash command.',
  version: '1.0.0',
  permissions: 'admin-only',
  requires: ['shell'],
  timeout: 30000,
  sandbox: false,
  streaming: false,
  idempotent: false,
  destructive: true,
  category: 'shell',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      workdir: { type: 'string', description: 'Working directory (defaults to cwd)' },
      timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
    },
    required: ['command'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      exitCode: { type: 'number' },
      command: { type: 'string' },
    },
  },
};

export function createShellTool(): Tool {
  return {
    definition: SHELL_DEF,
    async execute(request: ActionRequest) {
      const command = request.parameters.command as string;
      const workdir = (request.parameters.workdir as string) ?? process.cwd();
      const timeout = (request.parameters.timeout as number) ?? 30000;

      try {
        const stdout = execSync(command, {
          cwd: workdir,
          encoding: 'utf-8',
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        return {
          success: true,
          data: {
            stdout: stdout.trim(),
            stderr: '',
            exitCode: 0,
            command,
          },
          duration: 0,
        };
      } catch (error: any) {
        const stderr = error.stderr?.toString() ?? '';
        const stdout = error.stdout?.toString() ?? '';
        const exitCode = error.status ?? 1;

        return {
          success: exitCode === 0,
          data: {
            stdout: stdout.trim(),
            stderr: stderr.trim() || error.message,
            exitCode,
            command,
          },
          duration: 0,
        };
      }
    },
  };
}

export const shellToolDefinitions = [SHELL_DEF];

interface GovernedShellInput {
  readonly command: string;
  readonly workdir?: string;
  readonly timeoutMs?: number;
}

interface GovernedShellOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly command: string;
  readonly timedOut: boolean;
}

const MAX_SHELL_OUTPUT = 10 * 1024 * 1024;

/**
 * Governed shell execution tool for the ToolRuntime. High risk by design:
 * ToolRuntime policy requires explicit approval before the command runs, and
 * execution is bounded by a timeout and output cap.
 */
export class GovernedShellExecuteTool implements VestaraTool<GovernedShellInput, GovernedShellOutput> {
  readonly name = 'shell.execute';
  readonly description = 'Execute a shell command with output capture and a bounded timeout';
  readonly risk = 'high' as const;
  readonly inputSchema: ToolInputSchema<GovernedShellInput> = {
    jsonSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', minLength: 1 },
        workdir: { type: 'string' },
        timeoutMs: { type: 'number', minimum: 100, maximum: 120_000 },
      },
      required: ['command'],
      additionalProperties: false,
    },
    parse(input) {
      const record = requireObject(input);
      const command = requireString(record, 'command');
      const workdir = optionalString(record, 'workdir');
      const timeoutValue = record.timeoutMs;
      if (timeoutValue !== undefined && (typeof timeoutValue !== 'number' || !Number.isFinite(timeoutValue)))
        throw new Error('Tool input timeoutMs must be a finite number');
      return { command, workdir, timeoutMs: timeoutValue };
    },
  };

  affectedResources(input: GovernedShellInput): readonly string[] {
    return [input.command];
  }

  async execute(
    input: GovernedShellInput,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<GovernedShellOutput>> {
    if (context.signal.aborted) return { status: 'cancelled', evidence: [] };
    const cwd = input.workdir
      ? resolveCwd(context.environment.workspaceRoot, input.workdir)
      : context.environment.workspaceRoot;
    const timeoutMs = input.timeoutMs ?? 30_000;
    try {
      const stdout = execSync(input.command, {
        cwd,
        encoding: 'utf-8',
        timeout: timeoutMs,
        maxBuffer: MAX_SHELL_OUTPUT,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CI: '1', NO_COLOR: '1' },
      });
      return {
        status: 'completed',
        output: { stdout: stdout.trim(), stderr: '', exitCode: 0, command: input.command, timedOut: false },
        evidence: [
          {
            id: `shell-exec-${Date.now()}`,
            kind: 'command',
            summary: `Executed: ${input.command}`,
            metadata: { operation: 'shell.execute', cwd, timeoutMs },
          },
        ],
      };
    } catch (error) {
      const failure = error as {
        stderr?: Buffer | string;
        stdout?: Buffer | string;
        status?: number;
        killed?: boolean;
        message?: string;
      };
      const stderr = (failure.stderr ?? '').toString();
      const stdout = (failure.stdout ?? '').toString();
      const timedOut = Boolean(failure.killed && !failure.status);
      const exitCode = timedOut ? -1 : (failure.status ?? 1);
      return {
        status: timedOut ? 'failed' : 'completed',
        output: {
          stdout: stdout.trim(),
          stderr: stderr.trim() || (timedOut ? 'Command timed out' : (failure.message ?? '')),
          exitCode,
          command: input.command,
          timedOut,
        },
        error: timedOut ? `Command timed out after ${timeoutMs}ms` : undefined,
        evidence: [
          {
            id: `shell-exec-${Date.now()}`,
            kind: 'command',
            summary: `Executed: ${input.command}`,
            metadata: { operation: 'shell.execute', cwd, timeoutMs, exitCode, timedOut },
          },
        ],
      };
    }
  }
}

function requireObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Tool input must be an object');
  return input as Record<string, unknown>;
}

function requireString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Tool input requires non-empty string: ${key}`);
  return value;
}

function optionalString(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`Tool input must be a string: ${key}`);
  return value;
}

function resolveCwd(workspaceRoot: string, workdir: string): string {
  const absolute = isAbsolute(workdir) ? workdir : resolve(workspaceRoot, workdir);
  const rel = relative(workspaceRoot, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Working directory escapes workspace: ${workdir}`);
  return absolute;
}
