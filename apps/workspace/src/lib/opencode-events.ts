/**
 * OpenCode event-stream client (workspace → /api/opencode/events).
 *
 * Connects to the Vestara-normalized SSE endpoint, parses `opencode.*`
 * envelopes, reconnects with bounded exponential backoff, deduplicates by event
 * id, and exposes connection state. The UI filters by the normalized session
 * correlation field before updating session-local state.
 */

export type OpenCodeStreamStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed';

export interface OpenCodeStreamEnvelope {
  readonly id: string;
  readonly type: string;
  readonly timestamp: string;
  readonly payload?: {
    readonly upstreamId?: string;
    readonly type?: string;
    readonly category?: string;
    readonly sessionId?: string;
    readonly messageId?: string;
    readonly partId?: string;
    readonly delta?: string;
    readonly timestamp?: string;
    readonly payload?: Record<string, unknown>;
  };
}

export interface OpenCodeStreamHandlers {
  onEvent: (envelope: OpenCodeStreamEnvelope) => void;
  onStatus?: (status: OpenCodeStreamStatus) => void;
  onError?: (error: Error) => void;
}

export interface OpenCodeStreamClientOptions extends OpenCodeStreamHandlers {
  readonly url?: string;
  readonly baseReconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
}

const DEFAULT_URL = '/api/opencode/events';

export class OpenCodeStreamClient {
  private readonly url: string;
  private readonly handlers: OpenCodeStreamHandlers;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  private controller?: AbortController;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private closed = false;
  private status: OpenCodeStreamStatus = 'disconnected';
  private readonly seen = new Set<string>();

  constructor(options: OpenCodeStreamClientOptions) {
    this.url = options.url ?? DEFAULT_URL;
    this.handlers = options;
    this.baseDelayMs = options.baseReconnectDelayMs ?? 500;
    this.maxDelayMs = options.maxReconnectDelayMs ?? 10_000;
  }

  get currentStatus(): OpenCodeStreamStatus {
    return this.status;
  }

  open(): void {
    if (this.closed) return;
    this.setStatus('connecting');
    this.controller = new AbortController();
    void this.consume(this.controller.signal);
  }

  close(): void {
    this.closed = true;
    this.controller?.abort();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.setStatus('disconnected');
  }

  /** Reset the dedupe window after a successful reconnect. */
  clearDedupe(): void {
    this.seen.clear();
  }

  private setStatus(status: OpenCodeStreamStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  private async consume(signal: AbortSignal): Promise<void> {
    while (!this.closed && !signal.aborted) {
      try {
        const response = await fetch(this.url, { signal, headers: { Accept: 'text/event-stream' } });
        if (!response.ok || !response.body) {
          throw new Error(`OpenCode event stream HTTP ${response.status}`);
        }
        this.reconnectAttempts = 0;
        this.setStatus('connected');
        await this.readStream(response.body, signal);
        if (this.closed || signal.aborted) return;
        // Stream ended without an explicit close — schedule a reconnect.
        this.scheduleReconnect();
        return;
      } catch (error) {
        if (this.closed || signal.aborted) return;
        this.handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
        this.scheduleReconnect();
        return;
      }
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (!this.closed && !signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          this.dispatchFrame(frame);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private dispatchFrame(frame: string): void {
    const data = frame.split('\n').find((line) => line.startsWith('data:'));
    if (!data) return;
    const raw = data.slice(5).trim();
    if (!raw) return;
    try {
      const envelope = JSON.parse(raw) as OpenCodeStreamEnvelope;
      if (!envelope || typeof envelope !== 'object' || typeof envelope.id !== 'string') return;
      // Deduplicate repeated events (e.g. after reconnect overlapping frames).
      if (this.seen.has(envelope.id)) return;
      this.seen.add(envelope.id);
      // Bound the dedupe window to avoid unbounded growth.
      if (this.seen.size > 5000) {
        const oldest = this.seen.values().next().value;
        if (oldest !== undefined) this.seen.delete(oldest);
      }
      this.handlers.onEvent(envelope);
    } catch {
      // Malformed events must not terminate the stream.
      this.handlers.onError?.(new Error('Malformed OpenCode event frame'));
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(this.baseDelayMs * 2 ** Math.min(this.reconnectAttempts - 1, 6), this.maxDelayMs);
    this.setStatus('reconnecting');
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      if (this.closed) return;
      this.open();
    }, delay);
  }
}

/** Filter an envelope to events correlated to a session id. */
export function isEventForSession(envelope: OpenCodeStreamEnvelope, sessionId: string): boolean {
  const correlated = envelope.payload?.sessionId;
  if (correlated) return correlated === sessionId;
  // Non-session-scoped events (e.g. server.connected) are always relevant.
  const type = envelope.type;
  return type === 'opencode.server.connected' || type === 'opencode.server.error';
}
