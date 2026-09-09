/**
 * Canonical execution observation — how a runtime adapter reports execution behavior.
 *
 * CORE-004 Phase G: The minimum runtime-neutral mechanism by which the adapter
 * reports execution behavior. This is an internal execution observation boundary.
 * Transport (SSE/WebSocket) comes later.
 *
 * Observations are ephemeral — they represent what the runtime is doing,
 * not what Vestara has decided. Vestara owns lifecycle state transitions;
 * the adapter reports what it observes from the runtime.
 *
 * INVARIANT: Observations are runtime-neutral. No OpenCode-specific types
 * appear in observation payloads. Native runtime identity is preserved
 * in metadata fields where required.
 */

import type { ExecutionArtifact, ExecutionEvidence } from './artifacts.js';
import type { ExecutionId, OperationId } from './identity.js';
import type { ExecutionStatus } from './lifecycle.js';

/**
 * The canonical permission action (from @vestara/permission-contracts).
 * Replicated here to avoid a dependency on permission-contracts from the
 * observation module. The adapter MUST populate this field.
 */
export type CanonicalPermissionAction =
  | 'read'
  | 'edit'
  | 'write'
  | 'glob'
  | 'grep'
  | 'list'
  | 'bash'
  | 'webfetch'
  | 'websearch'
  | 'external-directory'
  | 'other';

/**
 * Execution observation — the base interface for all observations.
 */
export interface ExecutionObservationBase {
  /** The execution this observation belongs to. */
  readonly executionId: ExecutionId;
  /** When this observation occurred. */
  readonly timestamp: string;
}

/**
 * Activity observation — what the execution is doing right now.
 *
 * Maps to @vestara/execution-types ExecutionActivity.
 */
export interface ExecutionActivityObservation extends ExecutionObservationBase {
  readonly kind: 'activity';
  /** Identity of this activity item. */
  readonly operationId: OperationId;
  /** What type of activity this is. */
  readonly activityType: ExecutionActivityType;
  /** Human-readable name (tool name, file path, etc.). */
  readonly name?: string;
  /** Current state of this activity. */
  readonly state: 'running' | 'completed' | 'failed';
  /** Activity-specific detail (runtime-neutral). */
  readonly detail?: Record<string, unknown>;
  /** Parent activity (for nested operations). */
  readonly parentOperationId?: OperationId;
}

/**
 * Status observation — lifecycle state change.
 */
export interface ExecutionStatusObservation extends ExecutionObservationBase {
  readonly kind: 'status';
  /** The new execution status. */
  readonly status: ExecutionStatus;
  /** Human-readable reason for the transition. */
  readonly reason?: string;
}

/**
 * Permission observation — a permission request from the runtime.
 *
 * CRITICAL INVARIANT: Preserves both the canonical permission action
 * AND the runtime-native operation identity. The adapter MUST populate
 * `nativeAction` with the original runtime-specific action string.
 *
 * Example:
 *   canonicalAction: 'other'
 *   nativeAction: 'todowrite'
 *   runtime: 'opencode'
 */
export interface ExecutionPermissionObservation extends ExecutionObservationBase {
  readonly kind: 'permission';
  /** Permission request identity (runtime-native). */
  readonly permissionRequestId: string;
  /** Canonical permission action (normalized by Vestara). */
  readonly canonicalAction: CanonicalPermissionAction;
  /** Runtime-native action string (preserves native identity). */
  readonly nativeAction: string;
  /** Runtime identifier. */
  readonly runtime: string;
  /** Resources the permission applies to. */
  readonly resources: readonly string[];
  /** Risk classification. */
  readonly risk: 'safe' | 'sensitive' | 'dangerous';
}

/**
 * Artifact observation — an artifact produced by the execution.
 */
export interface ExecutionArtifactObservation extends ExecutionObservationBase {
  readonly kind: 'artifact';
  /** The artifact. */
  readonly artifact: ExecutionArtifact;
}

/**
 * Evidence observation — evidence collected during execution.
 */
export interface ExecutionEvidenceObservation extends ExecutionObservationBase {
  readonly kind: 'evidence';
  /** The evidence. */
  readonly evidence: ExecutionEvidence;
}

/**
 * Result observation — terminal execution result.
 */
export interface ExecutionResultObservation extends ExecutionObservationBase {
  readonly kind: 'result';
  /** Terminal status. */
  readonly status: 'completed' | 'failed' | 'cancelled' | 'timed_out';
  /** Textual output. */
  readonly output?: string;
  /** Error details. */
  readonly error?: { readonly code: string; readonly message: string; readonly recoverable: boolean };
  /** Usage metrics. */
  readonly usage?: {
    readonly promptTokens?: number;
    readonly completionTokens?: number;
    readonly totalTokens?: number;
  };
}

/**
 * Error observation — a non-terminal error during execution.
 */
export interface ExecutionErrorObservation extends ExecutionObservationBase {
  readonly kind: 'error';
  /** Error code. */
  readonly code: string;
  /** Error message. */
  readonly message: string;
  /** Whether the error is recoverable. */
  readonly recoverable: boolean;
}

/**
 * Discriminated union of all execution observations.
 */
export type ExecutionObservation =
  | ExecutionActivityObservation
  | ExecutionStatusObservation
  | ExecutionPermissionObservation
  | ExecutionArtifactObservation
  | ExecutionEvidenceObservation
  | ExecutionResultObservation
  | ExecutionErrorObservation;

/**
 * Activity types that map from runtime events to canonical observations.
 */
export type ExecutionActivityType =
  | 'text-delta'
  | 'tool-call'
  | 'tool-result'
  | 'file-edit'
  | 'shell-command'
  | 'permission-request'
  | 'permission-response'
  | 'question-asked'
  | 'question-answered'
  | 'subagent-started'
  | 'subagent-completed'
  | 'status-update';
