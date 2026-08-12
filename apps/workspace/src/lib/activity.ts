import type {
  ActivityOrganizationalEffect,
  ActivityRecord,
  ActivitySeverity,
  ActivityStreamMessage,
  MessageTarget,
} from '@vestara/activity-projection';
import { resolveWsUrl } from './clientConfig';

// ─── History API ───────────────────────────────────────────────

export interface ActivityHistoryParams {
  workflowId?: string;
  sessionId?: string;
  taskId?: string;
  agentId?: string;
  kind?: ActivityRecord['kind'];
  severity?: ActivitySeverity;
  afterSequence?: number;
  beforeSequence?: number;
  limit?: number;
}

export interface ActivityHistoryResponse {
  records: ActivityRecord[];
  nextSequence?: number;
  firstSequence: number;
  lastSequence: number;
}

export async function fetchActivityHistory(params: ActivityHistoryParams = {}): Promise<ActivityHistoryResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const query = qs.toString();
  try {
    const res = await fetch(`/api/activity-room${query ? `?${query}` : ''}`);
    if (!res.ok) return { records: [], nextSequence: undefined, firstSequence: 0, lastSequence: 0 };
    const data = (await res.json()) as Partial<ActivityHistoryResponse>;
    return {
      records: data.records ?? [],
      nextSequence: data.nextSequence,
      firstSequence: data.firstSequence ?? 0,
      lastSequence: data.lastSequence ?? 0,
    };
  } catch {
    return { records: [], nextSequence: undefined, firstSequence: 0, lastSequence: 0 };
  }
}

// ─── Messaging API (AAR-001E) ─────────────────────────────────

export interface ActivityMessagePayload {
  workflowId?: string;
  sessionId?: string;
  content: string;
  targets: readonly MessageTarget[];
  referencedActivityIds?: readonly string[];
  effect?: ActivityOrganizationalEffect;
  correctionOf?: string;
  actor?: { displayName?: string; role?: string };
}

/** Sends a human message and resolves with the persisted, sequenced record. */
export async function postActivityMessage(payload: ActivityMessagePayload): Promise<ActivityRecord> {
  const res = await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data?.error?.message) detail = data.error.message;
    } catch {
      /* keep the HTTP detail */
    }
    throw new Error(detail);
  }
  const data = (await res.json()) as { record: ActivityRecord };
  return data.record;
}

// ─── Effective state (Direction 2) ─────────────────────────────

export interface EffectiveState {
  computedAt: string;
  corrections: Array<{
    originalId: string;
    correctedBy: string;
    latestCorrectionId: string;
    content: string;
    originalContent: string;
  }>;
  open: Array<{ id: string; effect: string; actor: string; content: string }>;
  units: Array<{
    workflowId?: string;
    sessionId?: string;
    latestEffect?: string;
    lastActivity: string;
    recordCount: number;
  }>;
  needsAttention: number;
}

/** Recomputes the effective state from the durable history (derived, never stored). */
export async function fetchEffectiveState(): Promise<EffectiveState> {
  const empty: EffectiveState = { computedAt: '', corrections: [], open: [], units: [], needsAttention: 0 };
  try {
    const res = await fetch('/api/activity-room/state');
    if (!res.ok) return empty;
    const data = (await res.json()) as Partial<EffectiveState>;
    if (!Array.isArray(data.corrections) || !Array.isArray(data.open) || !Array.isArray(data.units)) return empty;
    return {
      computedAt: typeof data.computedAt === 'string' ? data.computedAt : '',
      corrections: data.corrections,
      open: data.open,
      units: data.units,
      needsAttention: typeof data.needsAttention === 'number' ? data.needsAttention : data.open.length,
    };
  } catch {
    return empty;
  }
}

// ─── Visual Edit durability (VE milestone) ────────────────────

export async function fetchVisualConfig(): Promise<Record<string, { alignment?: string; density?: string; presentation?: string }>> {
  try {
    const res = await fetch('/api/visual-config');
    if (!res.ok) return {};
    const data = (await res.json()) as { overrides?: Record<string, unknown> };
    return (data.overrides as Record<string, { alignment?: string; density?: string; presentation?: string }>) ?? {};
  } catch {
    return {};
  }
}

export async function saveVisualConfig(
  overrides: Record<string, { alignment?: string; density?: string; presentation?: string }>,
): Promise<boolean> {
  try {
    const res = await fetch('/api/visual-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── WebSocket stream ──────────────────────────────────────────

export type ActivitySocketState = 'connecting' | 'live' | 'reconnecting' | 'offline';

type ActivityMessageListener = (message: ActivityStreamMessage) => void;
type ActivityStateListener = (state: ActivitySocketState) => void;

/**
 * Client for the `/ws/activity` stream. On connect it subscribes from the last
 * seen sequence; the server replays missed history from the persisted store, so
 * reconnect recovery is automatic and the listener deduplicates by id.
 */
class ActivitySocketClient {
  private ws: WebSocket | null = null;
  private state: ActivitySocketState = 'offline';
  private messageListeners = new Set<ActivityMessageListener>();
  private stateListeners = new Set<ActivityStateListener>();
  private reconnectTimer: number | null = null;
  private intentionalClose = false;
  private backoffMs = 1000;

  lastSequence = 0;

  connect(): void {
    this.intentionalClose = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const url = resolveWsUrl('/ws/activity');
    this.setState('connecting');
    try {
      this.ws = new WebSocket(url);
    } catch {
      this.setState('offline');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState('live');
      this.backoffMs = 1000;
      this.ws?.send(JSON.stringify({ op: 'activity-subscribe', afterSequence: this.lastSequence }));
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ActivityStreamMessage;
        for (const listener of this.messageListeners) listener(message);
      } catch {
        /* ignore malformed frames */
      }
    };

    this.ws.onerror = () => {
      this.setState('reconnecting');
    };

    this.ws.onclose = () => {
      this.ws = null;
      if (this.intentionalClose) {
        this.setState('offline');
      } else {
        this.setState('reconnecting');
        this.scheduleReconnect();
      }
    };
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setState('offline');
  }

  subscribe(afterSequence: number): void {
    this.lastSequence = Math.max(0, afterSequence);
    this.connect();
  }

  onMessage(listener: ActivityMessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onState(listener: ActivityStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  getState(): ActivitySocketState {
    return this.state;
  }

  private setState(state: ActivitySocketState): void {
    this.state = state;
    for (const listener of this.stateListeners) listener(state);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.backoffMs);
    this.backoffMs = Math.min(30_000, this.backoffMs * 2);
  }
}

/** Shared client instance (the Activity Room is a single-page surface). */
export const activitySocket = new ActivitySocketClient();
