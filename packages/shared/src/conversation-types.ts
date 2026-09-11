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

/**
 * A bounded representation of a tool invocation and its result.
 * Persisted with the assistant message so subsequent turns can
 * reference what tools actually did, not just what the assistant said.
 */
export interface ToolObservation {
  /** Stable identity for this tool call (from the provider). */
  readonly toolCallId: string;

  /** Tool name (e.g. 'filesystem.read', 'shell.execute'). */
  readonly toolName: string;

  /** Whether the tool call succeeded, failed, or was denied. */
  readonly status: 'completed' | 'failed' | 'denied';

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
   * GA-CTX-001: Structured tool observations produced during this assistant turn.
   * Preserves tool invocations and results independently from the assistant's
   * natural-language interpretation. Subsequent turns can reference these.
   */
  toolObservations?: readonly ToolObservation[];
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
