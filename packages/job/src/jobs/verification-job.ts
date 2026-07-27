import type {
  IntentId,
  JobId,
  JobPriority,
  RetryPolicy,
  RollbackPolicy,
  RuntimeId,
  VerificationCheck,
  VerificationCheckType,
  VerificationPolicy,
} from '@vestara/types';
import type { JobObserver } from '../index';
import { Job } from '../index';

export interface VerificationSpec {
  type: 'lint' | 'test' | 'build' | 'review';
  priority: JobPriority;
  checkType: VerificationCheckType;
  target: string;
  checks?: VerificationCheck[];
  permissions?: string[];
  capabilities?: string[];
  verification?: Partial<VerificationPolicy>;
  rollback?: Partial<RollbackPolicy>;
  retry?: Partial<RetryPolicy>;
  timeout?: number;
}

export class VerificationJob extends Job {
  readonly checkType: VerificationCheckType;
  readonly target: string;
  readonly checks: readonly VerificationCheck[];

  constructor(
    id: JobId,
    spec: VerificationSpec,
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
    this.checkType = spec.checkType;
    this.target = spec.target;
    this.checks = spec.checks ?? [];
  }

  get verificationInfo(): { checkType: VerificationCheckType; target: string } {
    return {
      checkType: this.checkType,
      target: this.target,
    };
  }
}
