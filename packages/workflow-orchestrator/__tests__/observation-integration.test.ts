import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DefaultWorkflowObservationRunner,
  DefaultWorkflowObserver,
  isObservationGenerated,
  MemoryWorkflowObservationStore,
  OrchestratorWorkflowObservationAssembler,
  shouldObserve,
  type WorkflowObservationEvaluationRecord,
  type WorkflowObservationEvent,
  type WorkflowObservationRunResult,
} from '../src/observation';
import { ORCHESTRATION_MANIFEST } from '../src/orchestration-migrations';
import { WorkflowOrchestrator } from '../src/orchestrator';
import type { RetryPolicy } from '../src/retry-policy';
import { ArtifactStore, FileLockRegistry, PlanStore, ProjectStore, TaskStore } from '../src/stores';
import type { CreateTaskInput } from '../src/stores/task-store';
import type {
  OrchestratedProject,
  OrchestrationEvent,
  OrchestrationEventSink,
  TaskDispatcher,
  TaskDispatchResult,
  WorkflowTask,
} from '../src/types';

let SQL: { Database: new (data?: Uint8Array | null) => Database };

beforeAll(async () => {
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
});

class FakeDispatcher implements TaskDispatcher {
  calls: string[] = [];

  async dispatch(task: WorkflowTask): Promise<TaskDispatchResult> {
    this.calls.push(task.id);
    return { status: 'completed', agentId: 'developer-1' };
  }
}

const FAST_RETRY: RetryPolicy = { maxAttempts: 3, maxRevisions: 3, backoffMs: () => 0 };

async function setup() {
  const db = new SQL.Database();
  migrate(db, ORCHESTRATION_MANIFEST, {});
  const projects = new ProjectStore(db);
  const plans = new PlanStore(db);
  const tasks = new TaskStore(db);
  const artifacts = new ArtifactStore(db);
  const locks = new FileLockRegistry(db);
  const events: OrchestrationEvent[] = [];
  const sink: OrchestrationEventSink = { append: (event) => void events.push(event) };
  const orchestrator = new WorkflowOrchestrator({
    projects,
    plans,
    tasks,
    artifacts,
    locks,
    events: sink,
    dispatcher: new FakeDispatcher(),
    retry: FAST_RETRY,
  });

  const stream: WorkflowObservationEvent[] = [];
  const evaluations: WorkflowObservationEvaluationRecord[] = [];
  const failures: string[] = [];
  const store = new MemoryWorkflowObservationStore();
  const runner = new DefaultWorkflowObservationRunner({
    assembler: new OrchestratorWorkflowObservationAssembler({
      snapshot: (projectId) => orchestrator.snapshot(projectId),
    }),
    observer: new DefaultWorkflowObserver(),
    store,
    events: { emit: (event) => void stream.push(event) },
    telemetry: { emitEvaluation: (record) => void evaluations.push(record) },
    onFailure: (_projectId, error) => void failures.push(String(error)),
  });

  return { orchestrator, events, stream, evaluations, failures, store, runner };
}

async function driveToExecution(orchestrator: WorkflowOrchestrator): Promise<OrchestratedProject> {
  const project = await orchestrator.createProject({
    name: 'Feature',
    goal: 'Build the feature',
    repoPath: '/repo',
    workspaceId: 'ws-1',
  });
  await orchestrator.startProject(project.id);
  await orchestrator.completeAnalysis(project.id, { analystId: 'analyst', report: { summary: 'scanned' } });
  const task: CreateTaskInput = {
    planId: 'unused',
    summary: 'Implement feature',
    description: 'Do the work',
    files: ['src/a.ts'],
    dependencies: [],
    effort: 'medium',
    requiredCapabilities: ['code-generation'],
  };
  await orchestrator.generatePlan(project.id, { plannerId: 'planner', title: 'Plan', goal: 'Build', tasks: [task] });
  await orchestrator.reviewArchitecture(project.id, { architectId: 'architect', status: 'approved' });
  await orchestrator.approveProject(project.id, { approvalId: 'approval-1' });
  return project;
}

