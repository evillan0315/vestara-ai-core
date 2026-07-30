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
  title: string;
  messages: Message[];
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
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
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
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
