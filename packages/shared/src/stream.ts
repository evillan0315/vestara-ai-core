// ─── Canonical Stream Chunk (Rule 6: Everything streams) ─────
//
// Architecture Traceability:
//   Specification: CAP-001 → Streaming
//   Provider SDK: PROVIDER-SDK.md → StreamChunk

import type { AssistantExecutionDetail } from './assistant-execution.js';

export type ChunkType =
  | 'text' // Normal text token
  | 'reasoning' // Chain-of-thought reasoning
  | 'tool_call' // AI requesting a tool execution
  | 'tool_result' // Result of a tool execution
  | 'citation' // Source citation
  | 'status' // Progress status update
  | 'error' // Error condition
  | 'complete' // Stream finished
  | 'meta'; // Metadata (usage, latency)

export interface ChunkMetadata {
  sequence: number;
  timestamp: string;
  provider?: string;
  model?: string;
  conversationId?: string;
  /** OpenCode session ID — emitted by the adapter so the caller can persist it for session reuse. */
  runtimeSessionId?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency?: number;
  /**
   * GA-EXEC-002: structured execution result emitted as the final meta chunk.
   * Carries how the turn ended (termination, tool-call count, elapsed time)
   * independently from the response content.
   */
  executionResult?: {
    termination: 'completed' | 'failed' | 'timeout' | 'cancelled' | 'detached';
    toolCallCount: number;
    elapsedMs: number;
    execution?: {
      runtimeId: string;
      providerId?: string;
      modelId?: string;
    };
  };
  /**
   * Per-turn execution attribution emitted by the runtime adapter. This is
   * separate from requested provider/model binding and can be present even
   * when the runtime cannot expose an authoritative model.
   */
  execution?: {
    runtimeId: string;
    providerId?: string;
    modelId?: string;
  };
}

export interface StreamChunk {
  id: string;
  type: ChunkType;
  content?: string;
  name?: string; // Tool call name / citation source
  /**
   * Structured Assistant execution projection (GA-UX-PREMIUM M3,
   * `assistant.execution.v1`). Present on tool_call / tool_result / status
   * chunks that carry execution evidence. Absent = legacy content/name only.
   */
  detail?: AssistantExecutionDetail;
  metadata: ChunkMetadata;
}

export interface StreamEvent {
  type: 'provider:stream.started' | 'provider:stream.chunk' | 'provider:stream.completed' | 'provider:stream.error';
  conversationId: string;
  chunk?: StreamChunk;
  error?: string;
  metadata: ChunkMetadata;
}

/**
 * REASONING-BOUNDARY-001: bound for persisted provider-emitted reasoning.
 * Reasoning is diagnostic data, not conversation — it is truncated, never
 * elided silently (truncation marker) and never reconstructed.
 */
export const MAX_REASONING_CHARS = 8000;

/** Truncate reasoning to the bound with an explicit marker. Pure. */
export function truncateReasoning(text: string, max: number = MAX_REASONING_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}… [reasoning truncated, ${text.length} chars total]`;
}
