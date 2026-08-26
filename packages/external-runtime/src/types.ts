/**
 * External coding-agent runtime domain model.
 *
 * Strongly typed, immutable DTOs describing external engineering workers
 * (OpenCode, Claude Code, OpenAI Codex) and the normalized view Vestara keeps
 * of them. No `any`; discriminated unions and typed timestamps throughout.
 */

// ─── Runtime identity ──────────────────────────────────────────

export type ExternalRuntimeType = 'opencode' | 'claude-code' | 'openai-codex' | 'gemini' | 'unknown';

export type ExternalRuntimeConnectionStatus =
  | 'discovered'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'unreachable'
  | 'failed';

export type ExternalRuntimeIntegrationLevel =
  | 'discovery-only'
  | 'snapshot'
  | 'live-observation'
  | 'vestara-launched'
  | 'full-observation';

/**
 * How thoroughly Vestara has verified an adapter against a real runtime.
 * Implementation claims and evidence stay separate.
 */
export type RuntimeAdapterVerificationStatus =
  | 'untested'
  | 'unit-tested'
  | 'integration-tested'
  | 'live-discovery-verified'
  | 'live-session-verified'
  | 'live-reconnect-verified'
  | 'end-to-end-verified';

export interface ExternalRuntimeInstance {
  readonly id: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly displayName: string;
  readonly version?: string;
  readonly executablePath?: string;
  readonly processId?: number;
  readonly serverUrl?: string;
  readonly workspacePath?: string;
  readonly connectionStatus: ExternalRuntimeConnectionStatus;
  readonly integrationLevel: ExternalRuntimeIntegrationLevel;
  /** Capabilities the adapter implements (its ceiling). */
  readonly supportedCapabilities: readonly ExternalRuntimeCapability[];
  /** Capabilities actually exercised against this runtime instance. */
  readonly availableCapabilities: readonly ExternalRuntimeCapability[];
  readonly verificationStatus: RuntimeAdapterVerificationStatus;
  readonly discoveredAt: string;
  readonly lastSeenAt: string;
  /** Back-compat alias for supportedCapabilities. */
  readonly capabilities: readonly ExternalRuntimeCapability[];
  readonly isPrimary?: boolean;
  readonly isSecondary?: boolean;
}

// ─── Capabilities ──────────────────────────────────────────────

export type ExternalRuntimeCapability =
  | 'installation-discovery'
  | 'version-discovery'
  | 'process-discovery'
  | 'server-discovery'
  | 'configuration-discovery'
  | 'effective-configuration'
  | 'session-discovery'
  | 'session-details'
  | 'session-resume'
  | 'session-launch'
  | 'session-abort'
  | 'live-events'
  | 'structured-execution'
  | 'message-observation'
  | 'tool-observation'
  | 'command-observation'
  | 'file-observation'
  | 'diff-observation'
  | 'permission-observation'
  | 'diagnostic-observation'
  | 'todo-observation'
  | 'cost-observation'
  | 'model-observation'
  | 'provider-observation'
  | 'mcp-observation'
  | 'plugin-observation'
  | 'runtime-control';

// ─── Detection / connection ────────────────────────────────────

export interface ExternalRuntimeDetectionContext {
  readonly workspacePath: string;
  readonly workspaceId?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly executableHints?: readonly string[];
  readonly timeoutMs?: number;
}

export interface ExternalRuntimeDetectionResult {
  readonly runtimeType: ExternalRuntimeType;
  readonly detected: boolean;
  readonly executablePath?: string;
  readonly version?: string;
  readonly runningProcesses: readonly number[];
  readonly serverUrl?: string;
  readonly message?: string;
}

