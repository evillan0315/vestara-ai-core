import type { AIProvider } from '@vestara/shared';
import type { ChangeSetStorage } from './change-set-storage';
import type { PlanStorage } from './plan-storage';
import type { VerificationStorage } from './verification-storage';
import type { WorkspaceSession } from './workspace-session';

export interface WorkflowStepResult {
  stepId: string;
  agentId: string;
  status: 'running' | 'completed' | 'failed';
  artifactId?: string;
  artifactType?: 'plan' | 'changeset' | 'verification';
  duration: number;
  error?: string;
}

export interface WorkflowInstance {
  id: string;
  name: string;
  steps: WorkflowStepDef[];
  results: WorkflowStepResult[];
  status: 'idle' | 'running' | 'completed' | 'failed';
  goal: string;
}

export interface WorkflowStepDef {
  id: string;
  agentId: string;
  label: string;
  produces: 'plan' | 'changeset' | 'verification';
}

const BUILTIN_WORKFLOWS: Record<string, { name: string; steps: WorkflowStepDef[] }> = {
  feature: {
    name: 'Feature Development',
    steps: [
      { id: 'architect', agentId: 'architect', label: 'Create Plan', produces: 'plan' },
      { id: 'developer', agentId: 'developer', label: 'Implement Changes', produces: 'changeset' },
      { id: 'verifier', agentId: 'verifier', label: 'Verify Changes', produces: 'verification' },
    ],
  },
};

/**
 * @deprecated Superseded by ADR-118 / PCS-025 multi-agent orchestration
 * (`@vestara/workflow-orchestrator`). This is the single hard-coded sequential
 * `feature` prototype (architect → developer → verifier) with in-memory state
 * only; it is retained for reference and not referenced by any API route.
 */
export class AgentWorkflowService {
  private planStorage?: PlanStorage;
  private csStorage?: ChangeSetStorage;
  private vrStorage?: VerificationStorage;
  private provider?: AIProvider;
  private instances: Map<string, WorkflowInstance> = new Map();

  constructor(opts?: {
    planStorage?: PlanStorage;
    csStorage?: ChangeSetStorage;
    vrStorage?: VerificationStorage;
    provider?: AIProvider;
  }) {
    this.planStorage = opts?.planStorage;
    this.csStorage = opts?.csStorage;
    this.vrStorage = opts?.vrStorage;
    this.provider = opts?.provider;
  }

  listDefinitions(): Array<{ id: string; name: string; steps: number }> {
    return Object.entries(BUILTIN_WORKFLOWS).map(([id, wf]) => ({
      id,
      name: wf.name,
      steps: wf.steps.length,
    }));
  }

  start(workflowId: string, goal: string): WorkflowInstance {
    const def = BUILTIN_WORKFLOWS[workflowId];
    if (!def) throw new Error(`Unknown workflow: ${workflowId}`);

    const id = `wf-${workflowId}-${Date.now()}`;
    const instance: WorkflowInstance = {
      id,
      name: def.name,
      steps: def.steps,
      results: [],
      status: 'idle',
      goal,
    };
    this.instances.set(id, instance);
    return instance;
  }

  async run(instanceId: string, session: WorkspaceSession): Promise<WorkflowInstance> {
    const wf = this.instances.get(instanceId);
    if (!wf) throw new Error(`Workflow ${instanceId} not found`);
    if (wf.status === 'running') throw new Error('Workflow is already running');

    wf.status = 'running';
    let lastPlanId: string | undefined;
    let lastChangeSetId: string | undefined;

    for (const step of wf.steps) {
      const stepResult: WorkflowStepResult = {
        stepId: step.id,
        agentId: step.agentId,
        status: 'running',
        duration: 0,
      };
      wf.results.push(stepResult);

      const startTime = performance.now();
      try {
        if (step.agentId === 'architect' && this.planStorage) {
          const { PlanningService } = await import('./planning-service.js');
          const planner = new PlanningService({ storage: this.planStorage, provider: this.provider });
          const result = await planner.createPlan(wf.goal, session);
          lastPlanId = result.plan.id;
          // Auto-approve the plan so the next step (developer) can implement it
          await this.planStorage.updateStatus(lastPlanId, 'approved');
          stepResult.artifactId = result.plan.id;
          stepResult.artifactType = 'plan';
        } else if (step.agentId === 'developer' && this.csStorage && this.planStorage && lastPlanId) {
          const { ImplementationService } = await import('./implementation-service.js');
          const impl = new ImplementationService({
            planStorage: this.planStorage,
            csStorage: this.csStorage,
            provider: this.provider,
          });
          const result = await impl.implement(lastPlanId, session);
          lastChangeSetId = result.changeSet.id;
          stepResult.artifactId = result.changeSet.id;
          stepResult.artifactType = 'changeset';
        } else if (
          step.agentId === 'verifier' &&
          this.csStorage &&
          this.vrStorage &&
          this.planStorage &&
          lastChangeSetId
        ) {
          const { VerificationService } = await import('./verification-service.js');
          const verifier = new VerificationService({
            csStorage: this.csStorage,
            vrStorage: this.vrStorage,
            planStorage: this.planStorage,
          });
          const result = await verifier.verify(lastChangeSetId, session);
          stepResult.artifactId = result.report.id;
          stepResult.artifactType = 'verification';
        } else {
          throw new Error(`Cannot execute step ${step.id}: missing storage or dependency`);
        }

        stepResult.status = 'completed';
        stepResult.duration = Math.round(performance.now() - startTime);
      } catch (error: any) {
        stepResult.status = 'failed';
        stepResult.error = error.message;
        stepResult.duration = Math.round(performance.now() - startTime);
        wf.status = 'failed';
        return wf;
      }
    }

    wf.status = 'completed';
    return wf;
  }

  getInstance(id: string): WorkflowInstance | undefined {
    return this.instances.get(id);
  }

  listInstances(): WorkflowInstance[] {
    return Array.from(this.instances.values());
  }

  renderDefinitionList(): string {
    const defs = this.listDefinitions();
    if (defs.length === 0) return 'No workflows defined.';
    const lines: string[] = ['Available Workflows:'];
    for (const d of defs) {
      lines.push(`  ${d.id.padEnd(15)} ${d.name.padEnd(25)} ${d.steps} steps`);
    }
    return lines.join('\n');
  }

  renderInstance(wf: WorkflowInstance): string {
    const lines: string[] = [];
    lines.push(`${wf.name}: ${wf.goal}`);
    lines.push(`Status: ${wf.status}`);
    lines.push('');

    for (const r of wf.results) {
      const icon = r.status === 'completed' ? '✓' : r.status === 'failed' ? '✗' : '→';
      const duration = r.duration > 0 ? ` (${r.duration}ms)` : '';
      lines.push(`  ${icon} ${r.agentId}: ${r.artifactId ?? r.status}${duration}`);
      if (r.error) lines.push(`     ${r.error}`);
    }

    const pending = wf.steps.filter((s) => !wf.results.find((r) => r.stepId === s.id));
    for (const s of pending) {
      lines.push(`  · ${s.agentId}: pending`);
    }

    return lines.join('\n');
  }
}
