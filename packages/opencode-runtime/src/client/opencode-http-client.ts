// OpenCodeHttpClient — server-side HTTP client for the OpenCode headless server.
// Constructs Basic auth headers locally, never forwards client headers, applies
// timeouts and abort signals, and normalizes responses into typed DTOs.

import type { OpenCodeRuntimeConfig } from '../config';
import { normalizeAgents, normalizeCommands, normalizeProviders } from '../discovery-normalizers';
import { normalizeFileStatus, normalizeFindMatches, normalizeSymbols } from '../file-normalizers';
import { normalizeDiff, normalizeMessages, normalizeTodos } from '../session-normalizers';
import type { OpenCodeClient } from './opencode-client';
import {
  authenticationFailedError,
  invalidResponseError,
  sessionNotFoundError,
  timeoutError,
  unavailableError,
  upstreamError,
} from './opencode-errors';
import type {
  CreateOpenCodeSessionInput,
  InitOpenCodeSessionInput,
  OpenCodeActiveSessionInfo,
  OpenCodeAgentSummary,
  OpenCodeCommandSummary,
  OpenCodeDiffFile,
  OpenCodeEvent,
  OpenCodeFileChange,
  OpenCodeFileContent,
  OpenCodeFileQuery,
  OpenCodeFindFileQuery,
  OpenCodeFindMatch,
  OpenCodeFindSymbolQuery,
  OpenCodeFindTextQuery,
  OpenCodeHealth,
  OpenCodeMessage,
  OpenCodeMessageResult,
  OpenCodeModelRef,
  OpenCodePathInfo,
  OpenCodeProject,
  OpenCodeProviderSummary,
  OpenCodeQuestionReply,
  OpenCodeQuestionRequest,
  OpenCodeRequestContext,
  OpenCodeSession,
  OpenCodeSessionHistory,
  OpenCodeSessionStatusInfo,
  OpenCodeShellResult,
  OpenCodeSymbol,
  OpenCodeTodo,
  OpenCodeVcsInfo,
  RevertOpenCodeSessionInput,
  RunOpenCodeCommandInput,
  RunOpenCodeShellInput,
  SendOpenCodeMessageAsyncInput,
  SendOpenCodeMessageInput,
  SummarizeOpenCodeSessionInput,
  VestaraPermissionDecision,
} from './opencode-types';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

interface RequestOptions {
  readonly path: string;
  readonly method?: string;
  readonly body?: unknown;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly sessionId?: string;
}

export class OpenCodeHttpClient implements OpenCodeClient {
  private readonly config: OpenCodeRuntimeConfig;

  constructor(config: OpenCodeRuntimeConfig) {
    this.config = config;
  }

  get baseUrl(): string {
    return this.config.baseUrl.toString().replace(/\/$/, '');
  }

  // ── Health ────────────────────────────────────────────────────────────

  async getHealth(signal?: AbortSignal): Promise<OpenCodeHealth> {
    return this.requestJson({
      path: '/global/health',
      timeoutMs: this.config.healthTimeoutMs,
      signal,
    }) as Promise<OpenCodeHealth>;
  }