export interface ExternalRuntimeTarget {
  readonly runtimeType: ExternalRuntimeType;
  readonly executablePath?: string;
  readonly serverUrl?: string;
  readonly workspacePath: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

export interface ExternalRuntimeConnection {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly connectedAt: string;
  readonly mode: 'server' | 'process' | 'launch';
}

export interface ExternalRuntimeHealth {
  readonly status: 'ok' | 'degraded' | 'unreachable' | 'unknown';
  readonly version?: string;
  readonly serverUrl?: string;
  readonly latencyMs?: number;
  readonly checkedAt: string;
  readonly detail?: string;
}

// ─── Configuration ─────────────────────────────────────────────

export type ExternalConfigurationScope = 'global' | 'workspace' | 'directory' | 'custom' | 'runtime-home';

export interface ExternalConfigurationSource {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly path: string;
  readonly scope: ExternalConfigurationScope;
  readonly exists: boolean;
  readonly precedence: number;
  readonly discoveredAt: string;
  readonly contentHash?: string;
  readonly redactedContent?: unknown;
}

export type ConfigurationProvenance = 'runtime-reported' | 'resolved' | 'inferred' | 'unknown';

export interface EffectiveConfigurationValue {
  readonly key: string;
  readonly value: unknown;
  readonly sourceId?: string;
  readonly overriddenSourceIds: readonly string[];
  readonly provenance: ConfigurationProvenance;
}

export interface ExternalRuntimeConfigurationSnapshot {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly sources: readonly ExternalConfigurationSource[];
  readonly effective: Readonly<Record<string, unknown>>;
  readonly effectiveValues: readonly EffectiveConfigurationValue[];
  readonly capturedAt: string;
}

export interface RedactedEnvironmentReference {
  readonly name: string;
  readonly configured: boolean;
  readonly source: 'environment' | 'configuration' | 'credential-store' | 'unknown';
}

// ─── Sessions ──────────────────────────────────────────────────

export type ExternalSessionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'aborted' | 'compacted' | 'unknown';

export interface ExternalSessionSummary {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly externalSessionId: string;
  readonly title?: string;
  readonly status: ExternalSessionStatus;
  readonly integrationLevel: ExternalRuntimeIntegrationLevel;
  readonly agentId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly startedAt?: string;
  readonly lastActivityAt?: string;
  readonly filesChanged?: number;
  readonly toolCount?: number;
  readonly commandCount?: number;
  readonly permissionState?: 'none' | 'pending' | 'resolved';
  readonly correlation?: ExternalSessionCorrelation;
}

export interface ExternalSessionDetails extends ExternalSessionSummary {
  readonly messages: readonly ExternalSessionMessage[];
  readonly tools: readonly ExternalToolInvocation[];
  readonly commands: readonly ExternalCommandExecution[];
  readonly fileMutations: readonly ExternalFileMutation[];
  readonly diff?: ExternalSessionDiff;
  readonly permissions: readonly ExternalPermissionRequest[];
  readonly diagnostics: readonly ExternalDiagnostic[];
  readonly todos: readonly ExternalTodo[];
  readonly runtimeSnapshotId?: string;
  readonly partiallyObserved: boolean;
}

export interface ExternalSessionQuery {
  readonly status?: ExternalSessionStatus;
  readonly agentId?: string;
  readonly runtimeType?: ExternalRuntimeType;
  readonly since?: string;
  readonly limit?: number;
}

// ─── Messages / tools / commands / files ───────────────────────

export interface ExternalSessionMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly role: 'user' | 'assistant' | 'tool' | 'system';
  readonly content: readonly ExternalMessagePart[];
  readonly modelId?: string;
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

export type ExternalMessagePart =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'tool-invocation'; readonly tool: string; readonly input: unknown }
  | { readonly kind: 'tool-result'; readonly tool: string; readonly output: unknown }
  | { readonly kind: 'reasoning'; readonly text: string }
  | { readonly kind: 'unknown'; readonly data: unknown };

