/**
 * ARX-015 M11B — Production Activity Room Realtime Transport
 *
 * Realtime delivery boundary over frozen M9/M10/M11A contracts.
 * Authority flow: M8 → M9 → M10 → M11A/M11B → client
 *
 * M11B transports state. It does not become an activity store, workflow
 * authority, participant authority, or projection authority.
 *
 * Protocol (client → server):
 *   { op: 'subscribe', afterSequence: number }
 *   { op: 'ack', sequence: number }
 *   { op: 'ping' }
 *   { op: 'unsubscribe' }
 *
 * Protocol (server → client):
 *   { op: 'subscribed', cursor: ActivityCursor, frontier: number }
 *   { op: 'activity', sequence: number, activity: ProjectionActivityRecord }
 *   { op: 'catchup-complete', cursor: ActivityCursor }
 *   { op: 'resync-required', earliestAvailableSequence: number, latestSequence: number }
 *   { op: 'heartbeat' }
 *   { op: 'error', code: string, message: string }
 *   { op: 'unsubscribed' }
 */

import { randomUUID } from 'node:crypto';
import type * as http from 'node:http';
import {
  ActivityStreamConnection,
  ActivityStreamHub,
  type ActivityStreamMessage,
  type ActivityStreamSink,
  type ActivityRecord as ProjectionActivityRecord,
} from '@vestara/activity-projection';
import type { ActivityCursor, ActivityStore, ActivityRecord as M9ActivityRecord } from '@vestara/types';
import { type RawData, WebSocket, type WebSocketServer } from 'ws';
import { json } from '../http/response.js';
import type { M11ARoomState } from './activity-room-m11a.js';

// ─── M11B Protocol Messages ─────────────────────────────────────

/** Extended message type for M11B protocol (includes ActivityStreamMessage + protocol messages). */
type M11BMessage =
  | ActivityStreamMessage
  | { readonly op: 'subscribed'; readonly cursor: ActivityCursor; readonly frontier: number }
  | { readonly op: 'activity'; readonly sequence: number; readonly activity: ProjectionActivityRecord }
  | { readonly op: 'catchup-complete'; readonly cursor: ActivityCursor }
  | { readonly op: 'resync-required'; readonly earliestAvailableSequence: number; readonly latestSequence: number }
  | { readonly op: 'heartbeat' }
  | { readonly op: 'error'; readonly code: string; readonly message: string }
  | { readonly op: 'unsubscribed' }
  | { readonly op: 'pong' };

/** Extended sink for M11B protocol messages. */
interface M11BSink {
  readonly send: (message: M11BMessage) => void;
}

interface SubscriberState {
  connection: ActivityStreamConnection;
  ws: WebSocket;
  attachedId: string;
  subscribedAt: number;
  lastAckedSequence: number;
  awaitingCatchup: boolean;
  catchupCursor: number;
  cleanup: () => void;
}

// ─── Client Message Parsing ─────────────────────────────────────

type ClientMessage =
  | { op: 'subscribe'; afterSequence: number }
  | { op: 'ack'; sequence: number }
  | { op: 'ping' }
  | { op: 'unsubscribe' };

function parseClientMessage(data: RawData): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data.toString('utf8'));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const msg = parsed as Record<string, unknown>;

  if (msg.op === 'subscribe') {
    const afterSequence =
      typeof msg.afterSequence === 'number' && Number.isFinite(msg.afterSequence)
        ? Math.max(0, Math.floor(msg.afterSequence))
        : 0;
    return { op: 'subscribe', afterSequence };
  }

  if (msg.op === 'ack') {
    const sequence =
      typeof msg.sequence === 'number' && Number.isFinite(msg.sequence) ? Math.max(0, Math.floor(msg.sequence)) : -1;
    if (sequence < 0) return null;
    return { op: 'ack', sequence };
  }

  if (msg.op === 'ping') {
    return { op: 'ping' };
  }

  if (msg.op === 'unsubscribe') {
    return { op: 'unsubscribe' };
  }

  return null;
}

// ─── Server Message Helpers ─────────────────────────────────────

function wsSend(ws: WebSocket, data: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    const raw = JSON.stringify(data);
    ws.send(raw);
  } catch {
    // serialization failure - connection will be cleaned up on error
  }
}

