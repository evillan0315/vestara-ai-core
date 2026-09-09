/**
 * Canonical execution request contract.
 *
 * Represents a request for bounded work, independent of any specific runtime.
 * Derived from evidence in:
 *   - CompletionRequest (shared/src/provider.ts) — GA-specific
 *   - WorkflowRunStartInput (types/src/workflow.ts) — DAG-specific
 *   - MultiAgentWorkflowStartInput (workspace/src/multi-agent-workflow.ts) — chain-specific
 *
 * This contract is the minimum runtime-neutral request.
 * Runtime-specific fields are NOT included.
 */

import type { ExecutionId, WorkflowRunId, WorkflowTaskId } from './identity.js';
import type { ExecutionTimeoutConfig } from './result.js';

/**
 * Who initiated the execution.
 */
export interface ExecutionActor {
  readonly kind: 'human' | 'agent' | 'system' | 'workflow';
  readonly id: string;
  readonly role?: string;
}

/**
 * Execution context — where and under what conditions the execution runs.
 */
export interface ExecutionContext {
  readonly repositoryDir?: string;
  readonly workspaceId?: string;
  readonly surfaceContext?: Record<string, unknown>;
}

/**
 * Routing intent — which provider/model/capabilities are desired.
 * The runtime binding layer resolves this to an actual binding.
 */
export interface RoutingIntent {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly requiredCapabilities?: readonly string[];
}

/**
 * Permission context — what authorizations accompany this execution.
 */
export interface PermissionContext {
  readonly policyDecision: 'allow' | 'ask' | 'deny';
  readonly approvedTools?: readonly string[];
}

/**
 * A request for bounded execution work.
 *
 * This is the canonical Vestara execution request.
 * Runtime adapters translate this into runtime-native request formats
 * (e.g., OpenCode's prompt_async body, future Codex API call).
 *
 * INVARIANT: No OpenCode-specific fields. Runtime neutrality preserved.
 */
export interface ExecutionRequest {
  /** Canonical execution identity. */
  readonly id: ExecutionId;

  /** Who initiated this execution. */
  readonly actor: ExecutionActor;

  /** What the execution should accomplish (human-readable objective). */
  readonly objective: string;

  /** Where and under what conditions the execution runs. */
  readonly context: ExecutionContext;

  /** Which provider/model is desired (resolved by binding layer). */
  readonly routing?: RoutingIntent;

  /** What authorizations accompany this execution. */
  readonly permissions?: PermissionContext;

  /** Parent execution for lineage (subagent, child workflow). */
  readonly parentExecutionId?: ExecutionId;

  /** Conversation correlation (for GA-style interactions). */
  readonly conversationId?: string;

  /** Workflow correlation (for orchestrated executions). */
  readonly workflowRunId?: WorkflowRunId;

  /** Task correlation (for task-scoped executions). */
  readonly workflowTaskId?: WorkflowTaskId;

  /** Execution timeout configuration. */
  readonly timeout?: ExecutionTimeoutConfig;

  /** Runtime-neutral metadata. */
  readonly metadata?: Record<string, unknown>;
}
