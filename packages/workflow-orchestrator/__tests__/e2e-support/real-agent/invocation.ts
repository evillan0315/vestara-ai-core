/**
 * WFO-E2E-002 agent invocation evidence.
 *
 * Every real provider call produces an immutable, hash-addressed evidence
 * record. Full prompts/responses are not stored; hashes, role identity,
 * provenance, and a redacted transcript are. Cost/token/duration are recorded
 * by the runner, never asserted by the model.
 */

import { createHash } from 'node:crypto';
import type { RealAgentRole } from './profile';
import type { ToolCallEvidence } from './schemas';

export interface AgentInvocationEvidence {
  readonly invocationId: string;
  readonly workflowId: string;
  readonly taskId?: string;
  readonly role: RealAgentRole;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly promptTemplateVersion: string;
  readonly contextHash: string;
  readonly responseHash: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly durationMs: number;
  readonly toolCalls: readonly ToolCallEvidence[];
  readonly producedArtifactIds: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly transcriptRedacted: boolean;
  /** Structured-output schema validation result (Planner/Reviewer). */
  readonly schemaValidation: 'valid' | 'invalid' | 'not-applicable';
  readonly retryCount: number;
  readonly providerStatus: 'completed' | 'failed' | 'unavailable';
  /** Material workflow progress, per role: valid new plan/review, never raw length. */
  readonly materialProgress: boolean;
}

export interface RecordInvocationInput {
  readonly invocationId: string;
  readonly workflowId: string;
  readonly taskId?: string;
  readonly role: RealAgentRole;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelVersion?: string;
  readonly promptTemplateVersion: string;
  readonly context: string;
  readonly response: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number | null;
  readonly durationMs: number;
  readonly toolCalls?: readonly ToolCallEvidence[];
  readonly producedArtifactIds?: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
  readonly schemaValidation?: 'valid' | 'invalid' | 'not-applicable';
  readonly retryCount?: number;
  readonly providerStatus?: 'completed' | 'failed' | 'unavailable';
  /** Material progress is role-specific: valid new plan/review, never raw response length. */
  readonly materialProgress?: boolean;
}

const SECRET_PATTERNS: readonly RegExp[] = [
  /bearer[ \t]+\S+/gi,
  /\b(?:api[_-]?key|token|secret|password|passwd)\b[=:][ \t]*\S+/gi,
  /\b(?:sk-|pk-|ghp_|gho_|glpat-)[a-z0-9_-]{16,}/gi,
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/gi,
];

export function redactTranscript(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[REDACTED]');
  return out;
}

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function recordInvocation(input: RecordInvocationInput): AgentInvocationEvidence {
  const redactedContext = redactTranscript(input.context);
  const redactedResponse = redactTranscript(input.response);
  return {
    invocationId: input.invocationId,
    workflowId: input.workflowId,
    taskId: input.taskId,
    role: input.role,
    providerId: input.providerId,
    modelId: input.modelId,
    modelVersion: input.modelVersion,
    promptTemplateVersion: input.promptTemplateVersion,
    contextHash: hashText(redactedContext),
    responseHash: hashText(redactedResponse),
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    estimatedCostUsd: input.estimatedCostUsd,
    durationMs: input.durationMs,
    toolCalls: input.toolCalls ?? [],
    producedArtifactIds: input.producedArtifactIds ?? [],
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    transcriptRedacted: redactedContext !== input.context || redactedResponse !== input.response,
    schemaValidation: input.schemaValidation ?? 'not-applicable',
    retryCount: input.retryCount ?? 0,
    providerStatus: input.providerStatus ?? 'completed',
    materialProgress: input.materialProgress ?? false,
  };
}
