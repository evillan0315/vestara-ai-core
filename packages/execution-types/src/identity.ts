/**
 * Canonical execution identity types.
 *
 * CORE-001 found multiple identity systems:
 *   - Plain strings (workspace, workflow-orchestrator)
 *   - Branded types (types/src/ids.ts: ExecutionId, WorkflowRunId, etc.)
 *   - OpenCode callID (adapter's operationId)
 *   - Synthetic IDs (adapter's CompletionResponse.id)
 *
 * This module establishes the canonical execution identity vocabulary.
 * Branded types prevent accidental string substitution.
 *
 * Ownership:
 *   ExecutionId    — owned by @vestara/types (canonical execution identity)
 *   WorkflowRunId  — owned by @vestara/types (workflow execution attempt)
 *   WorkflowTaskId — owned by @vestara/types (bounded executable unit)
 *   RuntimeSessionId — owned by @vestara/types (session continuity)
 *   TurnId         — owned here (single execution turn within a session)
 *   OperationId    — owned here (tool call, permission, etc. within a turn)
 *
 * Lifecycle relationships:
 *   Conversation
 *     └── Execution (ExecutionId)
 *            └── RuntimeBinding
 *                    └── RuntimeSession (RuntimeSessionId)
 *
 *   WorkflowRun (WorkflowRunId)
 *     └── WorkflowTask (WorkflowTaskId)
 *            └── Execution (ExecutionId)
 *                    └── Turn (TurnId)
 *                            └── Operation (OperationId)
 */

import type { Brand } from '@vestara/types';

/** Re-export canonical IDs from @vestara/types for convenience. */
export type { ExecutionId, RuntimeSessionId, WorkflowRunId, WorkflowTaskId } from '@vestara/types';

/** A single execution turn within a runtime session. One turn = one prompt/response cycle. */
export type TurnId = Brand<string, 'TurnId'>;

/** A tool call, permission request, shell execution, or other operation within a turn. */
export type OperationId = Brand<string, 'OperationId'>;

/** Create a TurnId with brand protection. */
export function turnId(id: string): TurnId {
  return id as TurnId;
}

/** Create an OperationId with brand protection. */
export function operationId(id: string): OperationId {
  return id as OperationId;
}