describe('WFO-001C shadow observation integration', () => {
  it('observes a real workflow lifecycle without applying recommendations', async () => {
    const { orchestrator, runner, events } = await setup();
    const project = await orchestrator.createProject({
      name: 'Feature',
      goal: 'Build the feature',
      repoPath: '/repo',
      workspaceId: 'ws-1',
    });

    // Triggers fire on material workflow events.
    expect(shouldObserve(events[0])).toBe(true);

    // Fresh project → ready, missing required artifacts.
    let run: WorkflowObservationRunResult = await runner.observe(project.id);
    expect(run.observation.currentState).toBe('ready');
    expect(run.observation.recommendedAction).toBe('request-artifact');
    expect(run.observation.missingOutputs.map((output) => output.kind)).toEqual(
      expect.arrayContaining(['analysis', 'plan', 'verification']),
    );
    expect(run.applied).toBe(false);
    expect(run.recommendationChanged).toBe(true);
    expect(run.recorded).toBe(true);

    // Plan generated → tasks pending on dependencies → pending.
    await orchestrator.startProject(project.id);
    await orchestrator.completeAnalysis(project.id, { analystId: 'analyst', report: { summary: 'scanned' } });
    await orchestrator.generatePlan(project.id, {
      plannerId: 'planner',
      title: 'Plan',
      goal: 'Build',
      tasks: [
        {
          planId: 'unused',
          summary: 'Implement feature',
          description: 'Do the work',
          files: ['src/a.ts'],
          dependencies: [],
          effort: 'medium',
          requiredCapabilities: ['code-generation'],
        },
      ],
    });
    run = await runner.observe(project.id);
    expect(run.observation.currentState).toBe('pending');
    expect(
      run.observation.reasons.some((reason) => reason.includes('Required inputs or approvals are not yet available')),
    ).toBe(true);

    // Execution finished → verification output still missing → ready to verify.
    await orchestrator.reviewArchitecture(project.id, { architectId: 'architect', status: 'approved' });
    await orchestrator.approveProject(project.id, { approvalId: 'approval-1' });
    await orchestrator.runExecution(project.id);
    run = await runner.observe(project.id);
    expect(run.observation.currentState).toBe('ready');
    expect(run.observation.reasons.some((reason) => reason.includes('not yet created: verification'))).toBe(true);
    expect(run.observation.missingOutputs.map((output) => output.kind)).toContain('verification');

    // Verification passed → completed only after the required output + passing conclusion.
    await orchestrator.runVerification(project.id, {
      verifierId: 'verifier',
      report: { passed: true },
      passed: true,
    });
    run = await runner.observe(project.id);
    expect(run.observation.currentState).toBe('completed');
    expect(run.observation.recommendedAction).toBe('complete');
    expect(run.applied).toBe(false);
  });

  it('keeps the observer pure: observation never mutates workflow state', async () => {
    const { orchestrator, runner } = await setup();
    const project = await driveToExecution(orchestrator);
    const before = JSON.stringify(await orchestrator.snapshot(project.id));
    await runner.observe(project.id);
    const after = JSON.stringify(await orchestrator.snapshot(project.id));
    expect(after).toBe(before);
  });

  it('records every evaluation but emits only meaningful changes', async () => {
    const { runner, stream, evaluations, orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    await runner.observe(project.id);

    const streamTypes = stream.map((event) => event.type);
    expect(
      streamTypes.every(
        (type) => type === 'workflow.transition.recommended' || type === 'workflow.convergence.changed',
      ),
    ).toBe(true);
    expect(evaluations.length).toBe(1);
    expect(evaluations[0].applied).toBe(false);
    expect(evaluations[0].observationHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('emits no duplicate recommendation events for duplicate triggers', async () => {
    const { runner, stream, evaluations, orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    await runner.observe(project.id); // #1 baseline
    await runner.observe(project.id); // #2 establishes convergence (not-evaluated → stable)
    const firstStreamLength = stream.length;

    const duplicate = await runner.observe(project.id); // #3 true duplicate
    expect(duplicate.recommendationChanged).toBe(false);
    expect(duplicate.recorded).toBe(false);
    expect(stream.length).toBe(firstStreamLength);
    expect(evaluations.length).toBe(3); // each observe appends exactly one evaluation
  });

  it('excludes observation-generated event types from the trigger set', () => {
    expect(isObservationGenerated('workflow.observation.evaluated')).toBe(true);
    expect(isObservationGenerated('workflow.transition.recommended')).toBe(true);
    expect(shouldObserve({ type: 'workflow.transition.recommended' } as unknown as OrchestrationEvent)).toBe(false);
    expect(shouldObserve({ type: 'workflow.checkpoint', projectId: 'p', at: '' })).toBe(false);
    expect(shouldObserve({ type: 'task.completed', projectId: 'p', planId: 'pl', taskId: 't', at: '' })).toBe(true);
  });

  it('does not interrupt the workflow when snapshot assembly fails', async () => {
    const { orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    const failures: string[] = [];
    const runner = new DefaultWorkflowObservationRunner({
      assembler: {
        assemble: async () => {
          throw new Error('store unavailable');
        },
      },
      observer: new DefaultWorkflowObserver(),
      store: new MemoryWorkflowObservationStore(),
      onFailure: (_projectId, error) => void failures.push(String(error)),
    });

    const run = await runner.observe(project.id);
    expect(run.observation.currentState).toBe('indeterminate');
    expect(run.applied).toBe(false);
    expect(failures).toEqual(['Error: store unavailable']);

    // The workflow still works normally afterwards.
    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.project.id).toBe(project.id);
  });

  it('records field provenance and evidence refs for derived observations', async () => {
    const { orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    const assembler = new OrchestratorWorkflowObservationAssembler({
      snapshot: (projectId) => orchestrator.snapshot(projectId),
    });
    const assembled = await assembler.assemble(project.id);

    expect(assembled.provenance?.blockers).toMatchObject({ source: 'derived' });
    expect(assembled.provenance?.approvals).toMatchObject({ source: 'derived' });
    expect(assembled.provenance?.verification).toMatchObject({ source: 'derived' });
    expect(assembled.provenance?.conversation).toMatchObject({ source: 'defaulted' });
    expect(assembled.provenance?.decisions).toMatchObject({ source: 'missing' });
    // Derived fields carry evidence references, not bare approximations.
    expect(assembled.provenance?.blockers.evidenceRefs).toEqual([]);
    expect(assembled.provenance?.approvals.evidenceRefs.length).toBeGreaterThan(0);
  });

  it('surfaces adapter-defaulted fields in the observation reasons', async () => {
    const { runner, orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    const run = await runner.observe(project.id);
    expect(run.observation.reasons.some((reason) => reason.includes('conversation metrics defaulted'))).toBe(true);
    expect(run.observation.reasons.some((reason) => reason.includes('decisions missing'))).toBe(true);
  });

  it('ignores a stale previous observation as a baseline', async () => {
    const { runner, orchestrator, store } = await setup();
    const project = await driveToExecution(orchestrator);
    await runner.observe(project.id);

    // Corrupt the stored latest with a "future" record (newer capture + later turn).
    const latest = store.getLatest(project.id)!;
    store.save(project.id, {
      observation: latest.observation,
      snapshot: {
        ...latest.snapshot,
        capturedAt: '2099-01-01T00:00:00.000Z',
        conversation: { ...latest.snapshot.conversation, turnCount: 999 },
      },
    });

    const run = await runner.observe(project.id);
    expect(run.observation.convergence.status).toBe('not-evaluated');
    expect(run.observation.convergence.consecutiveNoProgressTurns).toBe(0);
  });

  it('preserves the latest valid observation when assembly fails', async () => {
    const { orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    const store = new MemoryWorkflowObservationStore();
    const failures: string[] = [];

    const validRunner = new DefaultWorkflowObservationRunner({
      assembler: new OrchestratorWorkflowObservationAssembler({
        snapshot: (projectId) => orchestrator.snapshot(projectId),
      }),
      observer: new DefaultWorkflowObserver(),
      store,
    });
    await validRunner.observe(project.id);
    const valid = store.getLatest(project.id)!;

    const failingRunner = new DefaultWorkflowObservationRunner({
      assembler: {
        assemble: async () => {
          throw new Error('boom');
        },
      },
      observer: new DefaultWorkflowObserver(),
      store,
      onFailure: (_projectId, error) => void failures.push(String(error)),
    });
    const run = await failingRunner.observe(project.id);

    expect(run.observation.currentState).toBe('indeterminate');
    expect(store.getLatest(project.id)?.observation.sourceSnapshotHash).toBe(valid.observation.sourceSnapshotHash);
    expect(failures).toEqual(['Error: boom']);
  });

  it('does not fail the workflow when event persistence throws', async () => {
    const { orchestrator } = await setup();
    const project = await driveToExecution(orchestrator);
    const runner = new DefaultWorkflowObservationRunner({
      assembler: new OrchestratorWorkflowObservationAssembler({
        snapshot: (projectId) => orchestrator.snapshot(projectId),
      }),
      observer: new DefaultWorkflowObserver(),
      store: new MemoryWorkflowObservationStore(),
      events: {
        emit: async () => {
          throw new Error('event store unavailable');
        },
      },
    });

    await runner.observe(project.id); // baseline, no emission
    await orchestrator.runExecution(project.id);
    const run = await runner.observe(project.id); // emits transition.recommended → sink throws → swallowed
    expect(run.observation.currentState).toBe('ready');
    expect(run.recommendationChanged).toBe(true);

    const snapshot = await orchestrator.snapshot(project.id);
    expect(snapshot.project.id).toBe(project.id);
  });
});
