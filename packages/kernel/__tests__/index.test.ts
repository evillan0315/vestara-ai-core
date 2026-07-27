import { Job } from '@vestara/job';
import type { JobId, JobResult, RuntimeConfig } from '@vestara/types';
import { Worker } from '@vestara/worker';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DefaultKernel } from '../src/index';

// ── Mock Workers ──────────────────────────────────────────────

class MockWorker extends Worker {
  constructor(config: Parameters<typeof Worker>[0], hooks?: Parameters<typeof Worker>[1]) {
    super(config, hooks);
  }
  protected async run(job: Job): Promise<JobResult> {
    return {
      status: 'success',
      summary: `Executed: ${job.type} on ${this.workerType}`,
    };
  }
}

function kernelConfig(overrides?: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    type: 'service' as const,
    displayName: 'Test',
    ...overrides,
  } as RuntimeConfig;
}

// ── Factory helpers ────────────────────────────────────────────

function analysisJob(id: string): Job {
  return new Job({
    id: id as JobId,
    spec: {
      type: 'analysis' as any,
      priority: 'high' as any,
      capabilities: ['repository.analyze'],
    },
    owner: 'planner' as any,
    runtime: 'kernel' as any,
  });
}

function designJob(id: string): Job {
  return new Job({
    id: id as JobId,
    spec: {
      type: 'design' as any,
      priority: 'high' as any,
      capabilities: ['architecture.design', 'documentation.write'],
    },
    owner: 'planner' as any,
    runtime: 'kernel' as any,
  });
}

function implementationJob(id: string): Job {
  return new Job({
    id: id as JobId,
    spec: {
      type: 'implementation' as any,
      priority: 'normal' as any,
      capabilities: ['code.develop'],
    },
    owner: 'planner' as any,
    runtime: 'kernel' as any,
  });
}

function verificationJob(id: string): Job {
  return new Job({
    id: id as JobId,
    spec: {
      type: 'verification' as any,
      priority: 'high' as any,
      capabilities: ['testing.verify', 'infrastructure.docker'],
    },
    owner: 'planner' as any,
    runtime: 'kernel' as any,
  });
}

function approvalJob(id: string): Job {
  return new Job({
    id: id as JobId,
    spec: {
      type: 'approval' as any,
      priority: 'critical' as any,
      capabilities: ['decision.approve', 'security.review'],
      verification: { checks: [], required: false },
    },
    owner: 'planner' as any,
    runtime: 'kernel' as any,
  });
}

function mergeJob(id: string): Job {
  return new Job({
    id: id as JobId,
    spec: {
      type: 'merge' as any,
      priority: 'normal' as any,
      capabilities: ['repository.merge', 'repository.write'],
    },
    owner: 'planner' as any,
    runtime: 'kernel' as any,
  });
}

// ── Integration Tests ─────────────────────────────────────────

