/**
 * @vestara/shared — Core types and interfaces for the Vestara Runtime.
 *
 * This package defines the fundamental contracts that every runtime
 * component implements. No runtime component depends on implementation
 * details — only on these interfaces.
 *
 * Architecture Traceability:
 *   Foundation: Universal Interface Specification (FND-006)
 *   Runtime:    Vestara Kernel (RT-001)
 */

// ─── Service Lifecycle ──────────────────────────────────────

export type ServiceStatus =
  | 'uninitialized'
  | 'initializing'
  | 'initialized'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'stopped'
  | 'disposed';

/**
 * Every runtime component in Vestara implements this interface.
 * From the Kernel to the simplest utility service.
 *
 * Architecture Traceability:
 *   Foundation: UNIVERSAL-INTERFACE.md → VestaraService
 *   Runtime:    LIFECYCLE-SPECIFICATION.md → Service Lifecycle
 */
export interface VestaraService {
  readonly id: string;
  readonly version: string;
  readonly status: ServiceStatus;

  initialize(config?: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthStatus>;
  dispose(): Promise<void>;
}

// ─── Health ──────────────────────────────────────────────────

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  serviceId: string;
  version: string;
  uptime: number;
  lastHealthCheck: string;
  dependencies: HealthDependency[];
  message?: string;
}

export interface HealthDependency {
  id: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency: number;
  lastChecked: string;
}

// ─── Event Bus ───────────────────────────────────────────────

export interface VestaraEvent {
  id: string;
  type: string;
  version: number;
  timestamp: string;
  source: string;
  actor?: { id: string; role: 'user' | 'system' | 'agent' };
  payload: Record<string, unknown>;
  metadata: {
    correlationId: string;
    causationId?: string;
    retryCount: number;
    ttl: number;
  };
}

export type EventHandler<T = unknown> = (event: VestaraEvent & { payload: T }) => Promise<void>;

export type Unsubscribe = () => void;

// ─── Logging ─────────────────────────────────────────────────

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ─── Metrics ─────────────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricDefinition {
  name: string;
  type: MetricType;
  description: string;
  unit?: string;
}

export interface MetricSnapshot {
  timestamp: string;
  counters: Record<string, number>;
  gauges: Record<string, number>;
  histograms: Record<string, HistogramSummary>;
}

export interface HistogramSummary {
  count: number;
  sum: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

// ─── Configuration ───────────────────────────────────────────

export type ConfigChangeHandler = (changes: Record<string, unknown>) => Promise<void>;

export interface ConfigSource {
  name: string;
  load(): Promise<Record<string, unknown>>;
  watch?(handler: ConfigChangeHandler): void;
}

// ─── Service Registry ────────────────────────────────────────

export interface ServiceInfo {
  id: string;
  version: string;
  status: ServiceStatus;
  capabilities: string[];
  dependencies: string[];
  uptime: number;
}

export type ServiceRegistryEventType = 'registered' | 'unregistered' | 'status-changed';

export interface ServiceRegistryEvent {
  type: ServiceRegistryEventType;
  serviceId: string;
  timestamp: string;
}

// ─── Kernel ──────────────────────────────────────────────────

export type KernelStatus = 'powered-off' | 'booting' | 'running' | 'degraded' | 'draining' | 'stopped';

export interface BootReport {
  bootDuration: number;
  servicesStarted: number;
  servicesFailed: number;
  configVersion: string;
  errors: BootError[];
}

export interface BootError {
  component: string;
  error: string;
  severity: 'warning' | 'error';
  action: 'continue' | 'retry' | 'fail';
}

export interface SystemDiagnosis {
  status: KernelStatus;
  uptime: number;
  version: string;
  kernel: {
    status: KernelStatus;
    bootDuration: number;
    configVersion: string;
  };
  services: ServiceDiagnosis[];
  health: {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
  };
  scheduler: {
    tasks: number;
    paused: boolean;
  };
  resources: ResourceDiagnosis;
}

export interface ServiceDiagnosis {
  id: string;
  version: string;
  status: ServiceStatus;
  health: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  latency: number;
  capabilities: string[];
}

export interface ResourceDiagnosis {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    percentUsed: number;
  };
  cpu: {
    user: number;
    system: number;
  };
}

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

// ─── Canonical Stream Chunk (Rule 6: Everything streams) ─────
//
// Architecture Traceability:
//   Specification: CAP-001 → Streaming
//   Provider SDK: PROVIDER-SDK.md → StreamChunk

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
  metadata: ChunkMetadata;
}