function sendSubscribed(sink: M11BSink, cursor: ActivityCursor, frontier: number): void {
  sink.send({ op: 'subscribed', cursor, frontier });
}

function sendActivity(sink: M11BSink, sequence: number, activity: ProjectionActivityRecord): void {
  sink.send({ op: 'activity', sequence, activity });
}

function sendCatchupComplete(sink: M11BSink, cursor: ActivityCursor): void {
  sink.send({ op: 'catchup-complete', cursor });
}

function sendResyncRequired(sink: M11BSink, earliest: number, latest: number): void {
  sink.send({ op: 'resync-required', earliestAvailableSequence: earliest, latestSequence: latest });
}

function sendHeartbeat(sink: M11BSink): void {
  sink.send({ op: 'heartbeat' });
}

function sendError(sink: M11BSink, code: string, message: string): void {
  sink.send({ op: 'error', code, message });
}

function sendUnsubscribed(sink: M11BSink): void {
  sink.send({ op: 'unsubscribed' });
}

// ─── Projection ActivityRecord (for hub) ────────────────────────

/** Convert M9 ActivityRecord to Projection ActivityRecord for hub broadcasting. */
function toProjectionRecord(record: M9ActivityRecord): ProjectionActivityRecord {
  const kindMap: Record<string, ProjectionActivityRecord['kind']> = {
    'workflow.started': 'workflow',
    'workflow.completed': 'workflow',
    'workflow.failed': 'workflow',
    'workflow.cancelled': 'workflow',
    'task.runnable': 'task',
    'task.started': 'task',
    'task.completed': 'task',
    'task.failed': 'task',
    'task.cancelled': 'task',
    'agent.assigned': 'agent-message',
    'agent.started': 'agent-message',
    'agent.progress': 'agent-message',
    'agent.waiting': 'agent-message',
    'agent.completed': 'agent-message',
    'agent.failed': 'agent-message',
    'agent.cancelled': 'agent-message',
    'human.message': 'agent-message',
    'system.event': 'workflow',
  };

  return {
    id: String(record.activityId),
    sequence: record.sequenceNumber,
    timestamp: record.timestamp,
    actor: {
      type: record.actor.type,
      id: record.actor.id,
      displayName: record.actor.displayName,
      ...(record.actorId ? { role: record.actorId } : {}),
    },
    kind: kindMap[record.type] ?? 'workflow',
    agentId: record.actor.type === 'agent' ? record.actor.id : undefined,
    messageKind: 'message',
    content: record.payload?.message ?? '',
    workflowId: record.workflowRunId,
    sessionId: undefined,
    evidenceRefs: [],
    ...(record.payload?.error ? { effect: 'intervention' as const } : {}),
    ...(record.payload?.output ? { output: record.payload.output } : {}),
  } as ProjectionActivityRecord;
}

// ─── M11B Transport Class ───────────────────────────────────────

/**
 * M11B Realtime Transport.
 * Handles WebSocket connections for the Activity Room realtime stream.
 */
