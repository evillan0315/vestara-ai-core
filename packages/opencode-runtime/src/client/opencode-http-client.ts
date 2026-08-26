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
  OpenCodePathInfo,
  OpenCodeProject,
  OpenCodeProviderSummary,
  OpenCodeRequestContext,
  OpenCodeSession,
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

  async listSessions(_context: OpenCodeRequestContext, signal?: AbortSignal): Promise<OpenCodeSession[]> {
    return this.requestJson({ path: '/session', timeoutMs: this.config.requestTimeoutMs, signal }) as Promise<
      OpenCodeSession[]
    >;
  }

  async createSession(
    input: CreateOpenCodeSessionInput,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    // The runtime's /session endpoint selects the provider/model via TOP-LEVEL
    // providerID/modelID fields; a nested `model` object is rejected (400).
    const providerID = input.providerID ?? input.model?.providerID;
    const modelID = input.modelID ?? input.model?.id;
    const body = {
      directory: input.directory,
      title: input.title,
      agent: input.agent,
      ...(providerID ? { providerID } : {}),
      ...(modelID ? { modelID } : {}),
    };
    return this.requestJson({
      path: '/session',
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<OpenCodeSession>;
  }

  async getSession(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async deleteSession(sessionId: string, _context: OpenCodeRequestContext, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}`,
      method: 'PATCH',
      body: { title },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async getSessionStatus(
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<Record<string, OpenCodeSessionStatusInfo>> {
    return this.requestJson({
      path: '/session/status',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
    }) as Promise<Record<string, OpenCodeSessionStatusInfo>>;
  }

  async getSessionTodos(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeTodo[]> {
    const raw = await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/todo`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeTodos(raw);
  }

  async getSessionChildren(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession[]> {
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/children`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession[]>;
  }

  async getSessionDiff(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeDiffFile[]> {
    const raw = await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/diff`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeDiff(raw);
  }

  async sendMessage(
    sessionId: string,
    input: SendOpenCodeMessageInput,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeMessageResult> {
    const result = await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/message`,
      method: 'POST',
      body: { parts: input.parts },
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return this.normalizeMessageResult(sessionId, result);
  }

  async listMessages(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeMessage[]> {
    const raw = await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/message`,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return normalizeMessages(raw);
  }

  async sendMessageAsync(
    sessionId: string,
    input: SendOpenCodeMessageAsyncInput,
    _context: OpenCodeRequestContext,
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
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/prompt_async`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<void> {
    const body: Record<string, unknown> = { command: input.command };
    if (input.arguments !== undefined) body.arguments = input.arguments;
    if (input.agent) body.agent = input.agent;
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/command`,
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
  }

  async abortSession(sessionId: string, _context: OpenCodeRequestContext, signal?: AbortSignal): Promise<boolean> {
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/abort`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const response = decision.decision === 'approve' ? (decision.scope === 'session' ? 'always' : 'once') : 'reject';
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (input.messageID) body.messageID = input.messageID;
    if (input.providerID) body.providerID = input.providerID;
    if (input.modelID) body.modelID = input.modelID;
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/init`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/share`,
      method: 'POST',
      body: {},
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async unshareSession(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/share`,
      method: 'DELETE',
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async summarizeSession(
    sessionId: string,
    input: SummarizeOpenCodeSessionInput,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const body: Record<string, unknown> = {};
    if (input.auto !== undefined) body.auto = input.auto;
    if (input.providerID) body.providerID = input.providerID;
    if (input.modelID) body.modelID = input.modelID;
    await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/summarize`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    const body: Record<string, unknown> = { messageID: input.messageID };
    if (input.partID) body.partID = input.partID;
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/revert`,
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    }) as Promise<OpenCodeSession>;
  }

  async unrevertSession(
    sessionId: string,
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeSession> {
    return this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/unrevert`,
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
    _context: OpenCodeRequestContext,
    signal?: AbortSignal,
  ): Promise<OpenCodeShellResult> {
    const body: Record<string, unknown> = { command: input.command };
    if (input.agent) body.agent = input.agent;
    if (input.messageID) body.messageID = input.messageID;
    if (input.model) body.model = { providerID: input.model.providerId, modelID: input.model.modelId };
    const raw = await this.requestJson({
      path: `/session/${encodeURIComponent(sessionId)}/shell`,
      method: 'POST',
      body,
      timeoutMs: this.config.requestTimeoutMs,
      signal,
      sessionId,
    });
    return this.normalizeShellResult(sessionId, raw);
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

  async *openEventStream(_context: OpenCodeRequestContext, signal?: AbortSignal): AsyncIterable<OpenCodeEvent> {
    const headers = {
      Authorization: basicAuthHeader(this.config.username, this.config.password),
      Accept: 'text/event-stream',
      'X-Vestara-Source': 'opencode-runtime',
    };
    const response = await fetch(`${this.baseUrl}/event`, { headers, signal });
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

  private normalizeMessageResult(sessionId: string, raw: unknown): OpenCodeMessageResult {
    if (!raw || typeof raw !== 'object') {
      return { sessionId, finished: true };
    }
    const record = raw as Record<string, unknown>;
    const text =
      typeof record.text === 'string'
        ? record.text
        : typeof record.content === 'string'
          ? (record.content as string)
          : undefined;
    return {
      sessionId,
      messageId: typeof record.id === 'string' ? (record.id as string) : undefined,
      text,
      finished: Boolean(record.finished ?? true),
    };
  }
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
