/**
 * M11B Production Activity Room WebSocket Client
 *
 * Consumes frozen M11B WebSocket protocol. Read-only — no mutation.
 * Authority flow: M9 durable truth → M10 projection → M11B transport → this client → UI
 *
 * Lifecycle: HTTP snapshot → WS subscribe(C) → catch-up → LIVE → disconnect → RECONNECTING
 */

import type { ActivityCursor } from '@vestara/types';
import { resolveWsUrl } from './clientConfig';
import type { M11AActivityRecord } from './m11a-api';

// ─── Protocol Types ──────────────────────────────────────────

/** Client → Server messages */
export type M11BClientMessage =
  | { readonly op: 'subscribe'; readonly afterSequence: number }
  | { readonly op: 'ack'; readonly sequence: number }
  | { readonly op: 'ping' }
  | { readonly op: 'unsubscribe' };

/** Server → Client messages */
export type M11BServerMessage =
  | { readonly op: 'subscribed'; readonly cursor: ActivityCursor; readonly frontier: number }
  | { readonly op: 'activity'; readonly sequence: number; readonly activity: M11AActivityRecord }
  | { readonly op: 'catchup-complete'; readonly cursor: ActivityCursor }
  | { readonly op: 'resync-required'; readonly earliestAvailableSequence: number; readonly latestSequence: number }
  | { readonly op: 'heartbeat' }
  | { readonly op: 'error'; readonly code: string; readonly message: string }
  | { readonly op: 'unsubscribed' };

/** Connection state for the M11B WebSocket. */
export type M11BConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline';

// ─── Listener Types ──────────────────────────────────────────

type ActivityListener = (activity: M11AActivityRecord, sequence: number) => void;
type StateListener = (state: M11BConnectionState) => void;
type SubscribedListener = (cursor: ActivityCursor, frontier: number) => void;
type CatchupCompleteListener = (cursor: ActivityCursor) => void;
type ResyncListener = (earliestAvailableSequence: number, latestSequence: number) => void;
type ErrorListener = (code: string, message: string) => void;
type HeartbeatListener = () => void;

// ─── M11B Client ─────────────────────────────────────────────

/**
 * Client for the M11B Activity Room WebSocket.
 *
 * Handles:
 * - Connection lifecycle with auto-reconnect
 * - Subscribe/ack protocol
 * - Catch-up delivery
 * - Heartbeat response
 * - Resync directives
 * - Bounded backpressure (resync on buffer overflow)
 */
export class M11BClient {
  private ws: WebSocket | null = null;
  private state: M11BConnectionState = 'offline';
  private intentionalClose = false;
  private backoffMs = 1000;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastSequence = 0;

  // Listener sets
  private activityListeners = new Set<ActivityListener>();
  private stateListeners = new Set<StateListener>();
  private subscribedListeners = new Set<SubscribedListener>();
  private catchupCompleteListeners = new Set<CatchupCompleteListener>();
  private resyncListeners = new Set<ResyncListener>();
  private errorListeners = new Set<ErrorListener>();
  private heartbeatListeners = new Set<HeartbeatListener>();

  /** The afterSequence used in the last subscribe call. */
  get subscribedSequence(): number {
    return this.lastSequence;
  }

  /** Current connection state. */
  getState(): M11BConnectionState {
    return this.state;
  }

  // ─── Lifecycle ────────────────────────────────────────────

  /**
   * Connect and subscribe from a given sequence.
   * This is the primary entry point after HTTP snapshot.
   */
  connect(afterSequence: number): void {
    this.lastSequence = Math.max(0, afterSequence);
    this.intentionalClose = false;
    this._connect();
  }

  /**
   * Reconnect from the last known sequence.
   * Used after disconnect/reconnect lifecycle.
   */
  reconnect(): void {
    this.connect(this.lastSequence);
  }

  /**
   * Gracefully disconnect.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this._clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('offline');
  }

  // ─── Protocol Operations ──────────────────────────────────

  /** Send an ack for a received activity sequence. */
  ack(sequence: number): void {
    this.send({ op: 'ack', sequence });
  }

