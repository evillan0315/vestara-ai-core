/**
 * Session correlation primitives.
 *
 * Explicit identifiers are authoritative; everything else is an inference with
 * explicit confidence and evidence. Inferred correlation must never appear as
 * confirmed.
 */

import type { CorrelationEvidence, ExternalCorrelationMethod, ExternalSessionCorrelation } from './types';

export interface CorrelationInput {
  runtimeInstanceId: string;
  runtimeType: 'opencode' | 'claude-code' | 'openai-codex';
  externalSessionId: string;
  workspaceId: string;
  planId?: string;
  taskId?: string;
  executionId?: string;
  /** True when the correlation came from an explicit identifier/launch record. */
  authoritative: boolean;
  method: ExternalCorrelationMethod;
  evidence: readonly CorrelationEvidence[];
}

/** Deterministic confidence for an inference method. */
export function methodConfidence(method: ExternalCorrelationMethod): number {
  switch (method) {
    case 'explicit':
      return 1.0;
    case 'launch-record':
      return 1.0;
    case 'environment':
      return 0.9;
    case 'git-worktree':
      return 0.7;
    case 'git-branch':
      return 0.6;
    case 'workspace-path':
      return 0.4;
    case 'time-window':
      return 0.3;
    case 'file-overlap':
      return 0.2;
    case 'manual':
      return 0.8;
  }
}

export function buildCorrelation(input: CorrelationInput): ExternalSessionCorrelation {
  return {
    id: `corr-${input.runtimeInstanceId}-${input.externalSessionId}`,
    runtimeInstanceId: input.runtimeInstanceId,
    runtimeType: input.runtimeType,
    externalSessionId: input.externalSessionId,
    workspaceId: input.workspaceId,
    planId: input.planId,
    taskId: input.taskId,
    executionId: input.executionId,
    method: input.method,
    confidence: input.authoritative ? 1.0 : methodConfidence(input.method),
    evidence: input.evidence,
    createdAt: new Date().toISOString(),
  };
}

/** Merge a set of correlation signals into the strongest correlation. */
export function mergeCorrelations(
  candidates: readonly ExternalSessionCorrelation[],
): ExternalSessionCorrelation | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.confidence - a.confidence)[0];
}

export function isConfirmed(correlation: ExternalSessionCorrelation): boolean {
  return correlation.confidence >= 1.0;
}
