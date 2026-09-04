// Typed Vestara-domain DTOs for the OpenCode integration. These are normalized
// from upstream responses and never expose native Response objects or raw
// upstream payloads to the API layer.

export interface OpenCodeHealth {
  readonly healthy: boolean;
  readonly version?: string;
}

export interface OpenCodeProject {
  readonly id: string;
  readonly worktree: string;
  readonly vcs?: string;
}

export interface OpenCodePathInfo {
  readonly home?: string;
  readonly state?: string;
  readonly config?: string;
  readonly worktree?: string;
  readonly directory?: string;
}

export interface OpenCodeVcsInfo {
  readonly branch?: string;
  readonly defaultBranch?: string;
}

export interface OpenCodeProviderSummary {
  readonly id: string;
  readonly name?: string;
  readonly source?: string;
  readonly modelCount: number;
  /** Model ids discovered for this provider (keys of the provider's models map). */
  readonly models?: readonly string[];
}

export interface OpenCodeAgentSummary {
  readonly name: string;
  readonly description?: string;
  readonly mode?: string;
  readonly native?: boolean;
}

export interface OpenCodeCommandSummary {
  readonly name: string;
  readonly description?: string;
  readonly source?: string;
}

export interface OpenCodeDiscovery {
  readonly project?: OpenCodeProject;
  readonly path?: OpenCodePathInfo;
  readonly vcs?: OpenCodeVcsInfo;
  readonly providers: readonly OpenCodeProviderSummary[];
  readonly agents: readonly OpenCodeAgentSummary[];
  readonly commands: readonly OpenCodeCommandSummary[];
  readonly lsp: readonly unknown[];
}

export type OpenCodeSessionStatus = 'active' | 'idle' | 'completed' | 'aborted' | 'error' | 'deleted';

export interface OpenCodeSession {
  readonly id: string;
  readonly title?: string;
  readonly directory?: string;
  readonly status: OpenCodeSessionStatus;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export interface OpenCodeSessionStatusInfo {
  readonly type: 'idle' | 'busy' | 'error';
}

export interface OpenCodeTodo {
  readonly id?: string;
  readonly content: string;
  readonly status?: string;
}

/**
 * One file's runtime diff evidence (OpenCode 1.18.27).
 *
 * The server contract (SnapshotFileDiff / VcsFileDiff) exposes `patch?: string`
 * — unified diff text — NOT structured hunks. GA-UX-PREMIUM M3.2 models the
 * actual runtime contract; `patch` is preserved verbatim (bounded downstream).
 */
export interface OpenCodeDiffFile {
  readonly path: string;
  readonly operation?: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly additions?: number;
  readonly deletions?: number;
  /** Runtime-provided unified diff patch text (absent when the server omits it). */
  readonly patch?: string;
}

export interface OpenCodeSessionBinding {
  readonly openCodeSessionId: string;
  readonly vestaraSessionId: string;
  readonly workspaceId: string;
  readonly executionId?: string;
  readonly agentId?: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly status: 'active' | 'completed' | 'aborted' | 'deleted';
}

export interface OpenCodeRequestContext {
  readonly workspaceId: string;
  /** Canonical filesystem directory for the workspace — used as OpenCode query parameter for project resolution. */
  readonly directory?: string;
  readonly executionId?: string;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
}

export type OpenCodePromptPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'tool'; readonly tool: string; readonly input?: Record<string, unknown> }
  | { readonly type: 'file'; readonly path: string; readonly content?: string };

export interface CreateOpenCodeSessionInput {
  /** Session title — semantic task/workflow name. */
  readonly title?: string;
}

export interface SendMessageInput {
  /** Runtime agent (e.g. vestara-developer) to run the completion as. */
  readonly agent?: string;
  /** Provider/model selection for this message. */
  readonly model?: { readonly providerID: string; readonly modelID: string };
  /** Message parts (text, file, etc). */
  readonly parts: readonly OpenCodePromptPart[];
}

export interface SendOpenCodeMessageInput {
  readonly parts: readonly OpenCodePromptPart[];
  readonly sessionId?: string;
  readonly agent?: string;
  readonly model?: { readonly providerID: string; readonly modelID: string };
}

export interface OpenCodeMessageResult {
  readonly sessionId: string;
  readonly messageId?: string;
  readonly text?: string;
  readonly finished: boolean;
}

export interface OpenCodeMessagePart {
  readonly id?: string;
  readonly type: string;
  readonly text?: string;
  readonly content?: string;
}

export interface OpenCodeMessage {
  readonly id?: string;
  readonly role?: string;
  readonly sessionId?: string;
  readonly agent?: string;
  readonly model?: string;
  readonly text: string;
  readonly parts: readonly OpenCodeMessagePart[];
  /** Parsed structured output when the prompt requested a `json_schema` format. */
  readonly structuredOutput?: unknown;
  readonly createdAt?: string;
}

export interface SendOpenCodeMessageAsyncInput {
  readonly parts: readonly OpenCodePromptPart[];
  readonly messageID?: string;
  readonly agent?: string;
  readonly model?: { readonly providerId: string; readonly modelId: string };
  readonly system?: string;
  /** Request validated structured output. When set, the model emits a
   * `structured_output` part via the StructuredOutput tool. */
  readonly format?: OpenCodeOutputFormat;
  /** Inject context only, without triggering an AI response. */
  readonly noReply?: boolean;
}

