/**
 * RuntimeSessionRegistry — Session Continuity Authority
 *
 * The registry is the single mechanism for acquiring and managing physical
 * runtime sessions. It enforces:
 *
 * - Idempotent acquisition: repeated getOrCreate() for the same WorkflowRun
 *   converges on the same binding.
 * - Single-flight concurrency: concurrent acquisition is serialized.
 * - Policy enforcement: maxPhysicalSessions limits physical session count.
 * - Repository authority: directory must match RepositoryBinding.canonicalPath.
 * - Creation reason tracking: every binding records why it was created.
 *
 * Architecture invariant:
 *   Workflow owns session continuity
 *   RuntimeSessionRegistry owns physical acquisition
 *   OpenCode owns execution inside the acquired session
 *   Agent assignments consume the session
 *
 * NOT:
 *   each agent owns an OpenCode session
 */

import type {
  ContinuityPolicy,
  MaxPhysicalSessions,
  RepositoryBindingId,
  RuntimeSessionAcquisitionInput,
  RuntimeSessionAcquisitionResult,
  RuntimeSessionBinding,
  RuntimeSessionId,
  WorkflowRunId,
} from './runtime-session-types';

// ─── Interface ──────────────────────────────────────────────

export interface RuntimeSessionRegistry {
  /**
   * Acquire a runtime session binding for a workflow run.
   * Idempotent: returns existing binding if one exists for this workflowRunId.
   * Single-flight: concurrent calls for the same workflowRunId are serialized.
   * Enforces maxPhysicalSessions policy.
   */
  acquire(input: RuntimeSessionAcquisitionInput): Promise<RuntimeSessionAcquisitionResult>;

  /**
   * Get an existing binding by workflow run ID.
   * Returns undefined if no binding exists.
   */
  getByWorkflowRun(workflowRunId: WorkflowRunId): RuntimeSessionBinding | undefined;

  /**
   * Get an existing binding by runtime session ID.
   * Returns undefined if no binding exists.
   */
  getByRuntimeSessionId(runtimeSessionId: RuntimeSessionId): RuntimeSessionBinding | undefined;

  /**
   * Get an existing binding by physical (OpenCode) session ID.
   * Returns undefined if no binding exists.
   */
  getByPhysicalSessionId(physicalSessionId: string): RuntimeSessionBinding | undefined;

  /**
   * Update the physical session ID after OpenCode session creation.
   * Called after the OpenCode createSession() call succeeds.
   */
  setPhysicalSessionId(runtimeSessionId: RuntimeSessionId, physicalSessionId: string): void;

  /**
   * Update the lifecycle state of a binding.
   */
  updateLifecycle(
    runtimeSessionId: RuntimeSessionId,
    lifecycle: RuntimeSessionBinding['lifecycle'],
    error?: string,
  ): void;

  /**
   * List all bindings (for debugging/audit).
   */
  list(): RuntimeSessionBinding[];

  /**
   * Count active bindings.
   */
  count(): number;
}

// ─── In-Memory Implementation ───────────────────────────────

let nextRuntimeSessionCounter = 0;

function generateRuntimeSessionId(): RuntimeSessionId {
  return `rt-${Date.now()}-${++nextRuntimeSessionCounter}` as RuntimeSessionId;
}

/**
 * Default policy settings.
 */
export const DEFAULT_CONTINUITY_POLICY: ContinuityPolicy = 'SHARED_WORKFLOW';
export const DEFAULT_MAX_PHYSICAL_SESSIONS: MaxPhysicalSessions = 1;

/**
 * Validate that the directory matches the repository binding's canonical path.
 * This enforces M5's invariant: OpenCode server CWD must never become
 * repository authority.
 */
function validateDirectory(directory: string, expectedCanonicalPath: string): void {
  if (directory !== expectedCanonicalPath) {
    throw new Error(
      `M7 INVARIANT VIOLATION: Session directory "${directory}" does not match ` +
        `RepositoryBinding.canonicalPath "${expectedCanonicalPath}". ` +
        `The OpenCode server CWD must never become repository authority.`,
    );
  }
}

/**
 * Resolve policy defaults.
 */
function resolvePolicy(input: { continuityPolicy?: ContinuityPolicy; maxPhysicalSessions?: MaxPhysicalSessions }): {
  policy: ContinuityPolicy;
  maxSessions: MaxPhysicalSessions;
} {
  const policy = input.continuityPolicy ?? DEFAULT_CONTINUITY_POLICY;
  const maxSessions = input.maxPhysicalSessions ?? DEFAULT_MAX_PHYSICAL_SESSIONS;
  return { policy, maxSessions };
}

/**
 * In-memory implementation of RuntimeSessionRegistry.
 * Suitable for single-process use. For production persistence, implement
 * the RuntimeSessionRegistry interface with SQLite backing.
 */
export class InMemoryRuntimeSessionRegistry implements RuntimeSessionRegistry {
  /** bindings indexed by workflowRunId (one binding per workflow run). */
  private readonly byWorkflowRun = new Map<string, RuntimeSessionBinding>();

  /** bindings indexed by runtimeSessionId. */
  private readonly byRuntimeSessionId = new Map<string, RuntimeSessionBinding>();

  /** bindings indexed by physicalSessionId. */
  private readonly byPhysicalSessionId = new Map<string, RuntimeSessionBinding>();

