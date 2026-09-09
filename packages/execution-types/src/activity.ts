/**
 * Execution activity — what the execution is doing (distinct from lifecycle state).
 *
 * CORE-003 Phase 9 distinction:
 *   Execution State = lifecycle (requested → binding → ready → running → completed/failed/...)
 *   Execution Activity = what's happening within a running execution (tool calls, edits, etc.)
 *
 * Tool calls must not become lifecycle states. Activity is ephemeral, projected
 * from runtime events. State is durable, owned by Vestara.
 */

import type { ExecutionId, OperationId } from './identity.js';

/**
 * Types of activity that can occur during an execution.
 */
export type ExecutionActivityType =
  | 'text-delta' // Model generating text
  | 'tool-call' // Tool execution requested
  | 'tool-result' // Tool execution completed
  | 'file-edit' // File modification
  | 'shell-command' // Shell/command execution
  | 'permission-request' // Permission requested from user
  | 'permission-response' // Permission decision received
  | 'question-asked' // Question posed to user
  | 'question-answered' // Question answered by user
  | 'subagent-started' // Subagent execution began
  | 'subagent-completed' // Subagent execution finished
  | 'status-update'; // Generic status change

/**
 * The state of an individual activity within an execution.
 */
export type ActivityItemState = 'running' | 'completed' | 'failed';

/**
 * A single activity item within an execution.
 *
 * Activity items are ephemeral — they represent what the execution is
 * currently doing, not what it has achieved. They are projected from
 * runtime events and are not persisted as authoritative state.
 */
export interface ExecutionActivity {
  /** Identity of this activity item. */
  readonly id: OperationId;

  /** The execution this activity belongs to. */
  readonly executionId: ExecutionId;

  /** What type of activity this is. */
  readonly type: ExecutionActivityType;

  /** Human-readable name (e.g., tool name, file path). */
  readonly name?: string;

  /** Current state of this activity. */
  readonly state: ActivityItemState;

  /** Activity-specific detail (runtime-neutral). */
  readonly detail?: Record<string, unknown>;

  /** When this activity occurred. */
  readonly timestamp: string;

  /** Parent activity (for nested operations like subagents). */
  readonly parentOperationId?: OperationId;
}