  async getOpenApiDocument(signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.requestJson({
      path: '/doc',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<Record<string, unknown>>;
  }

  // ── Projects ──────────────────────────────────────────────────────────

  async listProjects(signal?: AbortSignal): Promise<OpenCodeProject[]> {
    return this.requestJson({ path: '/project', timeoutMs: this.config.requestTimeoutMs, signal }) as Promise<
      OpenCodeProject[]
    >;
  }

  async getCurrentProject(signal?: AbortSignal): Promise<OpenCodeProject> {
    return this.requestJson({
      path: '/project/current',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodeProject>;
  }

  // ── Discovery ─────────────────────────────────────────────────────────

  async getPathInfo(signal?: AbortSignal): Promise<OpenCodePathInfo> {
    return this.requestJson({
      path: '/path',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodePathInfo>;
  }

  async getVcsInfo(signal?: AbortSignal): Promise<OpenCodeVcsInfo> {
    return this.requestJson({
      path: '/vcs',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodeVcsInfo>;
  }

  async listProviders(signal?: AbortSignal): Promise<OpenCodeProviderSummary[]> {
    const raw = await this.requestJson({ path: '/provider', timeoutMs: this.config.requestTimeoutMs, signal });
    return normalizeProviders(raw);
  }

  async listAgents(signal?: AbortSignal): Promise<OpenCodeAgentSummary[]> {
    const raw = await this.requestJson({ path: '/agent', timeoutMs: this.config.requestTimeoutMs, signal });
    return normalizeAgents(raw);
  }

  async listCommands(signal?: AbortSignal): Promise<OpenCodeCommandSummary[]> {
    const raw = await this.requestJson({ path: '/command', timeoutMs: this.config.requestTimeoutMs, signal });
    return normalizeCommands(raw);
  }

  async listLsp(signal?: AbortSignal): Promise<unknown[]> {
    const raw = await this.requestJson({ path: '/lsp', timeoutMs: this.config.requestTimeoutMs, signal });
    return Array.isArray(raw) ? raw : [];
  }

  // ── Sessions ──────────────────────────────────────────────────────────

  async listSessions(context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeSession[]> {
    return this.requestJson({
      path: this.withQuery('/session', { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodeSession[]>;
  }

  async createSession(
    input: CreateOpenCodeSessionInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    // OpenCode session creation: directory goes in query, title in body.
    // Agent/model are NOT session-creation properties — they belong in message sending.
    const path = this.withQuery('/session', { directory: context.directory });
    return this.requestJson({
      path,
      method: 'POST',
      body: { title: input.title },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodeSession>;
  }

  async getSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeSession> {
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}`, { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async deleteSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}`, { directory: context.directory }),
      method: 'DELETE',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async renameSession(
    sessionId: string,
    title: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}`, { directory: context.directory }),
      method: 'PATCH',
      body: { title },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async getSessionStatus(
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<Record<string, OpenCodeSessionStatusInfo>> {
    return this.requestJson({
      path: this.withQuery('/session/status', { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<Record<string, OpenCodeSessionStatusInfo>>;
  }

  async getSessionTodos(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeTodo[]> {
    const raw = await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/todo`, { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeTodos(raw);
  }

  async getSessionChildren(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession[]> {
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/children`, { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession[]>;
  }

  async getSessionDiff(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeDiffFile[]> {
    const raw = await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/diff`, { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeDiff(raw);
  }

  async sendMessage(
    sessionId: string,
    input: SendOpenCodeMessageInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeMessageResult> {
    // OpenCode message sending: agent/model in body, directory in query.
    const body: Record<string, unknown> = { parts: input.parts };
    if (input.agent) body.agent = input.agent;
    if (input.model) body.model = input.model;
    const path = this.withQuery(`/session/${encodeURIComponent(sessionId)}/message`, {
      directory: context.directory,
    });
    const result = await this.requestJson({
      path,
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return this.normalizeMessageResult(sessionId, result);
  }

  async listMessages(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeMessage[]> {
    const raw = await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/message`, { directory: context.directory }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeMessages(raw);
  }

  async sendMessageAsync(
    sessionId: string,
    input: SendOpenCodeMessageAsyncInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<void> {
    const body: Record<string, unknown> = { parts: input.parts };
    if (input.messageID) body.messageID = input.messageID;
    if (input.agent) body.agent = input.agent;
    if (input.system) body.system = input.system;
    if (input.format) body.format = input.format;
    if (input.noReply !== undefined) body.noReply = input.noReply;
    if (input.model) {
      body.model = { providerID: input.model.providerId, modelID: input.model.modelId };
    }
    const path = this.withQuery(`/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      directory: context.directory,
    });
    await this.requestJson({
      path,
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
  }

  async runCommand(
    sessionId: string,
    input: RunOpenCodeCommandInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<void> {
    const body: Record<string, unknown> = { command: input.command };
    if (input.arguments !== undefined) body.arguments = input.arguments;
    if (input.agent) body.agent = input.agent;
    await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/command`, { directory: context.directory }),
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
  }

  async abortSession(sessionId: string, context: OpenCodeRequestContext, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/abort`, { directory: context.directory }),
      method: 'POST',
      body: {},
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async respondToPermission(
    sessionId: string,
    permissionId: string,
    decision: VestaraPermissionDecision,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const response = decision.decision === 'approve' ? (decision.scope === 'session' ? 'always' : 'once') : 'reject';
    await this.requestJson({
      path: this.withQuery(
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
        { directory: context.directory },
      ),
      method: 'POST',
      body: { response },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  // ── Session lifecycle extensions ───────────────────────────

  async initSession(
    sessionId: string,
    input: InitOpenCodeSessionInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (input.messageID) body.messageID = input.messageID;
    if (input.providerID) body.providerID = input.providerID;
    if (input.modelID) body.modelID = input.modelID;
    await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/init`, { directory: context.directory }),
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async shareSession(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/share`, { directory: context.directory }),
      method: 'POST',
      body: {},
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async unshareSession(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/share`, { directory: context.directory }),
      method: 'DELETE',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async summarizeSession(
    sessionId: string,
    input: SummarizeOpenCodeSessionInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (input.auto !== undefined) body.auto = input.auto;
    if (input.providerID) body.providerID = input.providerID;
    if (input.modelID) body.modelID = input.modelID;
    await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/summarize`, { directory: context.directory }),
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async revertSession(
    sessionId: string,
    input: RevertOpenCodeSessionInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    const body: Record<string, unknown> = { messageID: input.messageID };
    if (input.partID) body.partID = input.partID;
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/revert`, { directory: context.directory }),
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async unrevertSession(
    sessionId: string,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/unrevert`, { directory: context.directory }),
      method: 'POST',
      body: {},
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async runShell(
    sessionId: string,
    input: RunOpenCodeShellInput,
    context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeShellResult> {
    const body: Record<string, unknown> = { command: input.command };
    if (input.agent) body.agent = input.agent;
    if (input.messageID) body.messageID = input.messageID;
    if (input.model) body.model = { providerID: input.model.providerId, modelID: input.model.modelId };
    const raw = await this.requestJson({
      path: this.withQuery(`/session/${encodeURIComponent(sessionId)}/shell`, { directory: context.directory }),
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return this.normalizeShellResult(sessionId, raw);
  }

  // ── File / find surface ────────────────────────────────────

  // ── M6: Session lifecycle extensions ──────────────────────

  async listActiveSessions(signal?: AbortSignal): Promise<Record<string, OpenCodeActiveSessionInfo>> {
    const raw = await this.requestJson({
      path: '/api/session/active',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return this.unwrapData(raw) as Record<string, OpenCodeActiveSessionInfo>;
  }

  async getSessionContext(sessionId: string, signal?: AbortSignal): Promise<OpenCodeMessage[]> {
    const raw = await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/context`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeMessages(this.unwrapData(raw));
  }

  async getSessionHistory(
    sessionId: string,
    options?: { readonly limit?: number; readonly after?: string },
    signal?: AbortSignal,
  ): Promise<OpenCodeSessionHistory> {
    const path = this.withQuery(`/api/session/${encodeURIComponent(sessionId)}/history`, {
      limit: options?.limit !== undefined ? String(options.limit) : undefined,
      after: options?.after,
    });
    const raw = await this.requestJson({
      path,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    // SessionHistory is NOT wrapped in data — it has { data: [...], hasMore: bool } at top level.
    if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
      const record = raw as Record<string, unknown>;
      return {
        data: normalizeSessionDurableEvents(record.data),
        hasMore: Boolean(record.hasMore),
      };
    }
    return { data: [], hasMore: false };
  }

  async switchSessionAgent(sessionId: string, agent: string, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/agent`,
      method: 'POST',
      body: { agent },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async switchSessionModel(sessionId: string, model: OpenCodeModelRef, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/model`,
      method: 'POST',
      body: { model },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async compactSession(sessionId: string, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/compact`,
      method: 'POST',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async interruptSession(sessionId: string, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/interrupt`,
      method: 'POST',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async waitSession(sessionId: string, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/wait`,
      method: 'POST',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async listQuestions(sessionId: string, signal?: AbortSignal): Promise<OpenCodeQuestionRequest[]> {
    const raw = await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/question`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeQuestions(this.unwrapData(raw));
  }

  async replyToQuestion(
    sessionId: string,
    requestId: string,
    reply: OpenCodeQuestionReply,
    signal?: AbortSignal,
  ): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(requestId)}/reply`,
      method: 'POST',
      body: { answers: reply.answers },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  async rejectQuestion(sessionId: string, requestId: string, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/api/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(requestId)}/reject`,
      method: 'POST',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return true;
  }

  // ── File / find surface ────────────────────────────────────

  async findText(query: OpenCodeFindTextQuery, signal?: AbortSignal): Promise<OpenCodeFindMatch[]> {
    const raw = await this.requestJson({
      path: this.withQuery('/find', { pattern: query.pattern, directory: query.directory, workspace: query.workspace }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return normalizeFindMatches(raw);
  }

  async findFiles(query: OpenCodeFindFileQuery, signal?: AbortSignal): Promise<string[]> {
    const raw = await this.requestJson({
      path: this.withQuery('/find/file', {
        query: query.query,
        dirs: query.dirs,
        type: query.type,
        limit: query.limit,
        directory: query.directory,
        workspace: query.workspace,
      }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
  }

  async findSymbols(query: OpenCodeFindSymbolQuery, signal?: AbortSignal): Promise<OpenCodeSymbol[]> {
    const raw = await this.requestJson({
      path: this.withQuery('/find/symbol', {
        query: query.query,
        directory: query.directory,
        workspace: query.workspace,
      }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return normalizeSymbols(raw);
  }

  async readFile(query: OpenCodeFileQuery, signal?: AbortSignal): Promise<OpenCodeFileContent> {
    return this.requestJson({
      path: this.withQuery('/file/content', {
        path: query.path,
        directory: query.directory,
        workspace: query.workspace,
      }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodeFileContent>;
  }

  async fileStatus(query: OpenCodeFileQuery | undefined, signal?: AbortSignal): Promise<OpenCodeFileChange[]> {
    const raw = await this.requestJson({
      path: this.withQuery('/file/status', {
        directory: query?.directory,
        workspace: query?.workspace,
      }),
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    });
    return normalizeFileStatus(raw);
  }

  // ── Events ────────────────────────────────────────────────────────────

  async *openEventStream(context: OpenCodeRequestContext, signal?: AbortSignal): AsyncIterable<OpenCodeEvent> {
    const headers = {
      Authorization: basicAuthHeader(this.config.username, this.config.password),
      Accept: 'text/event-stream',
      'X-Vestara-Source': 'opencode-runtime',
    };
    const url = this.withQuery(`${this.baseUrl}/event`, { directory: context.directory });
    const response = await fetch(url, { headers, signal });
    if (!response.ok || !response.body) {
      throw mapHttpStatus(response.status, undefined);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = parseSseFrame(frame);
          if (event) yield event;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── Shared request plumbing ───────────────────────────────────────────

  /** Unwrap a `{ data: T }` envelope, returning `data` or a fallback. */
  private unwrapData(raw: unknown, fallback: unknown = []): unknown {
    if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
      return (raw as Record<string, unknown>).data;
    }
    return fallback;
  }

  /** Append URL-encoded query params, omitting `undefined`/empty values. */
  private withQuery(path: string, params: Record<string, string | number | boolean | undefined>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `${path}?${query}` : path;
  }

  private normalizeShellResult(_sessionId: string, raw: unknown): OpenCodeShellResult {
    if (!raw || typeof raw !== 'object') return { info: undefined, parts: [] };
    const record = raw as Record<string, unknown>;
    const messages = normalizeMessages([record]);
    return { info: messages[0], parts: messages[0]?.parts ?? [] };
  }

  private normalizeMessageResult(sessionId: string, raw: unknown): OpenCodeMessageResult {
    if (!raw || typeof raw !== 'object') {
      return { sessionId, finished: true };
    }
    const record = raw as Record<string, unknown>;
    const info = (record.info ?? record) as Record<string, unknown>;
    // The POST /session/:id/message response is { info: {...}, parts: [...] }.
    // The assistant text lives in the text parts — not at a top-level `text` field.
    const text =
      typeof info.text === 'string' && info.text
        ? (info.text as string)
        : Array.isArray(record.parts)
          ? (record.parts as readonly Record<string, unknown>[])
              .filter((part) => part?.type === 'text' && typeof part.text === 'string')
              .map((part) => part.text as string)
              .join('\n')
          : undefined;
    return {
      sessionId,
      messageId: typeof info.id === 'string' ? (info.id as string) : undefined,
      text,
      finished: info.finish === 'stop' || info.finish === 'end_turn' || record.finished === true,
    };
  }

  private async requestJson(options: RequestOptions): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort);
    try {
      const headers: Record<string, string> = {
        Authorization: basicAuthHeader(this.config.username, this.config.password),
        Accept: 'application/json',
        'X-Vestara-Source': 'opencode-runtime',
      };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${options.path}`, {
          method: options.method ?? 'GET',
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted && !options.signal?.aborted) throw timeoutError();
        throw unavailableError();
      }
      if (!response.ok) throw mapHttpStatus(response.status, options.sessionId);
      if (response.status === 204) return undefined;
      try {
        return await response.json();
      } catch {
        throw invalidResponseError();
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}

// ── M6 normalizers (module-level, pure) ─────────────────────

function normalizeSessionDurableEvents(
  raw: unknown,
): readonly import('./opencode-types').OpenCodeSessionDurableEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((event) => ({
      id: typeof event.id === 'string' ? event.id : `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      type: typeof event.type === 'string' ? event.type : 'unknown',
      timestamp: typeof event.timestamp === 'string' ? event.timestamp : undefined,
      properties:
        event.properties && typeof event.properties === 'object'
          ? (event.properties as Record<string, unknown>)
          : undefined,
    }));
}

function normalizeQuestions(raw: unknown): OpenCodeQuestionRequest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((q) => ({
      id: typeof q.id === 'string' ? q.id : '',
      sessionID: typeof q.sessionID === 'string' ? q.sessionID : '',
      questions: Array.isArray(q.questions)
        ? q.questions
            .filter((qi): qi is Record<string, unknown> => Boolean(qi) && typeof qi === 'object')
            .map((qi) => ({
              question: typeof qi.question === 'string' ? qi.question : '',
              header: typeof qi.header === 'string' ? qi.header : '',
              options: Array.isArray(qi.options)
                ? qi.options
                    .filter((opt): opt is Record<string, unknown> => Boolean(opt) && typeof opt === 'object')
                    .map((opt) => ({
                      label: typeof opt.label === 'string' ? opt.label : '',
                      description: typeof opt.description === 'string' ? opt.description : undefined,
                    }))
                : [],
              custom: typeof qi.custom === 'boolean' ? qi.custom : undefined,
              multiple: typeof qi.multiple === 'boolean' ? qi.multiple : undefined,
            }))
        : [],
      tool:
        q.tool && typeof q.tool === 'object'
          ? {
              name:
                typeof (q.tool as Record<string, unknown>).name === 'string'
                  ? ((q.tool as Record<string, unknown>).name as string)
                  : '',
              callID:
                typeof (q.tool as Record<string, unknown>).callID === 'string'
                  ? ((q.tool as Record<string, unknown>).callID as string)
                  : undefined,
            }
          : undefined,
    }))
    .filter((q) => q.id.length > 0 && q.sessionID.length > 0);
}

function mapHttpStatus(status: number, sessionId: string | undefined): Error {
  switch (status) {
    case 401:
    case 403:
      return authenticationFailedError();
    case 404:
      return sessionId ? sessionNotFoundError(sessionId) : sessionNotFoundError('unknown');
    case 408:
    case 429:
    case 500:
    case 502:
    case 503:
    case 504:
      return upstreamError(status);
    default:
      return upstreamError(status);
  }
}

function parseSseFrame(frame: string): OpenCodeEvent | undefined {
  const lines = frame.split('\n');
  let type = 'message';
  let data = '';
  let id = `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  for (const line of lines) {
    if (line.startsWith('event:')) type = line.slice(6).trim() || type;
    else if (line.startsWith('data:')) data += line.slice(5).trim();
    else if (line.startsWith('id:')) id = line.slice(3).trim() || id;
  }
  if (!data) return undefined;
  let payload: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      // OpenCode sends the event type inside the JSON body (not as an SSE
      // `event:` header) with the rest of the payload under `properties`.
      if (typeof parsed.type === 'string' && parsed.type) type = parsed.type;
      if (typeof parsed.id === 'string' && parsed.id) id = parsed.id;
      const properties = parsed.properties;
      payload =
        properties && typeof properties === 'object'
          ? (properties as Record<string, unknown>)
          : { ...parsed, type: undefined, id: undefined, properties: undefined };
    }
  } catch {
    payload = { raw: data };
  }
  return { id, type, payload };
}
