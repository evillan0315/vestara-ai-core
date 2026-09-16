import {
  CIVerificationService,
  InMemoryCIDecisionStore,
  InMemoryCIFindingStore,
  InMemoryCIObservationStore,
  projectCINotification,
} from '@vestara/ci-observer';
import { migrate } from '@vestara/sqlite-migrations';
import { ORCHESTRATION_MANIFEST, TaskStore } from '@vestara/workflow-orchestrator';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildAndTestJob,
  COMMIT,
  desktopBuildJob,
  REPO,
  workflowRun,
} from '../../../packages/ci-observer/__tests__/fixtures';
import { ciCompletionActivity } from '../src/ci-activity';
import { createCICoordinator } from '../src/ci-coordinator';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

/**
 * CI acceptance (CI-OBS-001 dogfood, end-to-end): a governed push suspends the
 * originating WorkflowTask, a GitHub completion is reviewed and persisted, and
 * the task resumes — with Activity Room + notification projections. This proves
 * the assembled pipeline, not just its units.
 */
describe('CI end-to-end acceptance', () => {
  it('drives authorized task → wait → completion → persist → resume → activity', async () => {
    const db = new SQL.Database();
    migrate(db, ORCHESTRATION_MANIFEST, {});
    const tasks = new TaskStore(db as never);
    const [task] = await tasks.createMany('plan-e2e', [
      {
        planId: 'plan-e2e',
        summary: 'CI e2e task',
        description: '',
        files: [],
        dependencies: [],
        effort: 'small',
        requiredCapabilities: [],
      },
    ]);
    await tasks.markStarted(task.id);
    expect((await tasks.get(task.id))?.status).toBe('in-progress');

    const records = {
      observations: new InMemoryCIObservationStore(),
      decisions: new InMemoryCIDecisionStore(),
      findings: new InMemoryCIFindingStore(),
    };
    const service = new CIVerificationService({ coordinator: createCICoordinator(tasks), records });

    // Governed push registers the wait BEFORE the (simulated) push.
    const { correlation } = await service.registerGovernedPush({
      repository: REPO,
      commitSha: COMMIT,
      branch: 'vestara/task-e2e',
      originatingWorkflowRunId: 'wf-e2e',
      originatingTaskId: task.id,
      originatingOperationId: 'op-e2e',
    });
    const waiting = await tasks.get(task.id);
    expect(waiting?.status).toBe('awaiting-verification');
    expect(waiting?.externalWait?.waitRef).toBe(correlation.correlationId);
    expect(waiting?.externalWait?.repository).toBe(REPO);
    expect(waiting?.externalWait?.commitSha).toBe(COMMIT);

    // GitHub completion webhook payload → normalize → review → persist.
    const result = await service.handleCompletion({
      payload: workflowRun(),
      jobs: [
        { job: desktopBuildJob(), steps: desktopBuildJob().steps },
        { job: buildAndTestJob(), steps: buildAndTestJob().steps },
      ],
    });
    expect(result.observation.conclusion).toBe('failed');
    expect((await records.observations.latest())?.commitSha).toBe(COMMIT);
    expect((await records.decisions.latest())?.observationId).toBe(result.observation.observationId);

    // Resume returns the task to in-progress (never completed).
    await service.resumeFromDecision(result);
    const resumed = await tasks.get(task.id);
    expect(resumed?.status).toBe('in-progress');
    expect(resumed?.externalWait?.resumedAt).toBeTruthy();
    expect(resumed?.externalWait?.decisionRef).toContain(result.observation.observationId);

    // Activity Room + notification projections exist for the review.
    const activity = ciCompletionActivity(result);
    expect(activity.correlationId).toBe(correlation.correlationId);
    expect(activity.taskId).toBe(task.id);
    expect(projectCINotification(result)).toBeDefined();
  });
});
