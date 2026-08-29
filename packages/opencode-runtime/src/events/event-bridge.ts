// OpenCodeEventBridge — a single persistent SSE subscription to the OpenCode
// headless server. Raw events are normalized (see event-types.ts) and published
// onto the EventBus as `opencode.*` envelopes. The bridge owns one upstream
// connection, coalesces high-frequency `message.part.delta` frames, and
// reconnects with bounded exponential backoff. Delivery to workspace clients
// (WebSocket/SSE) happens through EventBus subscribers.

import type { EventBus } from '@vestara/event-bus';
import type { OpenCodeClient } from '../client/opencode-client';
import type { OpenCodeRequestContext } from '../client/opencode-types';
import type { OpenCodePermissionRequest } from '../permissions/permission-types';
import { normalizePermissionRequest } from '../permissions/permission-types';
import type { OpenCodeBridgeConnectionState } from './event-types';
import { normalizeOpenCodeEvent } from './event-types';

export interface OpenCodeEventBridgeOptions {
  readonly client: OpenCodeClient;
  readonly eventBus: EventBus;
  readonly context: OpenCodeRequestContext;
  readonly reconnectDelayMs?: number;
  readonly maxReconnectDelayMs?: number;
  readonly onConnectionState?: (state: OpenCodeBridgeConnectionState) => void;
  readonly onPermissionRequest?: (request: OpenCodePermissionRequest) => void;
  readonly logger?: { warn?: (message: string, meta?: unknown) => void };
}

export interface OpenCodeEventBridgeMetrics {
  readonly connected: boolean;
  readonly connectionState: OpenCodeBridgeConnectionState;
  readonly receivedEvents: number;
  readonly publishedEvents: number;
  readonly droppedDeltas: number;
  readonly reconnectAttempts: number;
  readonly lastEventAt?: string;
}

interface DeltaSlot {
  readonly sessionId?: string;
  readonly messageId?: string;
  readonly partId?: string;
  text: string;
  lastActivity: number;
}

const DELTA_QUIET_MS = 80;

export class OpenCodeEventBridge {
  private readonly client: OpenCodeClient;
  private readonly eventBus: EventBus;
  private readonly context: OpenCodeRequestContext;
  private readonly options: OpenCodeEventBridgeOptions;
  private readonly reconnectBaseMs: number;
  private readonly maxReconnectMs: number;

  private controller?: AbortController;
  private running = false;
  private stopping = false;
  private connectionState: OpenCodeBridgeConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private receivedEvents = 0;
  private publishedEvents = 0;
  private droppedDeltas = 0;
  private lastEventAt?: string;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private flushTimer?: ReturnType<typeof setTimeout>;
  private readonly deltas = new Map<string, DeltaSlot>();

  constructor(options: OpenCodeEventBridgeOptions) {
    this.options = options;
    this.client = options.client;
    this.eventBus = options.eventBus;
    this.context = options.context;
    this.reconnectBaseMs = options.reconnectDelayMs ?? 250;
    this.maxReconnectMs = options.maxReconnectDelayMs ?? 10_000;
  }

  get connected(): boolean {
    return this.connectionState === 'connected';
  }

  get metrics(): OpenCodeEventBridgeMetrics {
    return {
      connected: this.connected,
      connectionState: this.connectionState,
      receivedEvents: this.receivedEvents,
      publishedEvents: this.publishedEvents,
      droppedDeltas: this.droppedDeltas,
      reconnectAttempts: this.reconnectAttempts,
      lastEventAt: this.lastEventAt,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    this.setConnectionState('connecting');
    this.controller = new AbortController();
    void this.consumeLoop(this.controller.signal);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.controller?.abort();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.deltas.clear();
    this.setConnectionState('disconnected');
    this.running = false;
  }

  private setConnectionState(state: OpenCodeBridgeConnectionState): void {
    this.connectionState = state;
    this.options.onConnectionState?.(state);
  }

  private async consumeLoop(signal: AbortSignal): Promise<void> {
    while (this.running && !this.stopping && !signal.aborted) {
      this.setConnectionState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
      try {
        const stream = this.client.openEventStream(this.context, signal);
        let sawEvent = false;
        for await (const raw of stream) {
          if (this.stopping || signal.aborted) break;
          if (!sawEvent) {
            sawEvent = true;
            this.reconnectAttempts = 0;
            this.setConnectionState('connected');
          }
          this.receivedEvents += 1;
          this.lastEventAt = new Date().toISOString();
          const normalized = normalizeOpenCodeEvent(raw);
          if (!normalized) continue;
          if (normalized.type === 'permission.asked' || normalized.type === 'permission.v2.asked') {
            const request = normalizePermissionRequest(normalized.payload);
            if (request) this.options.onPermissionRequest?.(request);
          }
          if (normalized.type === 'message.part.delta' && normalized.delta) {
            this.bufferDelta(normalized);
            continue;
          }
          this.flushDeltas();
          await this.publish(normalized);
        }
        // Stream ended (or aborted). If stopping, exit cleanly.
        if (this.stopping || signal.aborted) break;
        this.flushDeltas();
        this.scheduleReconnect();
        return;
      } catch (error) {
        this.options.logger?.warn?.('opencode event stream error', { error: String(error) });
        if (this.stopping || signal.aborted) break;
        this.flushDeltas();
        this.scheduleReconnect();
        return;
      }
    }
  }

  private bufferDelta(normalized: ReturnType<typeof normalizeOpenCodeEvent>): void {
    if (!normalized) return;
    const key = `${normalized.sessionId ?? '-'}|${normalized.messageId ?? '-'}|${normalized.partId ?? '-'}`;
    const existing = this.deltas.get(key);
    const now = Date.now();
    if (existing) {
      existing.text += normalized.delta ?? '';
      existing.lastActivity = now;
    } else {
      this.deltas.set(key, {
        sessionId: normalized.sessionId,
        messageId: normalized.messageId,
        partId: normalized.partId,
        text: normalized.delta ?? '',
        lastActivity: now,
      });
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        this.flushDeltas();
      }, DELTA_QUIET_MS);
    }
  }

  private flushDeltas(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.deltas.size === 0) return;
    const snapshot = [...this.deltas.values()];
    this.deltas.clear();
    for (const slot of snapshot) {
      if (slot.text.length === 0) continue;
      void this.publish({
        upstreamId: `delta-${slot.lastActivity}`,
        type: 'message.part.delta',
        category: 'message',
        sessionId: slot.sessionId,
        messageId: slot.messageId,
        partId: slot.partId,
        delta: slot.text,
        timestamp: new Date(slot.lastActivity).toISOString(),
        payload: { messageID: slot.messageId, partID: slot.partId, field: 'text', delta: slot.text },
      });
    }
  }

  private async publish(event: ReturnType<typeof normalizeOpenCodeEvent>): Promise<void> {
    if (!event) return;
    try {
      await this.eventBus.emit({
        type: `opencode.${event.type}`,
        version: 1,
        source: 'opencode-event-bridge',
        payload: event as unknown as Record<string, unknown>,
        // ARX-015 M2: sessionId is not an execution identity. OpenCode session events
        // without an explicit execution context remain uncorrelated (fail-closed).
        metadata: {},
      });
      this.publishedEvents += 1;
    } catch {
      this.droppedDeltas += 1;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    this.reconnectAttempts += 1;
    const delay = Math.min(this.reconnectBaseMs * 2 ** Math.min(this.reconnectAttempts - 1, 8), this.maxReconnectMs);
    this.setConnectionState('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.stopping) return;
      this.controller = new AbortController();
      void this.consumeLoop(this.controller.signal);
    }, delay);
  }
}
