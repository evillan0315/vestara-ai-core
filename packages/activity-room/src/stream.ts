import type { ActivityRecord } from './contracts';

/**
 * Transport contract for the activity stream (AAR-001B).
 *
 * The WebSocket stream is a delivery mechanism, never the source of truth.
 * Persisted history is authoritative. On reconnect a client recovers from its
 * checkpoint through the history API, then re-attaches for live delivery from
 * the same sequence boundary.
 */
export type ActivityStreamMessage =
  | {
      readonly type: 'activity.appended';
      readonly sequence: number;
      readonly activity: ActivityRecord;
    }
  | {
      readonly type: 'activity.resync-required';
      readonly earliestAvailableSequence: number;
      readonly latestSequence: number;
    };

/** A message sink for one connected client. Must never throw or block. */
export interface ActivityStreamSink {
  readonly send: (message: ActivityStreamMessage) => void;
}

export type ActivityDeliveryResult = 'delivered' | 'duplicate' | 'held' | 'resync';

export interface ActivityStreamConnectionOptions {
  readonly id: string;
  readonly sink: ActivityStreamSink;
  /** Highest sequence already delivered (e.g. recovered from history). */
  readonly afterSequence?: number;
  /** Bounded out-of-order buffer; overflow forces a resync directive. */
  readonly bufferCapacity?: number;
  readonly onResync: (connection: ActivityStreamConnection) => void;
}

/**
 * One client connection. Enforces exactly-once, in-order delivery from its
 * checkpoint, holds out-of-order records until their gap closes, and requests
 * a resync (via the hub) when the bounded buffer overflows. Delivery is fully
 * synchronous so slow or disconnected clients never block the writer.
 */
export class ActivityStreamConnection implements ActivityStreamSink {
  readonly id: string;
  private readonly sink: ActivityStreamSink;
  private readonly capacity: number;
  private readonly onResync: (connection: ActivityStreamConnection) => void;
  private checkpoint: number;
  private pending: ActivityRecord[] = [];
  private resyncRequested = false;
  private closedFlag = false;

  constructor(options: ActivityStreamConnectionOptions) {
    this.id = options.id;
    this.sink = options.sink;
    this.capacity = Math.max(1, options.bufferCapacity ?? 128);
    this.checkpoint = Math.max(0, options.afterSequence ?? 0);
    this.onResync = options.onResync;
  }

  /** Highest sequence delivered in order to this connection. */
  get lastDeliveredSequence(): number {
    return this.checkpoint;
  }

  get needsResync(): boolean {
    return this.resyncRequested;
  }

  get closed(): boolean {
    return this.closedFlag;
  }

  send(message: ActivityStreamMessage): void {
    if (!this.closedFlag) this.sink.send(message);
  }

  close(): void {
    this.closedFlag = true;
    this.pending = [];
  }

  /** Deliver one persisted record in stream order. */
  deliver(record: ActivityRecord): ActivityDeliveryResult {
    if (this.closedFlag) return 'duplicate';
    if (record.sequence <= this.checkpoint) return 'duplicate';
    if (record.sequence === this.checkpoint + 1) {
      this.emit(record);
      this.flush();
      return this.resyncRequested ? 'resync' : 'delivered';
    }
    // Gap in sequence: hold until the missing records arrive.
    this.pending.push(record);
    if (this.pending.length > this.capacity) {
      this.requestResync();
      return 'resync';
    }
    return 'held';
  }

  private emit(record: ActivityRecord): void {
    this.sink.send({ type: 'activity.appended', sequence: record.sequence, activity: record });
    this.checkpoint = record.sequence;
  }

  private flush(): void {
    while (this.pending.length > 0 && this.pending[0]?.sequence === this.checkpoint + 1) {
      const next = this.pending.shift();
      if (next !== undefined) this.emit(next);
    }
  }

  private requestResync(): void {
    if (this.resyncRequested) return;
    this.resyncRequested = true;
    this.pending = [];
    this.onResync(this);
  }
}

export interface ActivityStreamHubOptions {
  /** Oldest sequence still available for history recovery (retention boundary). */
  readonly earliestAvailableSequence?: number;
  /** Bounded buffer capacity per connection. */
  readonly bufferCapacity?: number;
}

/**
 * Broadcast hub for live activity delivery. `broadcast` must only be invoked
 * AFTER a record has been persisted; the hub itself never persists. A client
 * that falls behind or buffers past capacity receives a
 * `activity.resync-required` directive and is detached until it re-subscribes
 * from a fresh checkpoint.
 */
export class ActivityStreamHub {
  private readonly connections = new Map<string, ActivityStreamConnection>();
  private readonly earliestAvailableSequence: number;
  private readonly bufferCapacity: number;
  private latestSequence = 0;

  constructor(options: ActivityStreamHubOptions = {}) {
    this.earliestAvailableSequence = Math.max(1, options.earliestAvailableSequence ?? 1);
    this.bufferCapacity = options.bufferCapacity ?? 128;
  }

  /** Attach (or re-attach) a client at its recovered checkpoint. */
  attach(id: string, sink: ActivityStreamSink, afterSequence = 0): ActivityStreamConnection {
    this.detach(id);
    const connection = new ActivityStreamConnection({
      id,
      sink,
      afterSequence,
      bufferCapacity: this.bufferCapacity,
      onResync: (connectionToResync) => this.handleResync(connectionToResync),
    });
    this.connections.set(id, connection);
    return connection;
  }

  detach(id: string): void {
    const connection = this.connections.get(id);
    if (connection !== undefined) connection.close();
    this.connections.delete(id);
  }

  isAttached(id: string): boolean {
    return this.connections.has(id);
  }

  /** Highest sequence delivered to a connection, or 0 when not attached. */
  checkpoint(id: string): number {
    return this.connections.get(id)?.lastDeliveredSequence ?? 0;
  }

  get latest(): number {
    return this.latestSequence;
  }

  get earliest(): number {
    return this.earliestAvailableSequence;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  /** Broadcast a persisted record to every attached connection, exactly once each. */
  broadcast(record: ActivityRecord): void {
    if (record.sequence > this.latestSequence) this.latestSequence = record.sequence;
    for (const connection of [...this.connections.values()]) {
      if (connection.deliver(record) === 'resync') {
        connection.send({
          type: 'activity.resync-required',
          earliestAvailableSequence: this.earliestAvailableSequence,
          latestSequence: this.latestSequence,
        });
        this.detach(connection.id);
      }
    }
  }

  private handleResync(connection: ActivityStreamConnection): void {
    connection.send({
      type: 'activity.resync-required',
      earliestAvailableSequence: this.earliestAvailableSequence,
      latestSequence: this.latestSequence,
    });
    this.detach(connection.id);
  }
}
