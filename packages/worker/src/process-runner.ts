import { spawn } from 'node:child_process';

export interface SubprocessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunCommandOptions {
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly timeoutMs?: number;
  /** Run through the shell (enables quoting/globbing). Default false. */
  readonly shell?: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Run a command to completion, capturing stdout/stderr. Rejects on non-zero
 * exit or timeout. `shell: true` runs through the shell for quoting/globbing;
 * otherwise the command is spawned directly with args (no interpolation).
 */
export function runCommand(command: string, options?: RunCommandOptions): Promise<SubprocessResult> {
  return new Promise((resolve, reject) => {
    const shell = options?.shell ?? false;
    const args = shell ? [] : [...(options?.args ?? [])];
    const child = spawn(command, args, {
      cwd: options?.cwd,
      shell,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code ?? -1, stdout, stderr });
    });
  });
}