export interface RunOpenCodeCommandInput {
  readonly command: string;
  readonly arguments?: string;
  readonly agent?: string;
}

export type VestaraPermissionDecision =
  | {
      readonly decision: 'approve';
      readonly scope: 'once' | 'session';
      readonly reason?: string;
    }
  | {
      readonly decision: 'reject';
      readonly reason: string;
    };

export interface OpenCodeEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp?: string;
  readonly payload?: Record<string, unknown>;
}

// ─── Structured output ──────────────────────────────────────

/** JSON Schema document (OpenCode `JSONSchema`). Kept opaque for the client. */
export type OpenCodeJsonSchema = Record<string, unknown>;

/**
 * OpenCode `OutputFormat`. Requesting `json_schema` forces the model to produce
 * validated JSON (via the StructuredOutput tool) matching the given schema.
 */
export type OpenCodeOutputFormat =
  | { readonly type: 'text' }
  | { readonly type: 'json_schema'; readonly schema: OpenCodeJsonSchema; readonly retryCount?: number };

// ─── Session lifecycle extensions ───────────────────────────

export interface InitOpenCodeSessionInput {
  readonly messageID?: string;
  readonly modelID?: string;
  readonly providerID?: string;
}

export interface SummarizeOpenCodeSessionInput {
  readonly auto?: boolean;
  readonly modelID?: string;
  readonly providerID?: string;
}

export interface RevertOpenCodeSessionInput {
  readonly messageID: string;
  readonly partID?: string;
}

export interface RunOpenCodeShellInput {
  readonly command: string;
  readonly agent?: string;
  readonly messageID?: string;
  readonly model?: { readonly providerId: string; readonly modelId: string };
}

/** Result of `session.shell` — an assistant message and its parts. */
export interface OpenCodeShellResult {
  readonly info?: OpenCodeMessage;
  readonly parts?: readonly OpenCodeMessagePart[];
}

// ─── File / find surface ────────────────────────────────────

/** `find.text` result — normalized from upstream snake_case to camelCase. */
export interface OpenCodeFindMatch {
  readonly path: string;
  readonly lines?: string;
  readonly lineNumber?: number;
  readonly absoluteOffset?: number;
  readonly submatches?: readonly { readonly text?: string; readonly start?: number; readonly end?: number }[];
}

export interface OpenCodeSymbol {
  readonly name: string;
  readonly kind: number;
  readonly location: { readonly uri: string; readonly range?: unknown };
}

export interface OpenCodeFileContent {
  readonly type: 'text' | 'binary';
  readonly content: string;
  readonly encoding?: 'base64';
  readonly mimeType?: string;
  readonly diff?: string;
  readonly patch?: unknown;
}

export type OpenCodeFileChangeStatus = 'added' | 'deleted' | 'modified';

export interface OpenCodeFileChange {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
  readonly status: OpenCodeFileChangeStatus;
}

// ─── M6: Session lifecycle types ────────────────────────────

/** Active session status returned by `GET /session/active`. */
export interface OpenCodeActiveSessionInfo {
  readonly type: 'running';
}

/** Model reference for switching models on a session. */
export interface OpenCodeModelRef {
  readonly id: string;
  readonly providerID: string;
  readonly variant?: string;
}

/** Cursor-paginated session history entry. */
export interface OpenCodeSessionDurableEvent {
  readonly id: string;
  readonly type: string;
  readonly timestamp?: string;
  readonly properties?: Record<string, unknown>;
}

/** Paginated session history response. */
export interface OpenCodeSessionHistory {
  readonly data: readonly OpenCodeSessionDurableEvent[];
  readonly hasMore: boolean;
}

/** Question option within a question request. */
export interface OpenCodeQuestionOption {
  readonly label: string;
  readonly description?: string;
}

/** Individual question within a question request. */
export interface OpenCodeQuestionInfo {
  readonly question: string;
  readonly header: string;
  readonly options: readonly OpenCodeQuestionOption[];
  readonly custom?: boolean;
  readonly multiple?: boolean;
}

/** Tool context for a question request. */
export interface OpenCodeQuestionTool {
  readonly name: string;
  readonly callID?: string;
}

/** Pending question from an OpenCode session. */
export interface OpenCodeQuestionRequest {
  readonly id: string;
  readonly sessionID: string;
  readonly questions: readonly OpenCodeQuestionInfo[];
  readonly tool?: OpenCodeQuestionTool;
}

/** Answer to a question — array of selected labels per question. */
export type OpenCodeQuestionAnswer = readonly string[];

/** Reply body for answering questions. */
export interface OpenCodeQuestionReply {
  readonly answers: readonly OpenCodeQuestionAnswer[];
}

// ─── File / find query inputs ───────────────────────────────

export interface OpenCodeFindTextQuery {
  readonly pattern: string;
  readonly directory?: string;
  readonly workspace?: string;
}

export interface OpenCodeFindFileQuery {
  readonly query: string;
  readonly dirs?: string;
  readonly type?: string;
  readonly limit?: number;
  readonly directory?: string;
  readonly workspace?: string;
}

export interface OpenCodeFindSymbolQuery {
  readonly query: string;
  readonly directory?: string;
  readonly workspace?: string;
}

export interface OpenCodeFileQuery {
  readonly path: string;
  readonly directory?: string;
  readonly workspace?: string;
}
