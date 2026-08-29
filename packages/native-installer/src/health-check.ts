// Health-check runner for staged native executables. Spawns the staged binary
// in noninteractive mode and parses its health report. Never enters raw mode.

import { spawn } from 'node:child_process';
import { assertIdentityMatch, NativeInstallSecurityError } from './security';

export interface NativeHealthCheckReport {
  readonly ok: boolean;
  readonly packageId: string;
  readonly version: string;
  readonly renderer?: string;
  readonly runtime?: string;
  readonly platform: string;
  readonly terminalRequired?: boolean;
}

export interface HealthCheckOptions {
  readonly manifestId: string;
  readonly manifestVersion: string;
  readonly timeoutMs?: number;
}

export interface HealthCheckResult {
  readonly ok: boolean;
  readonly report?: NativeHealthCheckReport;
  readonly error?: string;
  readonly exitCode?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export function runHealthCheck(executablePath: string, options: HealthCheckOptions): Promise<HealthCheckResult> {
  return new Promise((resolve) => {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const child = spawn(executablePath, ['--health-check', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: `Health check timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on('data', (data: Buffer) => {
      stdout += String(data);
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += String(data);
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `Failed to spawn ${executablePath}: ${error.message}` });
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({
          ok: false,
          error: stderr.trim() || `Health check exited with code ${code}`,
          exitCode: code ?? undefined,
        });
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as NativeHealthCheckReport;
        try {
          assertIdentityMatch({
            manifestId: options.manifestId,
            manifestVersion: options.manifestVersion,
            binaryId: parsed.packageId,
            binaryVersion: parsed.version,
          });
        } catch (error) {
          resolve({ ok: false, error: error instanceof NativeInstallSecurityError ? error.message : String(error) });
          return;
        }
        resolve({ ok: Boolean(parsed.ok), report: parsed, exitCode: code ?? undefined });
      } catch {
        resolve({
          ok: false,
          error: `Health check produced invalid JSON: ${stdout.slice(0, 200)}`,
          exitCode: code ?? undefined,
        });
      }
    });
  });
}