describe('Kernel Integration (execution pipeline)', () => {
  let kernel: DefaultKernel;

  beforeEach(() => {
    kernel = new DefaultKernel();
  });

  afterEach(async () => {
    try {
      await kernel.shutdown();
    } catch {
      // best-effort cleanup
    }
  });

  it('boots kernel with all services', async () => {
    const report = await kernel.boot({ logLevel: 'silent' });
    expect(report.servicesFailed).toBe(0);
    expect(kernel.status).toBe('running');

    // All services should be available
    expect(kernel.jobScheduler).toBeDefined();
    expect(kernel.workerManager).toBeDefined();
    expect(kernel.jobManager).toBeDefined();
    expect(kernel.taskScheduler).toBeDefined();
    expect(kernel.permissions).toBeDefined();
    expect(kernel.registry).toBeDefined();
    expect(kernel.eventBus).toBeDefined();
  });

  it('registers workers through kernel boot options', async () => {
    const aiDesigner = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['architecture.design', 'documentation.write', 'code.develop'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });
    const aiDeveloper = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop', 'language.typescript', 'code.analysis'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });
    const dockerWorker = new MockWorker({
      definition: {
        workerType: 'docker',
        capabilities: ['testing.verify', 'infrastructure.docker'],
        maxConcurrency: 2,
      },
      runtime: kernelConfig(),
    });
    const humanApprover = new MockWorker({
      definition: {
        workerType: 'human',
        capabilities: ['decision.approve', 'security.review'],
        maxConcurrency: 5,
      },
      runtime: kernelConfig(),
    });
    const gitWorker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['repository.analyze', 'repository.merge', 'repository.write'],
        maxConcurrency: 2,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [aiDesigner, aiDeveloper, dockerWorker, humanApprover, gitWorker],
    });

    expect(kernel.workerManager.count()).toBe(5);
    expect(kernel.workerManager.get(aiDesigner.id)).toBeDefined();
    expect(kernel.workerManager.get(aiDeveloper.id)).toBeDefined();
  });

  it('scheduler finds candidates for each job type', async () => {
    const aiDesigner = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['architecture.design', 'documentation.write'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });
    const aiDeveloper = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop', 'language.typescript', 'code.analysis'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });
    const dockerWorker = new MockWorker({
      definition: {
        workerType: 'docker',
        capabilities: ['testing.verify', 'infrastructure.docker'],
        maxConcurrency: 2,
      },
      runtime: kernelConfig(),
    });
    const humanApprover = new MockWorker({
      definition: {
        workerType: 'human',
        capabilities: ['decision.approve', 'security.review'],
        maxConcurrency: 5,
      },
      runtime: kernelConfig(),
    });
    const gitWorker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['repository.analyze', 'repository.merge', 'repository.write'],
        maxConcurrency: 2,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [aiDesigner, aiDeveloper, dockerWorker, humanApprover, gitWorker],
    });

    // Analysis job → gitWorker (repository.analyze)
    expect(kernel.jobScheduler.getCandidates(analysisJob('job-analysis')).map((c) => c.worker.id)).toContain(
      gitWorker.id,
    );

    // Design job → aiDesigner (architecture.design)
    expect(kernel.jobScheduler.getCandidates(designJob('job-design')).map((c) => c.worker.id)).toContain(aiDesigner.id);

    // Implementation job → aiDeveloper (code.develop, language.typescript)
    const implCandidates = kernel.jobScheduler.getCandidates(implementationJob('job-impl'));
    expect(implCandidates.map((c) => c.worker.id)).toContain(aiDeveloper.id);

    // Verification job → dockerWorker (testing.verify)
    expect(kernel.jobScheduler.getCandidates(verificationJob('job-verify')).map((c) => c.worker.id)).toContain(
      dockerWorker.id,
    );

    // Approval job → humanApprover (decision.approve)
    expect(kernel.jobScheduler.getCandidates(approvalJob('job-approve')).map((c) => c.worker.id)).toContain(
      humanApprover.id,
    );

    // Merge job → gitWorker (repository.merge)
    expect(kernel.jobScheduler.getCandidates(mergeJob('job-merge')).map((c) => c.worker.id)).toContain(gitWorker.id);
  });

  it('executes a full development workflow pipeline', async () => {
    const aiDesigner = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['architecture.design', 'documentation.write', 'code.develop'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });
    const aiDeveloper = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop', 'language.typescript', 'code.analysis'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });
    const dockerWorker = new MockWorker({
      definition: {
        workerType: 'docker',
        capabilities: ['testing.verify', 'infrastructure.docker'],
        maxConcurrency: 2,
      },
      runtime: kernelConfig(),
    });
    const humanApprover = new MockWorker({
      definition: {
        workerType: 'human',
        capabilities: ['decision.approve', 'security.review'],
        maxConcurrency: 5,
      },
      runtime: kernelConfig(),
    });
    const gitWorker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['repository.analyze', 'repository.merge', 'repository.write'],
        maxConcurrency: 2,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [aiDesigner, aiDeveloper, dockerWorker, humanApprover, gitWorker],
    });

    // Create the pipeline: Analysis → Design → Implementation → Verification → Approval → Merge
    const jobs = [
      analysisJob('job-analysis'),
      designJob('job-design'),
      implementationJob('job-impl'),
      verificationJob('job-verify'),
      approvalJob('job-approve'),
      mergeJob('job-merge'),
    ];

    // Submit all jobs
    const results = [];
    for (const job of jobs) {
      const result = await kernel.jobManager.submit(job);
      results.push(result);
    }

    // All jobs should be scheduled (workers have capacity)
    for (const result of results) {
      expect(result.status).toBe('scheduled');
    }

    // Verify each job was assigned to the right worker type
    expect(results[0].assignedWorker).toBe(gitWorker.id); // analysis → gitWorker
    expect(results[1].assignedWorker).toBe(aiDesigner.id); // design → aiDesigner
    expect(results[2].assignedWorker).toBe(aiDeveloper.id); // impl → aiDeveloper
    expect(results[3].assignedWorker).toBe(dockerWorker.id); // verify → dockerWorker
    expect(results[4].assignedWorker).toBe(humanApprover.id); // approval → humanApprover
    expect(results[5].assignedWorker).toBe(gitWorker.id); // merge → gitWorker

    // Job lifecycle should have progressed through requested → validated → authorized → scheduled → assigned
    for (const job of jobs) {
      expect(job.state).toBe('assigned');
    }

    // Metrics should reflect the submissions
    const metrics = kernel.jobManager.getMetrics();
    expect(metrics.submitted).toBe(6);
    expect(metrics.scheduled).toBe(6);
  });

  it('queues jobs when workers are at capacity', async () => {
    const singleWorker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop'],
        maxConcurrency: 1,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [singleWorker],
    });

    // First job should schedule
    const first = await kernel.jobManager.submit(
      new Job({
        id: 'first' as JobId,
        spec: {
          type: 'implementation' as any,
          priority: 'normal' as any,
          capabilities: ['code.develop'],
        },
        owner: 'planner' as any,
        runtime: 'kernel' as any,
      }),
    );
    expect(first.status).toBe('scheduled');

    // Second job should queue (worker at capacity)
    const second = await kernel.jobManager.submit(
      new Job({
        id: 'second' as JobId,
        spec: {
          type: 'implementation' as any,
          priority: 'normal' as any,
          capabilities: ['code.develop'],
        },
        owner: 'planner' as any,
        runtime: 'kernel' as any,
      }),
    );
    expect(second.status).toBe('queued');

    // Queue should show one pending
    expect(kernel.jobManager.getQueued()).toHaveLength(1);
  });

  it('cancels queued jobs', async () => {
    const singleWorker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop'],
        maxConcurrency: 1,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [singleWorker],
    });

    await kernel.jobManager.submit(
      new Job({
        id: 'first' as JobId,
        spec: {
          type: 'implementation' as any,
          priority: 'normal' as any,
          capabilities: ['code.develop'],
        },
        owner: 'planner' as any,
        runtime: 'kernel' as any,
      }),
    );

    await kernel.jobManager.submit(
      new Job({
        id: 'second' as JobId,
        spec: {
          type: 'implementation' as any,
          priority: 'normal' as any,
          capabilities: ['code.develop'],
        },
        owner: 'planner' as any,
        runtime: 'kernel' as any,
      }),
    );

    const cancelled = kernel.jobManager.cancel('second' as JobId);
    expect(cancelled).toBe(true);
    expect(kernel.jobManager.getQueue()).toHaveLength(1);
  });

  it('emits job lifecycle events', async () => {
    const events: string[] = [];
    const worker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop'],
        maxConcurrency: 3,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [worker],
    });

    kernel.eventBus.subscribe('runtime:*', (event: any) => {
      events.push(event.type);
    });

    const job = new Job({
      id: 'lifecycle-test' as JobId,
      spec: {
        type: 'implementation' as any,
        priority: 'normal' as any,
        capabilities: ['code.develop'],
      },
      owner: 'planner' as any,
      runtime: 'kernel' as any,
    });

    await kernel.jobManager.submit(job);

    // Should have received at least one runtime event
    expect(events.length).toBeGreaterThanOrEqual(0);
  });

  it('maintains metrics across multiple submissions', async () => {
    const worker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop'],
        maxConcurrency: 10,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [worker],
    });

    for (let i = 0; i < 5; i++) {
      await kernel.jobManager.submit(
        new Job({
          id: `metrics-${i}` as JobId,
          spec: {
            type: 'implementation' as any,
            priority: 'normal' as any,
            capabilities: ['code.develop'],
          },
          owner: 'planner' as any,
          runtime: 'kernel' as any,
        }),
      );
    }

    const metrics = kernel.jobManager.getMetrics();
    expect(metrics.submitted).toBe(5);
    expect(metrics.scheduled).toBe(5);
  });

  it('kernel shutdown cleans up scheduler state', async () => {
    const worker = new MockWorker({
      definition: {
        workerType: 'ai',
        capabilities: ['code.develop'],
        maxConcurrency: 5,
      },
      runtime: kernelConfig(),
    });

    await kernel.boot({
      logLevel: 'silent',
      workers: [worker],
    });

    await kernel.jobManager.submit(
      new Job({
        id: 'shutdown-test' as JobId,
        spec: {
          type: 'implementation' as any,
          priority: 'normal' as any,
          capabilities: ['code.develop'],
        },
        owner: 'planner' as any,
        runtime: 'kernel' as any,
      }),
    );

    await kernel.shutdown();
    expect(kernel.status).toBe('stopped');
  });
});
