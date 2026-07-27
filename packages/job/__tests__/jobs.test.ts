import { describe, expect, it } from 'vitest';

const { RepositoryOperationJob, WorkflowExecutionJob, VerificationJob, UserApprovalJob } = require('../dist/index.js');
const owner = 'rt-owner' as any;
const runtime = 'rt-runtime' as any;

describe('RepositoryOperationJob', () => {
  it('creates in requested state with domain fields', () => {
    const job = new RepositoryOperationJob(
      'job-repo-1' as any,
      {
        type: 'implement',
        priority: 3,
        operation: 'commit',
        targetPath: '/repo/src',
        message: 'Add feature X',
        filePatterns: ['src/**/*.ts'],
      },
      owner,
      runtime,
    );
    expect(job.state).toBe('requested');
    expect(job.type).toBe('implement');
    expect(job.operation).toBe('commit');
    expect(job.targetPath).toBe('/repo/src');
    expect(job.message).toBe('Add feature X');
    expect(job.filePatterns).toEqual(['src/**/*.ts']);
  });

  it('full lifecycle with no base method overrides', () => {
    const job = new RepositoryOperationJob(
      'job-repo-2' as any,
      { type: 'refactor', priority: 2, operation: 'rename', targetPath: '/repo/lib' },
      owner,
      runtime,
    );
    job.validate();
    expect(job.state).toBe('validated');
    job.authorize();
    expect(job.state).toBe('authorized');
    job.schedule();
    expect(job.state).toBe('scheduled');
    job.assign('worker-1' as any);
    expect(job.state).toBe('assigned');
    job.start();
    expect(job.state).toBe('running');
    job.complete({ summary: 'Refactor complete' });
    expect(job.state).toBe('verifying');
    job.verifyComplete();
    expect(job.state).toBe('completed');
    expect(job.repositoryInfo).toEqual({
      operation: 'rename',
      targetPath: '/repo/lib',
      message: null,
    });
  });

  it('supports retry from running state', () => {
    const job = new RepositoryOperationJob(
      'job-repo-3' as any,
      {
        type: 'migrate',
        priority: 4,
        operation: 'migrate-schema',
        targetPath: '/repo/db',
        retry: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
        rollback: { enabled: true, strategy: 'full' },
      },
      owner,
      runtime,
    );
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.retryLater();
    expect(job.retryCount).toBe(1);
    expect(job.state).toBe('retrying');
    expect(job.retriesRemaining).toBe(1);
  });
});

describe('WorkflowExecutionJob', () => {
  it('creates with step config', () => {
    const job = new WorkflowExecutionJob(
      'job-wf-1' as any,
      {
        type: 'implement',
        priority: 3,
        workflowId: 'wf-build-ui',
        stepId: 'step-2',
        stepName: 'Compile TypeScript',
        input: { files: ['src/index.ts'] },
        expectedOutputs: ['dist/index.js'],
      },
      owner,
      runtime,
    );
    expect(job.workflowId).toBe('wf-build-ui');
    expect(job.stepId).toBe('step-2');
    expect(job.stepName).toBe('Compile TypeScript');
    expect(job.input).toEqual({ files: ['src/index.ts'] });
    expect(job.expectedOutputs).toEqual(['dist/index.js']);
    expect(job.stepInfo.stepName).toBe('Compile TypeScript');
  });

  it('full lifecycle with checkpoint', () => {
    const job = new WorkflowExecutionJob(
      'job-wf-2' as any,
      {
        type: 'test',
        priority: 2,
        workflowId: 'wf-ci',
        stepId: 'step-run-tests',
        stepName: 'Run test suite',
        input: { testPattern: '**/*.test.ts' },
        retry: { maxRetries: 1, backoffMs: 1000, backoffMultiplier: 2 },
      },
      owner,
      runtime,
    );
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.checkpoint(50, { testsPassed: 42 });
    expect(job.getLatestCheckpoint()?.percent).toBe(50);
    job.complete({ summary: 'All tests passed' });
    job.verifyComplete();
    expect(job.state).toBe('completed');
  });
});

describe('VerificationJob', () => {
  it('creates with check config', () => {
    const job = new VerificationJob(
      'job-verify-1' as any,
      {
        type: 'lint',
        priority: 1,
        checkType: 'lint',
        target: 'src/',
        checks: [{ type: 'lint', config: { rules: ['no-unused-vars'] } }],
      },
      owner,
      runtime,
    );
    expect(job.checkType).toBe('lint');
    expect(job.target).toBe('src/');
    expect(job.checks).toHaveLength(1);
    expect(job.verificationInfo.checkType).toBe('lint');
  });

  it('rejects on violation', () => {
    const job = new VerificationJob(
      'job-verify-2' as any,
      { type: 'review', priority: 2, checkType: 'consistency', target: 'src/' },
      owner,
      runtime,
    );
    job.validate();
    job.authorize();
    job.schedule();
    job.assign('worker-1' as any);
    job.start();
    job.fail('Consistency check failed: 12 violations');
    expect(job.state).toBe('failed');
    expect(job.error).toContain('Consistency check');
  });
});

describe('UserApprovalJob', () => {
  it('creates with approval config', () => {
    const job = new UserApprovalJob(
      'job-approve-1' as any,
      {
        type: 'approve',
        priority: 4,
        prompt: 'Deploy to production?',
        context: { environment: 'prod', version: '2.1.0' },
        approvalTarget: 'deploy',
      },
      owner,
      runtime,
    );
    expect(job.type).toBe('approve');
    expect(job.prompt).toBe('Deploy to production?');
    expect(job.context.environment).toBe('prod');
    expect(job.approvalTarget).toBe('deploy');
    expect(job.approvalInfo.prompt).toBe('Deploy to production?');
  });

  it('approves or cancels through standard lifecycle', () => {
    const job = new UserApprovalJob(
      'job-approve-2' as any,
      {
        type: 'approve',
        priority: 3,
        prompt: 'Approve PR #42?',
        context: { pr: 42, author: 'eddie' },
        approvalTarget: 'merge',
      },
      owner,
      runtime,
    );
    job.validate();
    job.authorize();
    job.schedule();
    // Approval is a manual step — job waits in assigned/running
    job.assign('worker-human-eddie' as any);
    job.start();
    // User approves → complete with verification
    job.complete({ summary: 'PR #42 approved for merge' });
    job.verifyComplete();
    expect(job.state).toBe('completed');

    // Alternatively: user denies → cancel
    const denied = new UserApprovalJob(
      'job-approve-3' as any,
      { type: 'approve', priority: 3, prompt: 'Delete branch?', context: {}, approvalTarget: 'delete' },
      owner,
      runtime,
    );
    denied.validate();
    denied.authorize();
    denied.schedule();
    denied.cancel('User denied deletion');
    expect(denied.state).toBe('cancelled');
  });
});
