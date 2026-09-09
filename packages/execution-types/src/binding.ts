/**
 * Runtime binding contract.
 *
 * Defines what Vestara needs to express when binding an execution to a runtime.
 * Preserves CORE-002 contracts (ProviderId, ModelId from @vestara/routing-types).
 *
 * The binding is the bridge between Vestara's execution authority and
 * the runtime's execution capability. It captures:
 *   - Which runtime will execute
 *   - Which provider/model will be used
 *   - Which session carries the execution
 *
 * INVARIANT: The binding is a snapshot at execution time.
 * Runtime state changes do not mutate the binding.
 */

import type { ExecutionId, RuntimeSessionId } from './identity.js';

/**
 * A binding between an execution and a runtime.
 *
 * Created when the execution transitions from 'binding' to 'ready'.
 * Immutable after creation.
 */
export interface RuntimeBinding {
  /** The execution this binding serves. */
  readonly executionId: ExecutionId;

  /** Runtime identifier (e.g., 'opencode', 'codex', 'claude-code'). */
  readonly runtimeId: string;

  /** Runtime session carrying this execution (if session-based). */
  readonly runtimeSessionId?: RuntimeSessionId;

  /** Provider selected for this execution. */
  readonly providerId?: string;

  /** Model selected for this execution. */
  readonly modelId?: string;

  /** When this binding was created. */
  readonly boundAt: string;

  /** Binding metadata (runtime-specific, opaque to Vestara). */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Input for creating a runtime binding.
 */
export interface RuntimeBindingInput {
  readonly executionId: ExecutionId;
  readonly runtimeId: string;
  readonly runtimeSessionId?: RuntimeSessionId;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly metadata?: Record<string, unknown>;
}
