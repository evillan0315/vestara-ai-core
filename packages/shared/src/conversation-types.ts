// ─── Conversation (VOM) ──────────────────────────────────────
//
// Architecture Traceability:
//   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Conversation, VOM-Message
//   Specification: CAP-001 → Workspace.Chat

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type ConversationStatus = 'active' | 'archived' | 'deleted';

export interface Conversation {
  id: string;
  userId: string;
  projectId?: string;
  /** GA-4.4: Provenance — which agent owns this conversation. Optional for backward compatibility. */
  agentId?: string;
  title: string;
  messages: Message[];
  status: ConversationStatus;
  /** OpenCode session ID for session reuse across turns. Set after the first successful turn. */
  runtimeSessionId?: string;
  createdAt: string;
  updatedAt: string;
  /** Pagination metadata (optional, only present when paginated). */
  _pagination?: {
    total: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

// ─── Tool Observation (GA-CTX-001) ──────────────────────────
//
// Structured tool observation persisted alongside the assistant message.
// Observation ≠ interpretation — the raw tool output is preserved
// independently from the assistant's natural-language summary.

import type { EditExecutionDetail, ReadExecutionDetail } from './assistant-execution.js';

/** Lifecycle of a persisted tool observation. */
export type ToolObservationStatus = 'running' | 'completed' | 'failed' | 'denied';

/**
 * Which structured renderer owns this observation.
 * `read` and `edit` require their accompanying structured detail; everything
 * else is `generic`. Unknown tools remain generic — never guessed.
 */
export type ToolObservationKind = 'read' | 'edit' | 'generic';

/**
 * A bounded representation of a tool invocation and its result.
 * Persisted with the assistant message so subsequent turns can
 * reference what tools actually did, not just what the assistant said.
 *
 * GA-TOOL-UX-001B lifecycle model (explicit domain decision):
 * persisted evidence is one entry per operation — a newer observation for a
 * known `operationId` replaces the earlier one, except a stale `running`
 * projection never clobbers terminal evidence. Running observations persist
 * only when no terminal evidence arrived (aborted/detached turns).
 * OPERATION IDENTITY (`operationId`, the OpenCode `callID` when known) is
 * durable correlation; transport chunk ids are not.
 */
export interface ToolObservation {
  /**
   * Stable identity for this tool call — the OpenCode `callID`
   * (`operationId`) when known, else the transport chunk id.
   */
  readonly toolCallId: string;

  /**
   * Durable operation correlation — the OpenCode `callID` when the runtime
   * supplied it. Observations sharing an `operationId` describe one
   * operation's lifecycle (started/completed). Never a UI-generated id.
   */
  readonly operationId?: string;

  /** Structured renderer ownership. Absent (legacy) means `generic`. */
  readonly observationKind?: ToolObservationKind;

  /** Tool name (e.g. 'filesystem.read', 'shell.execute'). */
  readonly toolName: string;

  /** Whether the tool call is running, succeeded, failed, or was denied. */
  readonly status: ToolObservationStatus;

  /** Timestamp of the observation. */
  readonly timestamp: string;

  /**
   * Bounded observation content.
   * For large outputs, this is a summary/reference — the authoritative
   * artifact remains in its owning subsystem (evidence, engineering events, etc.).
   */
  readonly content: string;

  /** Error message if status is 'failed' or 'denied'. */
  readonly error?: string;

  /** Structured Read evidence — present only when `observationKind` is `read`. */
  readonly read?: ReadExecutionDetail;
  /** Structured Edit evidence — present only when `observationKind` is `edit`. */
  readonly edit?: EditExecutionDetail;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  provider?: string;
  model?: string;
  tokens?: number;
  cost?: number;
  latency?: number;
  createdAt: string;
  /**
   * REASONING-BOUNDARY-001: provider-emitted reasoning/debug output for this
   * assistant turn, accumulated from `reasoning` stream chunks only.
   * Structurally separate from `content` (the final user-facing response) —
   * never parsed from content, never concatenated into it. Displayed only in
   * diagnostic details surfaces, never as conversational authorship. Absent
   * when the runtime emitted no observable reasoning.
   */
  reasoning?: string;
  /**
   * GA-CTX-001: Structured tool observations produced during this assistant turn.
   * Preserves tool invocations and results independently from the assistant's
   * natural-language interpretation. Subsequent turns can reference these.
   */
  toolObservations?: readonly ToolObservation[];
  /**
   * GA-EXEC-002: structured execution result. Carries how the turn ended
   * (termination, tool-call count, elapsed time) independently from the
   * message content. Enables the UI to display structured failure
   * information instead of raw error text.
   */
  executionResult?: {
    termination: 'completed' | 'failed' | 'timeout' | 'cancelled' | 'detached';
    toolCallCount: number;
    elapsedMs: number;
    /**
     * Per-turn execution attribution. This is runtime/execution metadata,
     * not AgentDefinition configuration and not a routing request.
     */
    execution?: {
      runtimeId: string;
      providerId?: string;
      modelId?: string;
    };
  };
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  /** GA-STATE-001: OpenCode session ID for runtime status projection. */
  runtimeSessionId?: string;
}

// ─── UserProfile (v4.0 Conversational Onboarding) ────────────
//
// Architecture Traceability:
//   PCS-020 → Conversational Onboarding
//   UX-011  → User Profile

export interface UserProfile {
  id: string;
  name?: string;
  role?: string;
  experience?: string;
  preferredStack?: string[];
  communicationStyle?: 'concise' | 'detailed' | 'balanced';
  goals?: string[];
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  conversationCount: number;
  lastSessionId?: string;
}

export type UserProfileUpdate = Partial<Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>>;

// ─── ConversationSession (v4.0 Conversational Onboarding) ───

export interface AudioTimelineEntry {
  timestamp: string;
  type: 'input_start' | 'input_end' | 'vad' | 'stt' | 'llm_start' | 'llm_end' | 'tts' | 'output_start' | 'output_end';
  duration?: number;
  data?: string;
}

export interface ConversationSession {
  id: string;
  userId: string;
  profileId: string;
  startedAt: string;
  endedAt?: string;
  transcript: Message[];
  audioTimeline: AudioTimelineEntry[];
  context: Record<string, unknown>;
  referencedArtifacts: string[];
  summaries: string[];
  actions: string[];
  memoryUpdates: string[];
}