export interface StreamEvent {
  type: 'provider:stream.started' | 'provider:stream.chunk' | 'provider:stream.completed' | 'provider:stream.error';
  conversationId: string;
  chunk?: StreamChunk;
  error?: string;
  metadata: ChunkMetadata;
}

// ─── Action / Tool (VOM) — Canonical Action Model ─────────────
//
// Architecture Traceability:
//   Foundation: VESTARA-OBJECT-MODEL.md → VOM-Tool
//   Foundation: TOOL-CATALOG.md → Tool Contract

export type PermissionLevel = 'read-only' | 'user-confirm' | 'admin-only';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  permissions: PermissionLevel;
  requires: string[]; // Required capabilities: 'filesystem', 'network', 'shell'
  timeout: number; // Max execution time in ms
  sandbox: boolean; // Isolated execution required
  streaming: boolean; // Produces streaming progress
  idempotent: boolean; // Safe to retry
  destructive: boolean; // Can destroy data — requires confirmation
  inputSchema: Record<string, unknown>; // JSON Schema
  outputSchema: Record<string, unknown>; // JSON Schema
  category: 'filesystem' | 'shell' | 'knowledge' | 'memory' | 'project' | 'web' | 'code' | 'custom';
}

export interface ActionRequest {
  toolId: string;
  parameters: Record<string, unknown>;
  context: {
    conversationId?: string;
    userId?: string;
    agentId?: string;
  };
}

export type ActionStatus = 'requested' | 'authorized' | 'executing' | 'completed' | 'failed' | 'cancelled';

export interface ActionExecution {
  id: string;
  toolId: string;
  status: ActionStatus;
  request: ActionRequest;
  result?: unknown;
  error?: string;
  progress?: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

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

// ─── Audio Pipeline (v4.0 Conversational Onboarding) ────────

export interface AudioConfig {
  sampleRate: number;
  channels: number;
  bitDepth: number;
  deviceName?: string;
  bufferSize?: number;
}

export interface VADConfig {
  mode: 'aggressive' | 'balanced' | 'sensitive';
  silenceTimeoutMs: number;
  minSpeechDurationMs: number;
}

export type VADState = 'idle' | 'listening' | 'speaking' | 'processing' | 'error';

export interface VADProvider {
  readonly id: string;
  readonly name: string;
  readonly status: VADState;

  configure(config: VADConfig): Promise<void>;
  processAudio(audioBuffer: ArrayBuffer): Promise<{ isSpeech: boolean; confidence: number }>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface STTProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  transcribe(
    audioBuffer: ArrayBuffer,
    language?: string,
  ): Promise<{ text: string; confidence: number; duration: number }>;
  transcribeStream(
    audioBuffer: AsyncIterable<ArrayBuffer>,
    language?: string,
  ): AsyncIterable<{ text: string; isFinal: boolean; confidence: number }>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface TTSProvider {
  readonly id: string;
  readonly name: string;
  readonly available: boolean;

  synthesize(
    text: string,
    options?: { voice?: string; speed?: number },
  ): Promise<{ audio: ArrayBuffer; duration: number }>;
  synthesizeStream(
    text: string,
    options?: { voice?: string; speed?: number },
  ): AsyncIterable<{ audio: ArrayBuffer; duration: number; isFinal: boolean }>;
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; latency: number }>;
}

export interface AudioPipelineStatus {
  microphone: { available: boolean; deviceName?: string; latency: number };
  speakers: { available: boolean; deviceName?: string; latency: number };
  vad: { status: VADState; provider: string; latency: number };
  stt: { available: boolean; provider: string; latency: number };
  tts: { available: boolean; provider: string; latency: number };
}

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

// ─── Onboarding State ────────────────────────────────────────

export type OnboardingStage =
  | 'boot'
  | 'greeting'
  | 'profile_name'
  | 'profile_role'
  | 'profile_complete'
  | 'workspace_transition'
  | 'ready';

export interface OnboardingState {
  stage: OnboardingStage;
  isFirstBoot: boolean;
  profile: UserProfile | null;
  session: ConversationSession | null;
}

// ─── Lifecycle ───────────────────────────────────────────────

export interface LifecycleEvent {
  componentType: 'service' | 'agent' | 'plugin' | 'provider' | 'tool' | 'mission';
  componentId: string;
  componentName: string;
  previousState: string;
  newState: string;
  transition: string;
  duration: number;
  error?: string;
  timestamp: string;
}
