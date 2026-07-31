// ─── Provider Router (v4.0 Conversational Onboarding) ───────

export interface ConversationProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;
  readonly model: string;

  complete(request: ConversationRequest): Promise<ConversationResponse>;
  stream(request: ConversationRequest): AsyncIterable<StreamChunk>;
  health(): Promise<ProviderHealth>;
  models(): Promise<ModelInfo[]>;
}

export interface ConversationRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ConversationResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  latency: number;
}

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  providerId: string;
  model: string;
  latency: number;
  lastHeartbeat: string;
  message?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
}

export type ProviderRouteSource = 'online' | 'offline';

export interface ActiveRoute {
  source: ProviderRouteSource;
  providerId: string;
  model: string;
  connected: boolean;
  latency: number;
}

export type ConversationIntent =
  | 'greeting'
  | 'conversation'
  | 'explain'
  | 'plan'
  | 'implement'
  | 'architecture'
  | 'large-context';

export interface IntentModelMap {
  intent: ConversationIntent;
  model: string;
  provider?: string;
}

import type { ConversationSession, UserProfile, UserProfileUpdate } from './conversation-types.js';
import type { StreamChunk } from './stream.js';
import type { ToolDefinition } from './tool.js';

export interface ProviderRouterStatus {
  online: ActiveRoute | null;
  offline: ActiveRoute | null;
  active: ActiveRoute | null;
  failoverEnabled: boolean;
}

export interface ConversationEngine {
  readonly id: string;
  readonly status: 'initializing' | 'ready' | 'degraded' | 'unavailable';

  startSession(userId?: string): Promise<ConversationSession>;
  sendMessage(
    content: string,
    options?: Record<string, unknown>,
  ): Promise<{ response: string; profile: UserProfile; session: ConversationSession }>;
  sendMessageStream(content: string, options?: Record<string, unknown>): AsyncIterable<StreamChunk>;
  getProfile(): Promise<UserProfile | null>;
  updateProfile(update: UserProfileUpdate): Promise<UserProfile>;
  endSession(): Promise<void>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}
