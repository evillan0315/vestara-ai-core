import type { Job, JobResult } from '@vestara/job';
import type { WorkerConfig, WorkerDefinition } from '../index';
import { Worker } from '../index';
import { runCommand } from '../process-runner';

export interface CIWorkerOptions {
  readonly cwd?: string;
  readonly timeoutMs?: number;
}

const DEFAULT_COMMANDS: Record<string, string> = {
  build: 'pnpm build',
  test: 'pnpm test',
  lint: 'pnpm lint:check',
};

/**
 * Executes a CI step as a subprocess. The shell command comes from
 * `definition.labels.command`, falling back to a job-type default
 * (`build`/`test`/`lint`). Commands are executed without shell interpolation
 * where possible; a single `command` label is split on spaces.
 */
export class CIWorker extends Worker {
  private readonly cwd?: string;
  private readonly timeoutMs?: number;

  constructor(
    config: Omit<WorkerConfig, 'definition'> & { definition: Omit<WorkerDefinition, 'workerType'> },
    options?: CIWorkerOptions,
  ) {
    super({
      ...config,
      definition: { ...config.definition, workerType: 'ci' },
    } as WorkerConfig);
    this.cwd = options?.cwd;
    this.timeoutMs = options?.timeoutMs;
  }

  protected async run(job: Job): Promise<JobResult> {
    const labelCommand = this.definition.labels?.command;
    const command = labelCommand ?? DEFAULT_COMMANDS[job.type];
    if (!command) {
      return {
        status: 'failure',
        summary: `CI job ${job.type} has no command (set definition.labels.command)`,
      };
    }

    try {
      const result = await runCommand(command, {
        cwd: this.cwd,
        timeoutMs: this.timeoutMs,
        shell: true,
      });
      const ok = result.exitCode === 0;
      return {
        status: ok ? 'success' : 'failure',
        summary: ok ? `${command} exited 0` : `${command} exited ${result.exitCode}`,
        output: { exitCode: result.exitCode, stdout: result.stdout.slice(0, 4000) },
        ...(ok ? {} : { error: result.stderr.slice(0, 4000) }),
      };
    } catch (error) {
      return {
        status: 'failure',
        summary: `CI step ${command} failed`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
