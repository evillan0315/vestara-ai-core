import type { Job, JobResult } from '@vestara/job';
import type { WorkerConfig, WorkerDefinition } from '../index';
import { Worker } from '../index';

export class HumanWorker extends Worker {
  constructor(config: Omit<WorkerConfig, 'definition'> & { definition: Omit<WorkerDefinition, 'workerType'> }) {
    super({
      ...config,
      definition: { ...config.definition, workerType: 'human' },
    } as WorkerConfig);
  }

  protected async run(_job: Job): Promise<JobResult> {
    return {
      status: 'success',
      summary: 'Executed by human worker',
    };
  }
}
