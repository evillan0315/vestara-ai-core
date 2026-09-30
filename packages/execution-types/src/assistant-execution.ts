/**
 * Durable assistant-execution lifecycle contract.
 *
 * This is a runtime-neutral domain contract. It is deliberately independent
 * of persistence, HTTP, UI, Activity Room, OpenCode, and Codex adapters.
 *
 * The record is the Vestara execution authority. Runtime sessions, runtime
 * turns, operations, transports, and projections are correlated evidence or
 * control surfaces; none of them define execution identity.
 */

import type { ExecutionId, OperationId, RuntimeSessionId, TurnId } from './identity.js';
import type { ExecutionStatus } from './lifecycle.js';
import type { ExecutionResult } from './result.js';

/**
 * Runtime identity carried by an assistant execution.
 *
 * Native identifiers remain strings because they are owned by their runtime.
 * The discriminant preserves OpenCode/Codex asymmetry instead of pretending
 * that a session or thread has the same shape or authority in both systems.
 */
export type AssistantRuntimeCorrelation =
  | {
      readonly runtimeId: 'opencode';
      /** Native OpenCode session identifier, when established. */
      readonly sessionId?: string;
      /** Native/runtime-neutral turn identity, when established. */
      readonly turnId?: TurnId;
      /** Vestara runtime-session binding, when one exists. */
      readonly runtimeSessionId?: RuntimeSessionId;
      readonly providerId?: string;
      readonly modelId?: string;
    }
  | {
      readonly runtimeId: 'codex';
      /** Native Codex thread identifier, when established. */
      readonly threadId?: string;
      /** Native/runtime-neutral turn identity, when established. */
      readonly turnId?: TurnId;
      /** Vestara runtime-session binding, when one exists. */
      readonly runtimeSessionId?: RuntimeSessionId;
      readonly providerId?: string;
      readonly modelId?: string;
    };

/**
 * Durable execution record identity and lifecycle.
 *
 * `requested` is the existing canonical state used for an execution record
 * allocated before runtime submission. `binding` and `ready` cover runtime
 * resolution/submission preparation; `running` means Vestara has accepted
 * runtime execution evidence. The existing canonical lifecycle is reused —
 * no assistant-specific status vocabulary is introduced here.
 */
export interface AssistantExecutionRecord {
  readonly executionId: ExecutionId;
  /** Conversation identity owned by the conversation domain. */
  readonly conversationId: string;
  /** Assistant response identity allocated before runtime submission. */
  readonly assistantMessageId: string;
  readonly status: ExecutionStatus;
  readonly requestedAt: string;
  readonly updatedAt: string;
  readonly runtime?: AssistantRuntimeCorrelation;
  /** Last known runtime-neutral observation reference; never an M9 cursor. */
  readonly observation?: AssistantExecutionObservationReference;
  /** Present only after a terminal lifecycle transition. */
  readonly result?: ExecutionResult;
}

/**
 * Minimal future observation-recovery reference.
 *
 * This intentionally does not define replay semantics. A runtime adapter may
 * later attach its own opaque cursor or observation ID to the same execution.
 * M9 Activity sequence numbers are not valid values for this contract.
 */
export interface AssistantExecutionObservationReference {
  readonly executionId: ExecutionId;
  readonly runtimeId: AssistantRuntimeCorrelation['runtimeId'];
  readonly runtimeObservationId?: string;
  readonly runtimeCursor?: string;
  readonly lastOperationId?: OperationId;
}

/** Runtime truth obtained by a future adapter reconciliation operation. */
export type AssistantExecutionReconciliationStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

/**
 * Runtime reconciliation is evidence about the runtime, not a replacement
 * for the persisted Vestara lifecycle status.
 */
export interface AssistantExecutionReconciliation {
  readonly executionId: ExecutionId;
  readonly observedAt: string;
  readonly status: AssistantExecutionReconciliationStatus;
  readonly runtimeId: AssistantRuntimeCorrelation['runtimeId'];
  readonly runtimeAvailable: 'available' | 'unavailable' | 'unknown';
  readonly runtime?: AssistantRuntimeCorrelation;
  readonly observation?: AssistantExecutionObservationReference;
}
