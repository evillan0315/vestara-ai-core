import type {
  IntentId,
  JobId,
  JobPriority,
  RetryPolicy,
  RollbackPolicy,
  RuntimeId,
  VerificationPolicy,
} from '@vestara/types';
import type { JobObserver } from '../index';
import { Job } from '../index';

export interface WorkflowExecutionSpec {
  type: 'plan' | 'implement' | 'test' | 'deploy';
  priority: JobPriority;
  workflowId: string;
  stepId: string;
  stepName: string;
  input: Record<string, unknown>;
  expectedOutputs?: string[];
  permissions?: string[];
  capabilities?: string[];
  verification?: Partial<VerificationPolicy>;
  rollback?: Partial<RollbackPolicy>;
  retry?: Partial<RetryPolicy>;
  timeout?: number;
}

export class WorkflowExecutionJob extends Job {
  readonly workflowId: string;
  readonly stepId: string;
  readonly stepName: string;
  readonly input: Record<string, unknown>;
  readonly expectedOutputs: readonly string[];

  constructor(
    id: JobId,
    spec: WorkflowExecutionSpec,
    owner: RuntimeId,
    runtime: RuntimeId,
    options?: { intent?: IntentId; dependencies?: JobId[] },
    observer?: JobObserver,
  ) {
    super(
      {
        id,
        spec: {
          type: spec.type,
          priority: spec.priority,
          permissions: spec.permissions,
          capabilities: spec.capabilities,
          verification: spec.verification,
          rollback: spec.rollback,
          retry: spec.retry,
          timeout: spec.timeout,
        },
        owner,
        runtime,
        intent: options?.intent,
        dependencies: options?.dependencies,
      },
      observer,
    );
    this.workflowId = spec.workflowId;
    this.stepId = spec.stepId;
    this.stepName = spec.stepName;
    this.input = { ...spec.input };
    this.expectedOutputs = spec.expectedOutputs ?? [];
  }

  get stepInfo(): { workflowId: string; stepId: string; stepName: string } {
    return {
      workflowId: this.workflowId,
      stepId: this.stepId,
      stepName: this.stepName,
    };
  }
}
