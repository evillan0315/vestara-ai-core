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
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency?: number;
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
