/**
 * ARX-015 M7: RuntimeSessionBinding — Session Continuity Authority
 *
 * A RuntimeSessionBinding is the single authoritative link between a workflow
 * run and its physical runtime session. It establishes session continuity
 * without conflating workflow identity, execution identity, or session identity.
 *
 * Architecture:
 *   workflowRunId
 *       ↓
 *   RuntimeSessionBinding (continuity authority)
 *       ↓
 *   physicalSessionId (OpenCode session)
 *       ↓
 *   repositoryBindingId (M5 authority)
 *       ↓
 *   continuityPolicy + creationReason
 *
 * The binding is the ONLY mechanism that creates physical runtime sessions.
 * Agent assignments consume the session; they never create new ones.
 *
 * Policy:
 *   SHARED_WORKFLOW (default): all stages share one physical session
 *   ISOLATED_TASK: each task gets its own session (explicit opt-in)
 *   ISOLATED_AGENT: each agent gets its own session (explicit opt-in)
 */

import type { RepositoryBindingId, RuntimeSessionId, WorkflowRunId } from './ids';

// ─── Continuity Policy ──────────────────────────────────────

/**
 * Policy controlling how workflow stages relate to physical runtime sessions.
 *
 * - SHARED_WORKFLOW: All stages share one physical session (default).
 * - ISOLATED_TASK: Each task gets its own physical session.
 * - ISOLATED_AGENT: Each agent gets its own physical session.
 */
export type ContinuityPolicy = 'SHARED_WORKFLOW' | 'ISOLATED_TASK' | 'ISOLATED_AGENT';

/**
 * Maximum physical sessions allowed per workflow run under the current policy.
 * Under SHARED_WORKFLOW, this is 1.
 */
export type MaxPhysicalSessions = 1 | number;

// ─── Creation Reason ────────────────────────────────────────

/**
 * Typed reason for creating a physical runtime session.
 * Every creation must record one of these reasons.
 */
export type SessionCreationReason =
  | 'workflow-start'
  | 'explicit-isolation'
  | 'context-limit-rollover'
  | 'runtime-recovery'
  | 'repository-change'
  | 'provider-incompatibility'
  | 'operator-request';

// ─── Lifecycle ──────────────────────────────────────────────

/**
 * Lifecycle state of a runtime session binding.
 *
 * - acquiring: Lock held, session creation in progress
 * - active: Physical session acquired and ready for use
 * - completed: Workflow finished, session released
 * - failed: Session acquisition or execution failed
 * - rollover: Context limit hit, new session needed (policy permitting)
 */
export type RuntimeSessionLifecycle = 'acquiring' | 'active' | 'completed' | 'failed' | 'rollover';

// ─── RuntimeSessionBinding ──────────────────────────────────

/**
 * The single authoritative binding between a workflow run and its physical
 * runtime session. This is the continuity authority — not the agent assignment,
 * not the execution session, not the workflow run itself.
 */
export interface RuntimeSessionBinding {
  /** Unique binding identity. */
  readonly runtimeSessionId: RuntimeSessionId;

  /** The workflow run this binding serves. */
  readonly workflowRunId: WorkflowRunId;

  /** Physical OpenCode session ID (pattern: ^ses). Null if not yet acquired. */
  readonly physicalSessionId: string | null;

  /** Repository binding establishing execution directory authority (M5). */
  readonly repositoryBindingId: RepositoryBindingId;

  /** Continuity policy governing session sharing. */
  readonly continuityPolicy: ContinuityPolicy;

  /** Maximum physical sessions allowed under this policy. */
  readonly maxPhysicalSessions: MaxPhysicalSessions;

  /** Reason this binding was created. */
  readonly creationReason: SessionCreationReason;

  /** Current lifecycle state. */
  readonly lifecycle: RuntimeSessionLifecycle;

  /** Workspace ID for ownership enforcement. */
  readonly workspaceId: string;

  /** Directory passed to OpenCode session creation (must == RepositoryBinding.canonicalPath). */
  readonly directory: string;

  /** Timestamp when this binding was created. */
  readonly createdAt: string;

  /** Timestamp when this binding was last updated. */
  readonly updatedAt: string;

  /** Error message if lifecycle is 'failed'. */
  readonly error?: string;
}

// ─── Acquisition Input ──────────────────────────────────────

/**
 * Input for acquiring a runtime session binding.
 * The registry uses this to either return an existing binding or create a new one.
 */
export interface RuntimeSessionAcquisitionInput {
  /** The workflow run to acquire a session for. */
  readonly workflowRunId: WorkflowRunId;

  /** Repository binding for directory authority. */
  readonly repositoryBindingId: RepositoryBindingId;

  /** Canonical repository root (must match RepositoryBinding.canonicalPath). */
  readonly directory: string;

  /** Continuity policy. Default: SHARED_WORKFLOW. */
  readonly continuityPolicy?: ContinuityPolicy;

  /** Reason for this acquisition. */
  readonly creationReason: SessionCreationReason;

  /** Workspace ID for ownership. */
  readonly workspaceId: string;
}

// ─── Acquisition Result ─────────────────────────────────────

/**
 * Result of a session acquisition attempt.
 */
export interface RuntimeSessionAcquisitionResult {
  /** The binding (may be newly created or existing). */
  readonly binding: RuntimeSessionBinding;

  /** Whether this call created a new binding (false = reused existing). */
  readonly created: boolean;

  /** Whether the physical session has been acquired (physicalSessionId is set). */
  readonly acquired: boolean;
}
