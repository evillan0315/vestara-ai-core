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

export interface OpenCodeDiffHunk {
  readonly oldStart?: number;
  readonly oldLines?: number;
  readonly newStart?: number;
  readonly newLines?: number;
  readonly content: string;
}

export interface OpenCodeDiffFile {
  readonly path: string;
  readonly operation?: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly additions?: number;
  readonly deletions?: number;
  readonly hunks: readonly OpenCodeDiffHunk[];
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
  readonly directory?: string;
  readonly title?: string;
  readonly agent?: string;
  readonly model?: { readonly providerID?: string; readonly id?: string };
}

export interface SendOpenCodeMessageInput {
  readonly parts: readonly OpenCodePromptPart[];
  readonly sessionId?: string;
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
  readonly createdAt?: string;
}

export interface SendOpenCodeMessageAsyncInput {
  readonly parts: readonly OpenCodePromptPart[];
  readonly messageID?: string;
  readonly agent?: string;
  readonly model?: { readonly providerId: string; readonly modelId: string };
  readonly system?: string;
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
