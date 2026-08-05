/**
 * OwnedApiProcess — spawns the Vestara API as a child that is guaranteed to die
 * with the CLI.
 *
 * The API must never "run on its own": when the CLI exits — normally, via a
 * signal, or even when the process is killed — the spawned API process must be
 * terminated. A plain `spawn` with `stdio: 'ignore'` leaves the child running
 * in the background (an orphan) after the parent exits, which is what caused
 * the API to keep serving port 3001 after the TUI closed.
 *
 * This wrapper:
 *   - keeps the child in the CLI's process group so terminal signals reach it;
 *   - forwards SIGINT/SIGTERM/SIGHUP to the child;
 *   - registers a parent `exit` handler that kills the child as a last resort;
 *   - exposes `stop()` for the normal shutdown path.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import * as path from 'node:path';

const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

export class OwnedApiProcess {
  private readonly child: ChildProcess;
  private stopped = false;
  private readonly onExit: () => void;

  constructor(executable: string, args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv }) {
    this.child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'ignore',
    });

    // Keep the child in the parent's process group so a terminal Ctrl+C reaches
    // both the CLI and the API. We do not detach it.
    this.child.unref?.();

    this.onExit = () => {
      this.kill();
    };
    process.once('exit', this.onExit);
    for (const signal of FORWARDED_SIGNALS) {
      process.on(signal, this.forward);
    }
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get exited(): boolean {
    return this.stopped || this.child.exitCode !== null;
  }

  private readonly forward = (signal: NodeJS.Signals) => {
    if (!this.stopped && this.child.exitCode === null) {
      try {
        this.child.kill(signal);
      } catch {
        // Child already gone.
      }
    }
  };

  /** Terminate the child (SIGTERM, then SIGKILL after a short grace). */
  kill(): void {
    if (this.stopped || this.child.exitCode !== null) return;
    this.stopped = true;
    try {
      this.child.kill('SIGTERM');
    } catch {
      // Child already gone.
    }
    // Hard-kill fallback in case the API ignores SIGTERM.
    const timer = setTimeout(() => {
      if (this.child.exitCode === null) {
        try {
          this.child.kill('SIGKILL');
        } catch {
          // Already gone.
        }
      }
    }, 2000);
    timer.unref?.();
  }

  /**
   * Detach parent-lifecycle cleanup listeners. The child is no longer tied to
   * the CLI's exit/signals; this is used after the child has been stopped.
   */
  detach(): void {
    process.off('exit', this.onExit);
    for (const signal of FORWARDED_SIGNALS) {
      process.off(signal, this.forward);
    }
  }
}

export function spawnOwnedApi(repoPath: string): OwnedApiProcess {
  const apiEntry = path.resolve(__dirname, '..', '..', 'api', 'dist', 'index.js');
  return new OwnedApiProcess(process.execPath, [apiEntry], {
    cwd: repoPath,
    env: { ...process.env, VESTARA_REPO: repoPath },
  });
}
