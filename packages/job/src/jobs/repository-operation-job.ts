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

export interface RepositoryOperationSpec {
  type: 'implement' | 'refactor' | 'migrate' | 'configure' | 'deploy' | 'build';
  priority: JobPriority;
  operation: string;
  targetPath: string;
  filePatterns?: string[];
  message?: string;
  permissions?: string[];
  capabilities?: string[];
  verification?: Partial<VerificationPolicy>;
  rollback?: Partial<RollbackPolicy>;
  retry?: Partial<RetryPolicy>;
  timeout?: number;
}

export class RepositoryOperationJob extends Job {
  readonly operation: string;
  readonly targetPath: string;
  readonly filePatterns: readonly string[];
  readonly message: string | null;

  constructor(
    id: JobId,
    spec: RepositoryOperationSpec,
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
    this.operation = spec.operation;
    this.targetPath = spec.targetPath;
    this.filePatterns = spec.filePatterns ?? [];
    this.message = spec.message ?? null;
  }

  get repositoryInfo(): { operation: string; targetPath: string; message: string | null } {
    return {
      operation: this.operation,
      targetPath: this.targetPath,
      message: this.message,
    };
  }
}
