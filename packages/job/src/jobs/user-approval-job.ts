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

export interface UserApprovalSpec {
  type: 'approve';
  priority: JobPriority;
  prompt: string;
  context: Record<string, unknown>;
  approvalTarget: string;
  permissions?: string[];
  capabilities?: string[];
  verification?: Partial<VerificationPolicy>;
  rollback?: Partial<RollbackPolicy>;
  retry?: Partial<RetryPolicy>;
  timeout?: number;
}

export class UserApprovalJob extends Job {
  readonly prompt: string;
  readonly context: Record<string, unknown>;
  readonly approvalTarget: string;

  constructor(
    id: JobId,
    spec: UserApprovalSpec,
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
    this.prompt = spec.prompt;
    this.context = { ...spec.context };
    this.approvalTarget = spec.approvalTarget;
  }

  get approvalInfo(): { prompt: string; approvalTarget: string } {
    return {
      prompt: this.prompt,
      approvalTarget: this.approvalTarget,
    };
  }
}
