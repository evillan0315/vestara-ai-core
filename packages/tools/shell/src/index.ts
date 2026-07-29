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
import type { Tool } from '@vestara/action';
import type { ActionRequest, ToolDefinition } from '@vestara/shared';

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
