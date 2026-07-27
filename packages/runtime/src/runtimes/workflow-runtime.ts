import type { RuntimeId } from '@vestara/types';
import { Runtime, type RuntimeConfig, type RuntimeHooks } from '../index';

export interface WorkflowStep {
  id: string;
  name: string;
  runner: RuntimeId;
  dependsOn: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
}

export class WorkflowRuntime extends Runtime {
  private _wfDefinition: WorkflowDefinition;
  private _completedSteps: number = 0;
  private _currentStep: string | null = null;

  constructor(config: RuntimeConfig, definition: WorkflowDefinition, hooks?: RuntimeHooks) {
    super(config, {
      onInitialize: async () => {
        this.saveSnapshot('workflow-init', { stepCount: definition.steps.length });
        if (hooks?.onInitialize) await hooks.onInitialize();
      },
      onSuspend: async () => {
        this.saveSnapshot('workflow-suspend', {
          currentStep: this._currentStep,
          completedSteps: this._completedSteps,
          stepStatuses: definition.steps.map((s) => ({ id: s.id, status: s.status })),
        });
        if (hooks?.onSuspend) await hooks.onSuspend();
      },
      onResume: async () => {
        const snapshot = this.getCheckpoint('workflow-suspend');
        if (snapshot && typeof snapshot === 'object' && snapshot !== null) {
          const data = snapshot as Record<string, unknown>;
          if (typeof data.completedSteps === 'number') {
            this._completedSteps = data.completedSteps;
          }
        }
        if (hooks?.onResume) await hooks.onResume();
      },
      onStop: async () => {
        this.saveSnapshot('workflow-stop', {
          finalCompletedSteps: this._completedSteps,
          stepStatuses: definition.steps.map((s) => ({ id: s.id, status: s.status })),
        });
        if (hooks?.onStop) await hooks.onStop();
      },
      onDestroy: hooks?.onDestroy,
      onDegrade: hooks?.onDegrade,
      onRecover: hooks?.onRecover,
    });
    this._wfDefinition = definition;
  }

  get definition(): WorkflowDefinition {
    return this._wfDefinition;
  }

  get completedSteps(): number {
    return this._completedSteps;
  }

  get totalSteps(): number {
    return this._wfDefinition.steps.length;
  }

  get progress(): number {
    return this.totalSteps > 0 ? this._completedSteps / this.totalSteps : 0;
  }

  get currentStep(): string | null {
    return this._currentStep;
  }

  async executeStep(stepId: string): Promise<void> {
    const step = this._wfDefinition.steps.find((s) => s.id === stepId);
    if (!step) throw new Error(`Step "${stepId}" not found in workflow "${this._wfDefinition.id}"`);

    step.status = 'running';
    this._currentStep = stepId;
    this.checkpoint(`step:${stepId}`, { status: 'running', startedAt: new Date().toISOString() });
  }

  completeStep(stepId: string, result?: unknown): void {
    const step = this._wfDefinition.steps.find((s) => s.id === stepId);
    if (!step) return;

    step.status = 'completed';
    step.result = result;
    this._currentStep = null;
    this._completedSteps++;
    this.checkpoint(`step:${stepId}`, { status: 'completed', result });
    this.saveSnapshot('workflow-progress', {
      completedSteps: this._completedSteps,
      lastStep: stepId,
    });
  }

  failStep(stepId: string, error: string): void {
    const step = this._wfDefinition.steps.find((s) => s.id === stepId);
    if (!step) return;

    step.status = 'failed';
    step.result = { error };
    this._currentStep = null;
    this.checkpoint(`step:${stepId}`, { status: 'failed', error });
  }

  getStatus(): { id: string; name: string; progress: number; currentStep: string | null } {
    return {
      id: this.id,
      name: this._wfDefinition.name,
      progress: this.progress,
      currentStep: this._currentStep,
    };
  }

  private saveSnapshot(key: string, data: Record<string, unknown>): void {
    this.checkpoint(key, { ...data, timestamp: new Date().toISOString() });
  }
}
