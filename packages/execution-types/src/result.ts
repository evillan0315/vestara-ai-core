/**
 * Canonical execution result contract.
 *
 * Distinguishes execution completion from verification success.
 * An execution may complete successfully but produce work that
 * fails verification. These are orthogonal concerns.
 */

import type { ExecutionArtifact, ExecutionEvidence } from './artifacts.js';
import type { ExecutionId } from './identity.js';

/**
 * Terminal execution status — the outcome of an execution.
 */
export type ExecutionTerminalStatus = 'completed' | 'failed' | 'cancelled' | 'timed_out';

/**
 * Timeout configuration for an execution.
 */
export interface ExecutionTimeoutConfig {
  /** Maximum execution time in milliseconds. */
  readonly turnTimeoutMs?: number;
  /** Maximum permission wait time in milliseconds. */
  readonly permissionTimeoutMs?: number;
}

/**
 * Usage metrics from an execution.
 */
export interface ExecutionUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
  readonly estimatedCost?: number;
}

/**
 * Timing information for an execution.
 */
export interface ExecutionTiming {
  readonly requestedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
}

/**
 * Error information from a failed execution.
 */
export interface ExecutionError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

/**
 * Verification outcome — distinct from execution completion.
 *
 * An execution may 'complete' but produce work that fails verification.
 * Verification is an independent assessment of the produced work.
 */
export interface VerificationOutcome {
  /** Whether the produced work passed verification. */
  readonly verified: boolean;
  /** Confidence level of the verification. */
  readonly confidence?: 'low' | 'moderate' | 'high' | 'very-high';
  /** References to evidence used in verification. */
  readonly evidenceIds?: readonly string[];
}

/**
 * A runtime-neutral result envelope for execution.
 *
 * INVARIANT: execution 'completed' does NOT imply verification 'verified'.
 * These are orthogonal concerns. A completed execution may produce work
 * that fails verification, and a verification may pass on work from a
 * previously failed execution (if retried).
 */
export interface ExecutionResult {
  /** The execution this result belongs to. */
  readonly id: ExecutionId;

  /** Terminal status of the execution. */
  readonly status: ExecutionTerminalStatus;

  /** Textual output from the execution (if any). */
  readonly output?: string;

  /** Artifacts produced by the execution. */
  readonly artifacts: readonly ExecutionArtifact[];

  /** Evidence collected during execution. */
  readonly evidence: readonly ExecutionEvidence[];

  /** Resource usage metrics. */
  readonly usage?: ExecutionUsage;

  /** Timing information. */
  readonly timing: ExecutionTiming;

  /** Error details (present when status is 'failed' or 'timed_out'). */
  readonly error?: ExecutionError;

  /** Verification outcome (if verification was performed). */
  readonly verification?: VerificationOutcome;

  /** Runtime-neutral metadata. */
  readonly metadata?: Record<string, unknown>;
}
