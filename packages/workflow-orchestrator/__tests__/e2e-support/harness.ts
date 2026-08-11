/**
 * WFO-E2E scenario harness.
 *
 * Assembles the full in-memory governed stack (orchestrator stores, scripted
 * provider, recording sinks, deterministic clock/ids, opportunity registry,
 * shadow observation runner, temporary repository) and drives the canonical
 * stage ledger. Everything runs in memory with no external model or network.
 */

import { MemoryOpportunityRegistryStore, OpportunityRegistry } from '@vestara/opportunity-registry';
import { migrate } from '@vestara/sqlite-migrations';
import type { Database } from 'sql.js';
import {
  DefaultWorkflowObservationRunner,
  DefaultWorkflowObserver,
  MemoryWorkflowObservationStore,
  OrchestratorWorkflowObservationAssembler,
} from '../../src/observation';
import { ORCHESTRATION_MANIFEST } from '../../src/orchestration-migrations';
import { WorkflowOrchestrator } from '../../src/orchestrator';
import { ArtifactStore, FileLockRegistry, PlanStore, ProjectStore, TaskStore } from '../../src/stores';
import type { CreateTaskInput } from '../../src/stores/task-store';
import type { ApprovalDecision, ApprovalPolicy, OrchestratedProject } from '../../src/types';
import { DeterministicIdGenerator, DeterministicWorkflowClock } from './clock';
import { type CanonicalStage, WorkflowStageLedger } from './lifecycle';
import { ScriptedModelProvider, type ScriptedModelScript } from './provider';
import { TemporaryRepository } from './repository';
import { RecordingEventSink, RecordingTelemetrySink } from './sinks';

let sqlPromise: Promise<{ Database: new (data?: Uint8Array | null) => Database }> | undefined;

async function sqlJs(): Promise<{ Database: new (data?: Uint8Array | null) => Database }> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const initSqlJs = (await import('sql.js')).default;
      return initSqlJs();
    })();
  }
  return sqlPromise;
}

export interface WorkflowScenarioOptions {
  readonly objective?: string;
  readonly script?: ScriptedModelScript;
  /** Files whose modification requires an approval gate. */
  readonly protectedFiles?: readonly string[];
}

export class WorkflowScenarioBuilder {
  readonly db: Database;
  readonly clock = new DeterministicWorkflowClock();
  readonly ids = new DeterministicIdGenerator();
  readonly repository = new TemporaryRepository();
  readonly events = new RecordingEventSink(this.clock);
  readonly telemetry = new RecordingTelemetrySink();
  readonly stages = new WorkflowStageLedger(this.clock);
  readonly provider: ScriptedModelProvider;
  readonly opportunityRegistry: OpportunityRegistry;
  readonly observationStore = new MemoryWorkflowObservationStore();
  readonly observationRunner: DefaultWorkflowObservationRunner;
  readonly orchestrator: WorkflowOrchestrator;

  private readonly projects: ProjectStore;
  readonly plans: PlanStore;
  private readonly tasks: TaskStore;
  private readonly artifacts: ArtifactStore;

  constructor(
    db: Database,
    private readonly options: WorkflowScenarioOptions = {},
  ) {
    this.db = db;
    this.projects = new ProjectStore(db);
    this.plans = new PlanStore(db);
    this.tasks = new TaskStore(db);
    migrate(db, ORCHESTRATION_MANIFEST, {});
    this.artifacts = new ArtifactStore(db);
    const locks = new FileLockRegistry(db);
    this.provider = new ScriptedModelProvider(options.script ?? { tasks: [] });

    const approvalPolicy = new E2EApprovalPolicy(options.protectedFiles ?? []);
    this.orchestrator = new WorkflowOrchestrator({
      projects: this.projects,
      plans: this.plans,
      tasks: this.tasks,
      artifacts: this.artifacts,
      locks,
      events: this.events,
      dispatcher: this.provider,
      retry: { maxAttempts: 1, maxRevisions: 1, backoffMs: () => 0 },
      approvalPolicy,
      onTelemetry: (op) => this.telemetry.onTelemetry(op),
    });

    this.opportunityRegistry = new OpportunityRegistry(new MemoryOpportunityRegistryStore(), () => this.clock.now());
    this.observationRunner = new DefaultWorkflowObservationRunner({
      assembler: new OrchestratorWorkflowObservationAssembler({
        snapshot: (projectId) => this.orchestrator.snapshot(projectId),
      }),
      observer: new DefaultWorkflowObserver(),
      store: this.observationStore,
      events: { emit: () => undefined },
      telemetry: { emitEvaluation: () => undefined },
    });
  }

