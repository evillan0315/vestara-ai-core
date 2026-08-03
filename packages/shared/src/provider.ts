// ─── Provider SDK (AIProvider Interface) ─────────────────────
//
// Architecture Traceability:
//   Foundation: PROVIDER-SDK.md → AIProvider
//   Specification: AI-CON-004 → Provider Manager

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly status: ProviderStatus;
  readonly models: AIModel[];
  readonly capabilities: ProviderCapabilities;

  initialize(config: Record<string, unknown>): Promise<void>;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  healthCheck(): Promise<ProviderHealthStatus>;
  listModels(): Promise<AIModel[]>;
}

import type { StreamChunk } from './stream.js';
import type { ToolDefinition } from './tool.js';

export type ProviderStatus = 'uninitialized' | 'initializing' | 'available' | 'degraded' | 'unavailable' | 'error';

export interface AIModel {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  capabilities: {
    chat: boolean;
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    embeddings: boolean;
  };
  pricing?: {
    inputPerMillionTokens: number;
    outputPerMillionTokens: number;
  };
  status: 'available' | 'degraded' | 'unavailable';
}

export interface ProviderCapabilities {
  maxConcurrentRequests: number;
  features: string[];
}

export interface ProviderHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  providerId: string;
  modelCount: number;
  latency: number;
  lastHeartbeat: string;
  message?: string;
}

export interface CompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface CompletionResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
}
