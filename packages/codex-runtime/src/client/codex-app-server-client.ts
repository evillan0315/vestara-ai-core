import WebSocket from 'ws';
import { type CodexRuntimeConfig, resolveCodexRuntimeConfig } from '../config';
import type {
  CodexAppServerNotification,
  CodexInitializeResult,
  CodexItemListParams,
  CodexItemListResult,
  CodexJsonRpcErrorObject,
  CodexJsonRpcId,
  CodexJsonRpcResponse,
  CodexPageParams,
  CodexThreadListParams,
  CodexThreadListResult,
  CodexThreadReadParams,
  CodexThreadReadResult,
  CodexThreadStartResult,
  CodexTurnInputPart,
  CodexTurnListResult,
  CodexTurnStartParams,
  CodexTurnStartResult,
} from './codex-app-server-types';

export interface CodexAppServerClientOptions {
  readonly config?: Partial<CodexRuntimeConfig>;
}

export type CodexNotificationListener = (notification: CodexAppServerNotification) => void;

interface PendingRequest {
  readonly method: string;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: NodeJS.Timeout;
}

export class CodexAppServerError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'CodexAppServerError';
  }

  static fromRpcError(error: CodexJsonRpcErrorObject): CodexAppServerError {
    return new CodexAppServerError(error.message, error.code, error.data);
  }
}

export class CodexAppServerClient {
  private readonly config: CodexRuntimeConfig;
  private socket: WebSocket | undefined;
  private nextId = 0;
  private initialized = false;
  private readonly pending = new Map<CodexJsonRpcId, PendingRequest>();
  private readonly notificationListeners = new Set<CodexNotificationListener>();

  constructor(options: CodexAppServerClientOptions = {}) {
    this.config = resolveCodexRuntimeConfig(options.config);
  }

  get url(): string {
    return this.config.appServerUrl;
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve, reject) => {
        this.socket?.once('open', resolve);
        this.socket?.once('error', reject);
      });
      return;
    }

    const headers = this.config.authToken ? { Authorization: `Bearer ${this.config.authToken}` } : undefined;
    const socket = new WebSocket(this.config.appServerUrl, headers ? { headers } : undefined);
    this.socket = socket;

    socket.on('message', (data) => this.handleMessage(data));
    socket.on('close', () => this.rejectAllPending(new CodexAppServerError('Codex App Server connection closed')));
    socket.on('error', (error) => this.rejectAllPending(error instanceof Error ? error : new Error(String(error))));

    await new Promise<void>((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
      socket.once('close', () => reject(new CodexAppServerError('Codex App Server closed before opening')));
    });
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    this.initialized = false;
    this.rejectAllPending(new CodexAppServerError('Codex App Server client closed'));
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      socket.once('close', () => resolve());
      socket.close();
    });
  }

  onNotification(listener: CodexNotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  async initialize(clientInfo = { name: 'vestara', version: 'dev' }): Promise<CodexInitializeResult> {
    await this.connect();
    const result = await this.request<CodexInitializeResult>('initialize', {
      clientInfo,
      capabilities: {},
    });
    this.notify('initialized', {});
    this.initialized = true;
    return result;
  }

  async startThread(params: Record<string, unknown> = {}): Promise<CodexThreadStartResult> {
    await this.ensureInitialized();
    return this.request<CodexThreadStartResult>('thread/start', params);
  }

  async listThreads(params: CodexThreadListParams = {}): Promise<CodexThreadListResult> {
    await this.ensureInitialized();
    return this.request<CodexThreadListResult>('thread/list', params);
  }

  async readThread(params: CodexThreadReadParams): Promise<CodexThreadReadResult> {
    await this.ensureInitialized();
    return this.request<CodexThreadReadResult>('thread/read', params);
  }

  async listThreadTurns(params: CodexPageParams): Promise<CodexTurnListResult> {
    await this.ensureInitialized();
    return this.request<CodexTurnListResult>('thread/turns/list', params);
  }

  async listThreadItems(params: CodexItemListParams): Promise<CodexItemListResult> {
    await this.ensureInitialized();
    return this.request<CodexItemListResult>('thread/items/list', params);
  }

  async startTurn(params: CodexTurnStartParams): Promise<CodexTurnStartResult> {
    await this.ensureInitialized();
    return this.request<CodexTurnStartResult>('turn/start', params);
  }

  async startTextTurn(threadId: string, text: string): Promise<CodexTurnStartResult> {
    const input: readonly CodexTurnInputPart[] = [{ type: 'text', text }];
    return this.startTurn({ threadId, input });
  }

  async healthCheck(): Promise<boolean> {
    const url = new URL(this.config.appServerUrl);
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = '/healthz';
    url.search = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.healthTimeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.initialize();
  }

  private request<TResult>(method: string, params?: unknown): Promise<TResult> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new CodexAppServerError('Codex App Server is not connected'));
    }

    const id = this.nextId++;
    const payload = params === undefined ? { method, id } : { method, id, params };
    return new Promise<TResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexAppServerError(`Codex App Server request timed out: ${method}`));
      }, this.config.requestTimeoutMs);
      timeout.unref?.();
      this.pending.set(id, {
        method,
        resolve: (value) => resolve(value as TResult),
        reject,
        timeout,
      });
      socket.send(JSON.stringify(payload), (error) => {
        if (!error) return;
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private notify(method: string, params?: unknown): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new CodexAppServerError('Codex App Server is not connected');
    }
    socket.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  private handleMessage(data: WebSocket.RawData): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (parsed === null || typeof parsed !== 'object') return;
    const message = parsed as Record<string, unknown>;
    if ('id' in message) {
      this.handleResponse(message as unknown as CodexJsonRpcResponse);
      return;
    }
    if (typeof message.method === 'string') {
      const notification = message as unknown as CodexAppServerNotification;
      for (const listener of this.notificationListeners) listener(notification);
    }
  }

  private handleResponse(response: CodexJsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(CodexAppServerError.fromRpcError(response.error));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
