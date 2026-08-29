import type { Job, JobResult } from '@vestara/job';
import type { WorkerConfig, WorkerDefinition } from '../index';
import { Worker } from '../index';
import { runCommand } from '../process-runner';

export interface DockerWorkerOptions {
  /** Docker CLI binary name (defaults to `docker`). */
  readonly dockerBinary?: string;
  /** Extra `docker run` flags, e.g. `--rm`. */
  readonly runFlags?: readonly string[];
  readonly timeoutMs?: number;
}

const DEFAULT_RUN_FLAGS: readonly string[] = ['--rm'];

/**
 * Executes a job inside a Docker container. The image is read from
 * `definition.labels.image`; additional container args from
 * `definition.labels.runArgs` (space-separated). Dependency-light: invokes
 * the `docker` CLI via child_process rather than the dockerode SDK, so it
 * requires the Docker CLI to be installed on the host.
 */
export class DockerWorker extends Worker {
  private readonly dockerBinary: string;
  private readonly runFlags: readonly string[];
  private readonly timeoutMs: number | undefined;

  constructor(
    config: Omit<WorkerConfig, 'definition'> & { definition: Omit<WorkerDefinition, 'workerType'> },
    options?: DockerWorkerOptions,
  ) {
    super({
      ...config,
      definition: { ...config.definition, workerType: 'docker' },
    } as WorkerConfig);
    this.dockerBinary = options?.dockerBinary ?? 'docker';
    this.runFlags = options?.runFlags ?? DEFAULT_RUN_FLAGS;
    this.timeoutMs = options?.timeoutMs;
  }

  protected async run(job: Job): Promise<JobResult> {
    const image = this.definition.labels?.image;
    if (!image) {
      return {
        status: 'failure',
        summary: `Docker job ${job.type} requires an image via definition.labels.image`,
      };
    }

    const runArgs = (this.definition.labels?.runArgs ?? '').split(' ').filter((arg) => arg.length > 0);
    try {
      const result = await runCommand(this.dockerBinary, {
        args: ['run', ...this.runFlags, image, ...runArgs],
        ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
      });
      const ok = result.exitCode === 0;
      return {
        status: ok ? 'success' : 'failure',
        summary: ok ? `Docker image ${image} exited 0` : `Docker image ${image} exited ${result.exitCode}`,
        output: { exitCode: result.exitCode, stdout: result.stdout.slice(0, 4000) },
        ...(ok ? {} : { error: result.stderr.slice(0, 4000) }),
      };
    } catch (error) {
      return {
        status: 'failure',
        summary: `Docker execution failed for ${image}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