  // ─── Canonical drive helpers (each advances the stage ledger) ───

  async intake(objective: string): Promise<OrchestratedProject> {
    const project = await this.orchestrator.createProject({
      name: objective,
      goal: objective,
      repoPath: this.repository.root,
      workspaceId: 'ws-e2e',
    });
    this.stages.transition('context', 'objective recorded');
    return project;
  }

  async contextAssembly(projectId: string): Promise<void> {
    await this.orchestrator.startProject(projectId);
    await this.orchestrator.completeAnalysis(projectId, { analystId: 'analyst', report: { summary: 'repo scanned' } });
  }

  async plan(projectId: string, tasks: readonly CreateTaskInput[]): Promise<void> {
    await this.orchestrator.generatePlan(projectId, {
      plannerId: 'planner',
      title: this.options.objective ?? 'Plan',
      goal: this.options.objective ?? 'Build',
      tasks,
    });
    this.stages.transition('planning', 'plan created');
  }

  async reviewPlan(projectId: string, status: 'approved' | 'violations'): Promise<void> {
    await this.orchestrator.reviewArchitecture(projectId, { architectId: 'reviewer', status });
    if (status === 'approved') {
      this.stages.transition('review-pending', 'plan review approved');
    } else {
      this.stages.transition('review-pending', 'plan review requested changes');
      this.stages.transition('changes-requested', 'revision required');
    }
  }

  async approve(projectId: string, approvalId = 'approval-1'): Promise<void> {
    await this.orchestrator.approveProject(projectId, { approvalId });
    this.stages.transition('approved', 'plan authorized');
  }

  async execute(projectId: string): Promise<void> {
    this.stages.transition('ready', 'execution scheduled');
    this.stages.transition('in-progress', 'tasks running');
    await this.orchestrator.runExecution(projectId);
    this.stages.transition('reviewing', 'implementation reviewed');
    this.stages.transition('verifying', 'implementation complete, awaiting verification');
  }

  async verify(projectId: string, passed: boolean): Promise<void> {
    await this.orchestrator.runVerification(projectId, {
      verifierId: 'verifier',
      report: { passed },
      passed,
    });
    if (passed) this.stages.transition('completed', 'verification passed');
    else this.stages.transition('changes-requested', 'verification failed — repair required');
  }

  /** Shadow observation after a material event — never applied. */
  observe(projectId: string) {
    return this.observationRunner.observe(projectId);
  }

  taskInput(overrides: Partial<CreateTaskInput> = {}): CreateTaskInput {
    return {
      planId: 'unused',
      summary: 'Implement the feature',
      description: 'Do the work',
      files: ['src/a.ts'],
      dependencies: [],
      effort: 'medium',
      requiredCapabilities: ['code-generation'],
      ...overrides,
    };
  }

  snapshot(projectId: string) {
    return this.orchestrator.snapshot(projectId);
  }

  dispose(): void {
    this.repository.dispose();
  }
}

export async function createScenario(options: WorkflowScenarioOptions = {}): Promise<WorkflowScenarioBuilder> {
  const { Database } = await sqlJs();
  return new WorkflowScenarioBuilder(new Database(), options);
}

/** Approval gate: tasks touching a protected file require approval. */
class E2EApprovalPolicy implements ApprovalPolicy {
  constructor(private readonly protectedFiles: readonly string[]) {}

  evaluate(task: { files: readonly string[] }): ApprovalDecision {
    const protectedHit = this.protectedFiles.find((file) => task.files.includes(file));
    return protectedHit
      ? { required: true, reason: `modifies protected file ${protectedHit}`, risk: 'high' }
      : { required: false, risk: 'low' };
  }
}

export class ApprovalTestDriver {
  constructor(private readonly orchestrator: WorkflowOrchestrator) {}

  pendingTasks(projectId: string) {
    return this.orchestrator.pendingApprovals(projectId);
  }

  approve(projectId: string, taskId: string): Promise<unknown> {
    return this.orchestrator.resolveTaskApproval(projectId, taskId, true);
  }

  reject(projectId: string, taskId: string): Promise<unknown> {
    return this.orchestrator.resolveTaskApproval(projectId, taskId, false);
  }
}

export type { CanonicalStage };
