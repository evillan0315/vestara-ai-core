/**
 * @vestara/execution-types — Canonical Vestara execution contracts.
 *
 * This package defines the minimum runtime-neutral vocabulary for
 * requesting, governing, observing, and completing bounded execution
 * independent of OpenCode, Codex, Claude Code, or any future runtime.
 *
 * INVARIANTS:
 *   - Layer-0 leaf package (depends only on @vestara/types and @vestara/permission-contracts)
 *   - No runtime behavior, no persistence, no HTTP, no UI
 *   - Runtime-neutral: no OpenCode-specific concepts
 *   - Execution completion ≠ verification success (orthogonal concerns)
 *   - Execution activity ≠ execution lifecycle state
 *   - Artifacts use references, not embedded payloads
 */

// ── Identity ────────────────────────────────────────────────────────────────

export {
  // Re-exports from @vestara/types
  type ExecutionId,
  type OperationId,
  operationId,
  type RuntimeSessionId,
  type TurnId,
  turnId,
  type WorkflowRunId,
  type WorkflowTaskId,
} from './identity.js';

// ── Lifecycle ───────────────────────────────────────────────────────────────

export {
  EXECUTION_NON_TERMINAL_STATES,
  EXECUTION_TERMINAL_STATES,
  EXECUTION_TRANSITIONS,
  type ExecutionActivityState,
  type ExecutionStatus,
  isExecutionTerminal,
  isValidTransition,
} from './lifecycle.js';

// ── Request ─────────────────────────────────────────────────────────────────

export type {
  ExecutionActor,
  ExecutionContext,
  ExecutionRequest,
  PermissionContext,
  RoutingIntent,
} from './request.js';

// ── Result ──────────────────────────────────────────────────────────────────

export type {
  ExecutionError,
  ExecutionResult,
  ExecutionTerminalStatus,
  ExecutionTimeoutConfig,
  ExecutionTiming,
  ExecutionUsage,
  VerificationOutcome,
} from './result.js';

// ── Lineage ─────────────────────────────────────────────────────────────────

export {
  ancestorIds,
  type ExecutionLineageNode,
  executionDepth,
  isAncestor,
} from './lineage.js';

// ── Binding ─────────────────────────────────────────────────────────────────

export type {
  RuntimeBinding,
  RuntimeBindingInput,
} from './binding.js';

// ── Activity ────────────────────────────────────────────────────────────────

export type {
  ActivityItemState,
  ExecutionActivity,
  ExecutionActivityType,
} from './activity.js';

// ── Artifacts ───────────────────────────────────────────────────────────────

export type {
  ArtifactKind,
  EvidenceKind,
  ExecutionArtifact,
  ExecutionEvidence,
} from './artifacts.js';

// ── Observations ────────────────────────────────────────────────────────────

export type {
  CanonicalPermissionAction,
  ExecutionActivityObservation,
  ExecutionArtifactObservation,
  ExecutionErrorObservation,
  ExecutionEvidenceObservation,
  ExecutionObservation,
  ExecutionObservationBase,
  ExecutionPermissionObservation,
  ExecutionResultObservation,
  ExecutionStatusObservation,
} from './observations.js';

// ── Port ────────────────────────────────────────────────────────────────────

export type {
  RuntimeExecutionHandle,
  RuntimeExecutionPort,
} from './port.js';
