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

/**
 * Trusted turn-time surface context (GA-CONTEXT-002).
 *
 * Additive, optional, bounded wire shape. Mirrors the Workspace
 * `@vestara/types` SurfaceContext contracts (workspace + surface + selection)
 * so the browser's existing SurfaceContextProvider value can flow unchanged.
 * Treated by the model as trusted application context — NEVER repository or
 * execution authority (repositoryDir stays server-authoritative).
 */
export interface TurnSurfaceWorkspace {
  readonly id: string;
  readonly name: string;
}

export interface TurnSurfaceLocation {
  readonly routeId: string | null;
  readonly path: string;
  readonly title: string | null;
  readonly section: string | null;
}

export interface TurnSurfaceReference {
  readonly kind: string;
  readonly id: string;
  readonly label?: string;
}

export interface TurnSurfaceContext {
  readonly workspace: TurnSurfaceWorkspace;
  readonly surface: TurnSurfaceLocation;
  readonly selected?: TurnSurfaceReference;
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
  /** Caller-controlled cancellation: when aborted, the provider terminates the turn. */
  signal?: AbortSignal;
  /** Streaming execution events (runtime-normalized) as the turn progresses. */
  onExecutionEvent?: (event: ProviderExecutionEvent) => void;
  /** The runtime agent (e.g. vestara-planner) to run the completion as. */
  agent?: string;
  /** Semantic title for the execution session (e.g. task title, workflow title). */
  title?: string;
  /**
   * Trusted turn-time surface context (GA-CONTEXT-002). Additive and optional:
   * the current Workspace UI surface. Bounded server-side; treated as trusted
   * application context by the model — NEVER repository/execution authority.
   */
  surfaceContext?: TurnSurfaceContext;
  /** M7: Runtime session ID for session continuity. When set, the provider reuses the existing OpenCode session. */
  runtimeSessionId?: string;
  /**
   * Request structured JSON output: the provider forces the model to return
   * validated JSON matching this schema. When set, `CompletionResponse` carries
   * the parsed result in `structuredOutput`.
   */
  jsonSchema?: Record<string, unknown>;
}

/** Runtime-normalized execution event emitted while a completion runs. */
export interface ProviderExecutionEvent {
  readonly type:
    | 'agent.activity'
    | 'agent.progress'
    | 'tool.started'
    | 'tool.completed'
    | 'agent.completed'
    | 'agent.failed'
    | 'agent.cancelled';
  readonly state: string;
  readonly activity?: string;
  readonly at: string;
  readonly sessionId?: string;
}

export interface CompletionResponse {
  id: string;
  model: string;
  provider: string;
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  /** Parsed structured output when `CompletionRequest.jsonSchema` was set. */
  structuredOutput?: unknown;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latency: number;
  /** How the provider resolved which upstream provider/model executed this completion (provenance). */
  resolution?: {
    /** Selected upstream provider id; undefined means the runtime's configured default. */
    providerId?: string;
    /** Why this resolution was chosen. */
    reason: 'preferred' | 'preferred-unavailable' | 'explicit-model' | 'explicit-unresolvable' | 'default';
    /** True when execution fell back to the runtime's configured/default resolution. */
    defaultResolution: boolean;
  };
}