export class M11BTransport {
  private readonly config: M11BTransportConfig;
  private readonly subscribers = new Map<string, SubscriberState>();
  private wss: WebSocketServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: M11BTransportConfig) {
    this.config = config;
  }

  /** Attach to an existing WebSocketServer instance. */
  attach(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
      this.handleConnection(ws, req);
    });
  }

  /** Start the heartbeat interval. */
  startHeartbeat(): void {
    if (this.heartbeatInterval) return;
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.heartbeatIntervalMs);
    this.heartbeatInterval.unref?.();
  }

  /** Stop the heartbeat interval. */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /** Send heartbeat to all connected subscribers. */
  private sendHeartbeats(): void {
    for (const [id, state] of this.subscribers) {
      if (state.connection.closed) {
        this.cleanupSubscriber(id);
        continue;
      }
      // Use M11B sink wrapper
      const m11bSink: M11BSink = {
        send: (message: M11BMessage) => {
          if (state.ws.readyState === WebSocket.OPEN) {
            try {
              state.ws.send(JSON.stringify(message));
            } catch {
              // serialization failure
            }
          }
        },
      };
      sendHeartbeat(m11bSink);
    }
  }

  /** Handle a new WebSocket connection. */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const connectionId = `m11b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let subscriber: SubscriberState | null = null;

    console.log(`[M11B] Connection ${connectionId} from ${req.socket.remoteAddress}`);

    ws.on('message', async (data: RawData) => {
      const msg = parseClientMessage(data);
      if (!msg) {
        wsSend(ws, { op: 'error', code: 'invalid-message', message: 'Invalid message format' });
        return;
      }

      switch (msg.op) {
        case 'subscribe':
          await this.handleSubscribe(connectionId, ws, msg.afterSequence);
          break;

        case 'ack':
          if (subscriber) {
            this.handleAck(subscriber, msg.sequence);
          }
          break;

        case 'ping':
          wsSend(ws, { op: 'pong' });
          break;

        case 'unsubscribe': {
          if (subscriber) {
            this.cleanupSubscriber(connectionId);
            // Create M11B sink for unsubscribed
            const m11bSink: M11BSink = {
              send: (message: M11BMessage) => {
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.send(JSON.stringify(message));
                  } catch {
                    // serialization failure
                  }
                }
              },
            };
            sendUnsubscribed(m11bSink);
          }
          break;
        }

        default:
          wsSend(ws, { op: 'error', code: 'unknown-op', message: `Unknown operation: ${(msg as any).op}` });
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[M11B] Connection ${connectionId} closed: ${code} ${reason.toString().slice(0, 100)}`);
      if (subscriber) {
        this.cleanupSubscriber(connectionId);
      }
    });

    ws.on('error', (err: Error) => {
      console.error(`[M11B] Connection ${connectionId} error:`, err);
      if (subscriber) {
        this.cleanupSubscriber(connectionId);
      }
    });

    // Store subscriber reference for cleanup
    subscriber = {
      connection: null as any, // Will be set in handleSubscribe
      ws,
      attachedId: '',
      subscribedAt: Date.now(),
      lastAckedSequence: -1,
      awaitingCatchup: false,
      catchupCursor: 0,
      cleanup: () => this.cleanupSubscriber(connectionId),
    };
  }

  /** Handle subscription request with cursor-based catch-up. */
  private async handleSubscribe(connectionId: string, ws: WebSocket, afterSequence: number): Promise<void> {
    const room = this.config.room;
    const hub = room.hub;

    // Create M11B sink wrapper that handles both ActivityStreamMessage and M11B protocol messages
    const m11bSink: M11BSink = {
      send: (message: M11BMessage) => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify(message));
          } catch {
            // serialization failure
          }
        }
      },
    };

    // Check if already subscribed
    if (this.subscribers.has(connectionId)) {
      sendError(m11bSink, 'already-subscribed', 'Already subscribed');
      return;
    }

    // CRITICAL RACE HANDLING:
    // 1. Client has snapshot at cursor C (from M11A /snapshot)
    // 2. Before WebSocket subscription completes, activity C+1 is appended
    // 3. We must deliver C+1 exactly once through catch-up/live handoff
    //
    // Solution: Attach to hub at the TRUE latest frontier FIRST (so live
    // delivery captures everything), then replay history up to that frontier.
    // The hub will deliver in-order from the checkpoint, so no gaps/duplicates.

    // Get the true latest frontier from M9 store
    let frontier = afterSequence;
    try {
      frontier = await room.store.lastSequence();
    } catch {
      // Fall back to subscriber's checkpoint
    }

    // Create the subscriber state
    const attachedId = `m11b-sub-${connectionId}`;
    const connection = new ActivityStreamConnection({
      id: attachedId,
      sink: { send: (msg: any) => m11bSink.send(msg) },
      afterSequence,
      bufferCapacity: this.config.bufferCapacity,
      onResync: (conn) => this.handleResync(connectionId, conn),
    });

    const subscriber: SubscriberState = {
      connection,
      ws,
      attachedId,
      subscribedAt: Date.now(),
      lastAckedSequence: afterSequence,
      awaitingCatchup: true,
      catchupCursor: afterSequence,
      cleanup: () => this.cleanupSubscriber(connectionId),
    };

    this.subscribers.set(connectionId, subscriber);

    // Attach to hub at the TRUE frontier (captures live events during catch-up)
    // The connection's checkpoint is afterSequence, so it will only deliver
    // records > afterSequence. Live records arriving during catch-up will be
    // buffered by the connection and flushed in order.
    hub.attach(attachedId, { send: (msg: any) => m11bSink.send(msg) }, frontier);

    // Send subscribed confirmation with cursor and frontier
    const cursor: ActivityCursor = {
      sequenceNumber: afterSequence,
      eventId: '',
      timestamp: '',
    };
    sendSubscribed(m11bSink, cursor, frontier);

    // Now replay missed history up to the frontier
    // The connection will deliver records in order (checkpoint = afterSequence)
    // and buffer any out-of-order live records
    try {
      let cursor = afterSequence;
      const MAX_PAGE_SIZE = 1000;

      for (;;) {
        if (ws.readyState !== WebSocket.OPEN) return;

        const page = await room.store.query({
          after: { sequenceNumber: cursor, eventId: '', timestamp: '' },
          limit: MAX_PAGE_SIZE,
        });

        if (page.length === 0) break;

        for (const record of page) {
          if (ws.readyState !== WebSocket.OPEN) return;
          // Deliver through connection (enforces ordering, dedup, buffering)
          const result = connection.deliver(toProjectionRecord(record));
          if (result === 'resync') {
            // Buffer overflow - send resync and detach
            sendResyncRequired(m11bSink, hub.earliest, hub.latest);
            this.cleanupSubscriber(connectionId);
            return;
          }
        }

        const nextCursor = page[page.length - 1].sequenceNumber;
        if (nextCursor === cursor) break;
        cursor = nextCursor;
        subscriber.catchupCursor = cursor;
      }

      // Catch-up complete
      if (ws.readyState === WebSocket.OPEN) {
        subscriber.awaitingCatchup = false;
        const finalCursor: ActivityCursor = {
          sequenceNumber: subscriber.catchupCursor,
          eventId: '',
          timestamp: '',
        };
        sendCatchupComplete(m11bSink, finalCursor);
        console.log(`[M11B] Subscriber ${connectionId} catch-up complete to ${subscriber.catchupCursor}`);
      }
    } catch (error) {
      console.error(`[M11B] Catch-up failed for ${connectionId}:`, error);
      sendError(m11bSink, 'catchup-failed', 'Failed to replay history');
      this.cleanupSubscriber(connectionId);
    }
  }

  /** Handle ack from client (optional - for explicit delivery confirmation). */
  private handleAck(subscriber: SubscriberState, sequence: number): void {
    if (sequence > subscriber.lastAckedSequence) {
      subscriber.lastAckedSequence = sequence;
    }
  }

  /** Handle resync required (buffer overflow). */
  private handleResync(connectionId: string, conn: ActivityStreamConnection): void {
    const subscriber = this.subscribers.get(connectionId);
    if (!subscriber) return;

    // Create M11B sink for this subscriber
    const m11bSink: M11BSink = {
      send: (message: M11BMessage) => {
        if (subscriber.ws.readyState === WebSocket.OPEN) {
          try {
            subscriber.ws.send(JSON.stringify(message));
          } catch {
            // serialization failure
          }
        }
      },
    };

    sendResyncRequired(m11bSink, this.config.room.hub.earliest, this.config.room.hub.latest);
    this.cleanupSubscriber(connectionId);
  }

  /** Clean up a subscriber. */
  private cleanupSubscriber(connectionId: string): void {
    const subscriber = this.subscribers.get(connectionId);
    if (!subscriber) return;

    this.config.room.hub.detach(subscriber.attachedId);
    this.subscribers.delete(connectionId);
    console.log(`[M11B] Cleaned up subscriber ${connectionId}`);
  }

  /** Broadcast a new ActivityRecord to all subscribers. */
  broadcastActivity(record: M9ActivityRecord): void {
    this.config.room.hub.broadcast(toProjectionRecord(record));
  }

  /** Get active subscriber count. */
  getSubscriberCount(): number {
    return this.subscribers.size;
  }
}

/**
 * Create and attach M11B transport to the M11A room.
 */
export function createM11BTransport(config: M11BTransportConfig): M11BTransport {
  return new M11BTransport(config);
}

export interface M11BTransportConfig {
  room: M11ARoomState;
  /** Path for WebSocket upgrade (e.g., '/ws/activity-room/v1') */
  path: string;
  /** Maximum payload size in bytes */
  maxPayload: number;
  /** Heartbeat interval in ms */
  heartbeatIntervalMs: number;
  /** Buffer capacity per connection (matches hub default) */
  bufferCapacity: number;
}
