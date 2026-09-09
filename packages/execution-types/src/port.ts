/**
 * RuntimeExecutionPort — the canonical interface for runtime adapters.
 *
 * CORE-004 Phase B: The minimum runtime-neutral port required to execute
 * canonical bounded work. Any runtime adapter (OpenCode, Codex, Claude Code,
 * future runtimes) must implement this interface.
 *
 * The port belongs to Vestara. The adapter translates. The runtime executes.
 *
 * INVARIANT: No OpenCode-specific types appear in this interface.
 * Runtime-specific concepts remain behind the adapter.
 *
 * Architecture:
 *
 *   Vestara domain/orchestration
 *            │
 *            ▼
 *     ExecutionRequest
 *            │
 *            ▼
 *   RuntimeExecutionPort
 *            │
 *            ▼
 *   Runtime-specific adapter
 *            │
 *            ▼
 *      External runtime client
 *
 * Return direction:
 *
 *   runtime-native behavior
 *            │
 *            ▼
 *   runtime-specific adapter
 *            │
 *            ▼
 *   canonical execution observations
 *            │
 *            ▼
 *      Vestara execution
 */

import type { RuntimeBinding } from './binding.js';
import type { ExecutionId, RuntimeSessionId } from './identity.js';
import type { ExecutionObservation } from './observations.js';
import type { ExecutionRequest } from './request.js';

/**
 * A handle to a running execution.
 *
 * The handle provides access to the execution's observation stream
 * and allows cancellation. It is the adapter's returned reference
 * after initiating execution.
 */
export interface RuntimeExecutionHandle {
  /** The canonical execution identity. */
  readonly executionId: ExecutionId;

  /** The runtime session carrying this execution (if session-based). */
  readonly runtimeSessionId?: RuntimeSessionId;

  /** The resolved runtime binding. */
  readonly binding: RuntimeBinding;

  /**
   * Async iterable of execution observations.
   *
   * The adapter yields observations as the runtime progresses:
   *   - Activity observations (tool calls, text deltas, etc.)
   *   - Status observations (lifecycle changes)
   *   - Permission observations (permission requests)
   *   - Artifact observations (produced artifacts)
   *   - Result observation (terminal result)
   *
   * The iterable completes when the execution reaches a terminal state.
   */
  readonly observations: AsyncIterable<ExecutionObservation>;

  /**
   * Cancel this execution.
   *
   * Vestara owns the cancellation decision. The adapter translates
   * to runtime-native cancellation. The runtime performs the actual
   * interruption.
   *
   * Cancellation is best-effort: the runtime may have already completed
   * or may not support graceful cancellation. The observation stream
   * will eventually yield a terminal result observation.
   */
  cancel(): Promise<void>;
}

/**
 * The canonical runtime execution port.
 *
 * Any runtime adapter must implement this interface. The port is
 * runtime-neutral: it uses only Vestara canonical types.
 *
 * Example implementations:
 *   - OpenCodeAdapter (wraps OpenCodeHttpClient)
 *   - Future CodexAdapter
 *   - Future ClaudeCodeAdapter
 *   - FakeRuntimeAdapter (for testing)
 */
export interface RuntimeExecutionPort {
  /**
   * Execute bounded work through this runtime.
   *
   * The adapter translates the canonical request into a runtime-native
   * format, initiates execution, and returns a handle for observing
   * and controlling the execution.
   *
   * @param request - The canonical execution request
   * @param binding - The resolved runtime binding (provider, model, session)
   * @returns A handle to the running execution
   * @throws If the runtime is unavailable or the request cannot be initiated
   */
  execute(request: ExecutionRequest, binding: RuntimeBinding): Promise<RuntimeExecutionHandle>;

  /**
   * Check if this runtime is available.
   *
   * Returns true if the runtime can accept new executions.
   * May perform health checks or connectivity tests.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get the runtime identifier.
   *
   * Returns the canonical runtime name (e.g., 'opencode', 'codex').
   */
  readonly runtimeId: string;
}