export interface ExternalToolInvocation {
  readonly id: string;
  readonly sessionId: string;
  readonly tool: string;
  readonly input?: unknown;
  readonly result?: unknown;
  readonly status: 'started' | 'completed' | 'failed';
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

export interface ExternalCommandExecution {
  readonly id: string;
  readonly sessionId: string;
  readonly command: string;
  readonly exitCode?: number;
  readonly outputHash?: string;
  readonly redactedOutput?: string;
  readonly status: 'started' | 'completed' | 'failed';
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

export interface ExternalFileMutation {
  readonly id: string;
  readonly sessionId: string;
  readonly filePath: string;
  readonly mutation: 'created' | 'modified' | 'deleted' | 'renamed';
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

export interface ExternalSessionDiff {
  readonly id: string;
  readonly sessionId: string;
  readonly files: readonly string[];
  readonly contentHash?: string;
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

// ─── Permissions / diagnostics / todos ─────────────────────────

export interface ExternalPermissionRequest {
  readonly id: string;
  readonly sessionId: string;
  readonly capability: string;
  readonly target?: string;
  readonly decision: 'pending' | 'allow' | 'deny' | 'ask';
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

export interface ExternalDiagnostic {
  readonly id: string;
  readonly sessionId: string;
  readonly filePath?: string;
  readonly severity: 'error' | 'warning' | 'info' | 'hint';
  readonly message: string;
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

export interface ExternalTodo {
  readonly id: string;
  readonly sessionId: string;
  readonly text: string;
  readonly status: 'pending' | 'in-progress' | 'completed' | 'cancelled';
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
}

// ─── Runtime intelligence (OpenCode configuration inventory) ───

export type ExternalAgentMode = 'primary' | 'subagent' | 'all' | 'built-in' | 'unknown';
export type ExternalProvenance = 'runtime-reported' | 'configuration' | 'file' | 'built-in' | 'inferred';

export interface ExternalModelReference {
  readonly providerId?: string;
  readonly modelId: string;
}

export interface ExternalPermissionRule {
  readonly capability: string;
  readonly pattern?: string;
  readonly decision: 'allow' | 'ask' | 'deny';
  readonly sourceId?: string;
  readonly scope: 'global' | 'agent' | 'session' | 'skill' | 'tool';
  readonly provenance: 'runtime-reported' | 'resolved' | 'inferred';
}

export interface ExternalAgentDefinition {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly externalAgentId: string;
  readonly name: string;
  readonly description?: string;
  readonly mode: ExternalAgentMode;
  readonly sourceId?: string;
  readonly sourcePath?: string;
  readonly model?: ExternalModelReference;
  readonly promptHash?: string;
  readonly redactedPrompt?: string;
  readonly tools: Readonly<Record<string, boolean>>;
  readonly permissions: readonly ExternalPermissionRule[];
  readonly options: Readonly<Record<string, unknown>>;
  readonly hidden: boolean;
  readonly builtIn: boolean;
  readonly enabled: boolean;
  readonly provenance: ExternalProvenance;
  readonly discoveredAt: string;
  readonly updatedAt: string;
  readonly contentHash: string;
}

export type ExternalSkillScope = 'workspace' | 'global' | 'claude-compatible' | 'agent-compatible' | 'explicit';

export type ExternalSkillSessionState =
  | 'available'
  | 'hidden'
  | 'denied'
  | 'advertised'
  | 'requested'
  | 'approval-required'
  | 'approved'
  | 'loaded'
  | 'failed';

export interface ExternalSkillResource {
  readonly name: string;
  readonly path: string;
}

export interface ExternalSkillDefinition {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly externalSkillId: string;
  readonly name: string;
  readonly description: string;
  readonly license?: string;
  readonly compatibility?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly sourcePath: string;
  readonly sourceScope: ExternalSkillScope;
  readonly baseDirectory: string;
  readonly supportingFiles: readonly ExternalSkillResource[];
  readonly contentHash: string;
  readonly redactedBody?: string;
  readonly valid: boolean;
  readonly validationErrors: readonly string[];
  readonly discoveredAt: string;
  readonly updatedAt: string;
}

export interface ExternalInstructionSource {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly path: string;
  readonly scope: 'workspace' | 'directory' | 'global' | 'profile' | 'compatibility' | 'explicit';
  readonly format: 'agents-md' | 'claude-md' | 'context-md' | 'markdown' | 'unknown';
  readonly contentHash: string;
  readonly redactedContent?: string;
  readonly precedence?: number;
  readonly active: boolean;
  readonly provenance: 'runtime-reported' | 'resolved' | 'inferred';
  readonly discoveredAt: string;
  readonly updatedAt: string;
}

export interface ExternalCommandDefinition {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly name: string;
  readonly description?: string;
  readonly sourcePath?: string;
  readonly sourceScope: ExternalConfigurationScope;
  readonly agentId?: string;
  readonly model?: ExternalModelReference;
  readonly templateHash: string;
  readonly redactedTemplate?: string;
  readonly createsSubtask?: boolean;
  readonly enabled: boolean;
  readonly discoveredAt: string;
  readonly updatedAt: string;
}

export type ExternalPluginSourceType = 'local' | 'npm' | 'global' | 'workspace' | 'unknown';

export interface ExternalPluginDefinition {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly name: string;
  readonly packageName?: string;
  readonly version?: string;
  readonly sourcePath?: string;
  readonly sourceType: ExternalPluginSourceType;
  readonly enabled: boolean;
  readonly loadOrder?: number;
  readonly contentHash?: string;
  readonly capabilities: readonly string[];
  readonly loadStatus: 'configured' | 'loaded' | 'failed' | 'unknown';
  readonly redactedError?: string;
  readonly discoveredAt: string;
  readonly updatedAt: string;
}

export interface ExternalMcpServer {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly name: string;
  readonly transport: 'stdio' | 'sse' | 'http' | 'streamable-http' | 'unknown';
  readonly local: boolean;
  readonly command?: string;
  readonly redactedArgs: readonly string[];
  readonly redactedEnvironment: readonly RedactedEnvironmentReference[];
  readonly url?: string;
  readonly enabled: boolean;
  readonly connectionState: 'configured' | 'connected' | 'disconnected' | 'failed' | 'unknown';
  readonly availableTools: readonly string[];
  readonly lastHealthAt?: string;
  readonly discoveredAt: string;
  readonly updatedAt: string;
}

export interface ExternalProvider {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly providerId: string;
  readonly displayName?: string;
  readonly configured: boolean;
  readonly credentialSource: 'environment' | 'configuration' | 'credential-store' | 'unknown';
  readonly baseUrl?: string;
  readonly models: readonly ExternalModelDefinition[];
  readonly discoveredAt: string;
}

export interface ExternalModelDefinition {
  readonly id: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly displayName?: string;
  readonly contextLimit?: number;
  readonly outputLimit?: number;
  readonly supportsTools?: boolean;
  readonly discoveredAt: string;
}

export interface ExternalSessionRuntimeSnapshot {
  readonly id: string;
  readonly sessionId: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: 'opencode';
  readonly runtimeVersion?: string;
  readonly agentId?: string;
  readonly agentDefinitionHash?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly availableSkillIds: readonly string[];
  /** Skills Vestara observed being loaded by this session (not merely available). */
  readonly loadedSkillIds: readonly string[];
  readonly advertisedSkillIds: readonly string[];
  readonly instructionSourceIds: readonly string[];
  readonly commandDefinitionIds: readonly string[];
  readonly pluginIds: readonly string[];
  readonly mcpServerIds: readonly string[];
  readonly toolConfigurationHash?: string;
  readonly permissionConfigurationHash?: string;
  readonly effectiveConfigurationHash: string;
  readonly configurationSourceIds: readonly string[];
  readonly observedAt: string;
  readonly provenance: 'runtime-reported' | 'resolved' | 'partially-inferred';
}

/** Per-skill session state: discovered/available is not loaded. */
export interface ExternalSkillSessionUsage {
  readonly skillId: string;
  readonly sessionId: string;
  readonly state: ExternalSkillSessionState;
  readonly agentId?: string;
  readonly observedAt: string;
}

// ─── Correlation ───────────────────────────────────────────────

export type ExternalCorrelationMethod =
  | 'explicit'
  | 'environment'
  | 'launch-record'
  | 'workspace-path'
  | 'git-worktree'
  | 'git-branch'
  | 'time-window'
  | 'file-overlap'
  | 'manual';

export interface CorrelationEvidence {
  readonly method: ExternalCorrelationMethod;
  readonly detail: string;
  readonly observedAt: string;
}

export interface ExternalSessionCorrelation {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly externalSessionId: string;
  readonly workspaceId: string;
  readonly planId?: string;
  readonly taskId?: string;
  readonly executionId?: string;
  readonly method: ExternalCorrelationMethod;
  readonly confidence: number;
  readonly evidence: readonly CorrelationEvidence[];
  readonly createdAt: string;
}

// ─── Events ────────────────────────────────────────────────────

export type ExternalEventCategory =
  | 'runtime'
  | 'session'
  | 'message'
  | 'tool'
  | 'command'
  | 'file'
  | 'diff'
  | 'permission'
  | 'diagnostic'
  | 'todo'
  | 'configuration'
  | 'intelligence'
  | 'correlation'
  | 'evidence';

export type ExternalObservationLevel = 'observed' | 'inferred' | 'reported' | 'partial';

export interface ExternalRuntimeEvent {
  readonly id: string;
  readonly schemaVersion: number;
  readonly category: ExternalEventCategory;
  readonly type: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly runtimeInstanceId: string;
  readonly externalEventId?: string;
  readonly externalSessionId?: string;
  readonly workspaceId?: string;
  readonly planId?: string;
  readonly taskId?: string;
  readonly executionId?: string;
  readonly externalTimestamp?: string;
  readonly ingestedAt: string;
  readonly sequence?: number;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly provenance: ConfigurationProvenance;
  readonly observationLevel: ExternalObservationLevel;
  readonly confidence?: number;
  readonly idempotencyKey: string;
}

export type ExternalRuntimeEventObserver = (event: ExternalRuntimeEvent) => void | Promise<void>;

export interface ExternalRuntimeSubscription {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly unsubscribe: () => void;
}

export interface ExternalLaunchedSession {
  readonly id: string;
  readonly runtimeInstanceId: string;
  readonly runtimeType: ExternalRuntimeType;
  readonly externalSessionId?: string;
  readonly launchedAt: string;
  readonly status: 'launching' | 'running' | 'completed' | 'failed';
}

export interface ExternalSessionLaunchRequest {
  readonly task: string;
  readonly cwd: string;
  readonly agentId?: string;
  readonly modelId?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly correlationIds?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

// ─── Adapter errors ────────────────────────────────────────────

export type ExternalAdapterErrorCode =
  | 'not-installed'
  | 'not-detected'
  | 'connection-failed'
  | 'unreachable'
  | 'unsupported-capability'
  | 'malformed-payload'
  | 'timeout'
  | 'redaction-failed'
  | 'stream-failed'
  | 'version-incompatible'
  | 'unauthorized'
  | 'internal';

export class ExternalAdapterError extends Error {
  readonly code: ExternalAdapterErrorCode;
  readonly runtimeType: ExternalRuntimeType;
  readonly retryable: boolean;

  constructor(
    code: ExternalAdapterErrorCode,
    runtimeType: ExternalRuntimeType,
    message: string,
    opts?: { retryable?: boolean },
  ) {
    super(message);
    this.name = 'ExternalAdapterError';
    this.code = code;
    this.runtimeType = runtimeType;
    this.retryable = opts?.retryable ?? (code === 'unreachable' || code === 'connection-failed' || code === 'timeout');
  }
}

export interface AdapterCapabilityStatus {
  readonly capability: ExternalRuntimeCapability;
  readonly available: boolean;
  readonly detail?: string;
}