  /** Send a ping to verify connection liveness. */
  ping(): void {
    this.send({ op: 'ping' });
  }

  /** Send unsubscribe (before disconnect). */
  unsubscribe(): void {
    this.send({ op: 'unsubscribe' });
  }

  // ─── Listener Registration ────────────────────────────────

  onActivity(listener: ActivityListener): () => void {
    this.activityListeners.add(listener);
    return () => { this.activityListeners.delete(listener); };
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state); // Emit current state immediately
    return () => { this.stateListeners.delete(listener); };
  }

  onSubscribed(listener: SubscribedListener): () => void {
    this.subscribedListeners.add(listener);
    return () => { this.subscribedListeners.delete(listener); };
  }

  onCatchupComplete(listener: CatchupCompleteListener): () => void {
    this.catchupCompleteListeners.add(listener);
    return () => { this.catchupCompleteListeners.delete(listener); };
  }

  onResync(listener: ResyncListener): () => void {
    this.resyncListeners.add(listener);
    return () => { this.resyncListeners.delete(listener); };
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => { this.errorListeners.delete(listener); };
  }

  onHeartbeat(listener: HeartbeatListener): () => void {
    this.heartbeatListeners.add(listener);
    return () => { this.heartbeatListeners.delete(listener); };
  }

  // ─── Internal ─────────────────────────────────────────────

  private _connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setState('connecting');
    const url = resolveWsUrl('/ws/activity-room/v1');

    try {
      this.ws = new WebSocket(url);
    } catch {
      this.setState('offline');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoffMs = 1000;
      this.send({ op: 'subscribe', afterSequence: this.lastSequence });
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return; // Ignore malformed frames
      }

      if (!parsed || typeof parsed !== 'object') return;
      const msg = parsed as Record<string, unknown>;

      if (msg.op === 'subscribed') {
        const cursor = msg.cursor as ActivityCursor;
        const frontier = typeof msg.frontier === 'number' ? msg.frontier : 0;
        this.setState('live');
        for (const listener of this.subscribedListeners) listener(cursor, frontier);
        return;
      }

      if (msg.op === 'activity') {
        const activity = msg.activity as M11AActivityRecord;
        const sequence = typeof msg.sequence === 'number' ? msg.sequence : 0;
        if (sequence > this.lastSequence) this.lastSequence = sequence;
        for (const listener of this.activityListeners) listener(activity, sequence);
        return;
      }

      if (msg.op === 'catchup-complete') {
        const cursor = msg.cursor as ActivityCursor;
        for (const listener of this.catchupCompleteListeners) listener(cursor);
        return;
      }

      if (msg.op === 'resync-required') {
        const earliest = typeof msg.earliestAvailableSequence === 'number' ? msg.earliestAvailableSequence : 0;
        const latest = typeof msg.latestSequence === 'number' ? msg.latestSequence : 0;
        for (const listener of this.resyncListeners) listener(earliest, latest);
        return;
      }

      if (msg.op === 'heartbeat') {
        this.send({ op: 'ping' }); // Respond with pong
        for (const listener of this.heartbeatListeners) listener();
        return;
      }

      if (msg.op === 'error') {
        const code = typeof msg.code === 'string' ? msg.code : 'unknown';
        const message = typeof msg.message === 'string' ? msg.message : 'Unknown error';
        for (const listener of this.errorListeners) listener(code, message);
        return;
      }

      if (msg.op === 'unsubscribed') {
        // Server confirmed unsubscribe
        return;
      }
    };

    this.ws.onerror = () => {
      // Error will be followed by close
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.stopHeartbeat();
      if (this.intentionalClose) {
        this.setState('offline');
      } else {
        this.setState('reconnecting');
        this.scheduleReconnect();
      }
    };
  }

  private send(message: M11BClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch {
        // Serialization failure — will trigger close/error
      }
    }
  }

  private setState(state: M11BConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this._connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(30_000, this.backoffMs * 2);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      this.ping();
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _clearTimers(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
  }
}

/** Shared singleton for the Activity Room M11B client. */
export const m11bClient = new M11BClient();