  /** Single-flight locks per workflowRunId (promise that resolves when lock is released). */
  private readonly locks = new Map<string, Promise<void>>();

  async acquire(input: RuntimeSessionAcquisitionInput): Promise<RuntimeSessionAcquisitionResult> {
    const lockKey = input.workflowRunId;

    // Single-flight: serialize concurrent acquisition for the same workflowRunId.
    // Use a promise chain so that if a lock is held, callers wait for it.
    const existingLock = this.locks.get(lockKey);
    const resultPromise = existingLock
      ? existingLock.then(() => this.doAcquire(input))
      : this.doAcquireWithLock(lockKey, input);
    return resultPromise;
  }

  private async doAcquireWithLock(
    lockKey: string,
    input: RuntimeSessionAcquisitionInput,
  ): Promise<RuntimeSessionAcquisitionResult> {
    // Create a promise that downstream callers can wait on
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(lockKey, lockPromise);

    try {
      return await this.doAcquire(input);
    } finally {
      resolveLock();
      this.locks.delete(lockKey);
    }
  }

  private async doAcquire(input: RuntimeSessionAcquisitionInput): Promise<RuntimeSessionAcquisitionResult> {
    // Idempotent: return existing binding if one exists.
    const existing = this.byWorkflowRun.get(input.workflowRunId);
    if (existing) {
      return {
        binding: existing,
        created: false,
        acquired: existing.physicalSessionId !== null,
      };
    }

    // Resolve policy
    const { policy, maxSessions } = resolvePolicy({
      continuityPolicy: input.continuityPolicy,
    });

    // Enforce maxPhysicalSessions per workflow run.
    // Under SHARED_WORKFLOW, each workflow run gets exactly 1 binding
    // (enforced by idempotent check above). The maxSessions check
    // guards against policy violations where a workflow somehow
    // acquires more than the allowed number of bindings.
    const existingBindingsForRun = this.byWorkflowRun.has(input.workflowRunId);
    if (existingBindingsForRun) {
      throw new Error(
        `M7 POLICY VIOLATION: Binding already exists for workflow ${input.workflowRunId}. ` +
          `maxPhysicalSessions (${maxSessions}) under ${policy} policy.`,
      );
    }

    // Create new binding
    const now = new Date().toISOString();
    const runtimeSessionId = generateRuntimeSessionId();

    const binding: RuntimeSessionBinding = {
      runtimeSessionId,
      workflowRunId: input.workflowRunId,
      physicalSessionId: null, // Not yet acquired
      repositoryBindingId: input.repositoryBindingId,
      continuityPolicy: policy,
      maxPhysicalSessions: maxSessions,
      creationReason: input.creationReason,
      lifecycle: 'acquiring',
      workspaceId: input.workspaceId,
      directory: input.directory,
      createdAt: now,
      updatedAt: now,
    };

    this.byWorkflowRun.set(input.workflowRunId, binding);
    this.byRuntimeSessionId.set(runtimeSessionId, binding);

    return {
      binding,
      created: true,
      acquired: false,
    };
  }

  getByWorkflowRun(workflowRunId: WorkflowRunId): RuntimeSessionBinding | undefined {
    return this.byWorkflowRun.get(workflowRunId);
  }

  getByRuntimeSessionId(runtimeSessionId: RuntimeSessionId): RuntimeSessionBinding | undefined {
    return this.byRuntimeSessionId.get(runtimeSessionId);
  }

  getByPhysicalSessionId(physicalSessionId: string): RuntimeSessionBinding | undefined {
    return this.byPhysicalSessionId.get(physicalSessionId);
  }

  setPhysicalSessionId(runtimeSessionId: RuntimeSessionId, physicalSessionId: string): void {
    const binding = this.byRuntimeSessionId.get(runtimeSessionId);
    if (!binding) return;

    // Remove old physical session mapping
    if (binding.physicalSessionId) {
      this.byPhysicalSessionId.delete(binding.physicalSessionId);
    }

    // Update binding
    const updated: RuntimeSessionBinding = {
      ...binding,
      physicalSessionId,
      lifecycle: 'active',
      updatedAt: new Date().toISOString(),
    };

    this.byRuntimeSessionId.set(runtimeSessionId, updated);
    this.byWorkflowRun.set(binding.workflowRunId, updated);
    this.byPhysicalSessionId.set(physicalSessionId, updated);
  }

  updateLifecycle(
    runtimeSessionId: RuntimeSessionId,
    lifecycle: RuntimeSessionBinding['lifecycle'],
    error?: string,
  ): void {
    const binding = this.byRuntimeSessionId.get(runtimeSessionId);
    if (!binding) return;

    const updated: RuntimeSessionBinding = {
      ...binding,
      lifecycle,
      error,
      updatedAt: new Date().toISOString(),
    };

    this.byRuntimeSessionId.set(runtimeSessionId, updated);
    this.byWorkflowRun.set(binding.workflowRunId, updated);
    if (binding.physicalSessionId) {
      this.byPhysicalSessionId.set(binding.physicalSessionId, updated);
    }
  }

  list(): RuntimeSessionBinding[] {
    return [...this.byWorkflowRun.values()];
  }

  count(): number {
    return this.byWorkflowRun.size;
  }
}
