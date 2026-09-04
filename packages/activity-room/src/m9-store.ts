/**
 * ARX-015 M9: Idempotent Activity Store
 *
 * Durable Activity Store with:
 * - Idempotent ingestion (same eventId → exactly one ActivityRecord)
 * - Deterministic ordering (monotonic sequence number)
 * - Cursor-based pagination and replay
 * - M1/M2 canonical lineage carried on every record
 * - Rebuild from durable facts
 *
 * This is the substrate for the Activity Room. It is a projection layer,
 * never an orchestration authority.
 */

import type {
  ActivityCursor,
  ActivityEvent,
  ActivityRecord,
  ActivityRecordId,
  M9ActivityStore as IActivityStore,
  M9ActivityQuery,
} from './m9-types';

// ─── In-Memory Implementation ──────────────────────────────

/**
 * In-memory Activity Store with idempotent ingestion.
 * For production, replace with SQLite-backed implementation.
 */
export class IdempotentActivityStore implements IActivityStore {
  private readonly byEventId = new Map<string, ActivityRecord>();
  private readonly byActivityId = new Map<string, ActivityRecord>();
  private readonly records: ActivityRecord[] = [];
  private sequenceCounter = 0;

  async append(event: ActivityEvent): Promise<ActivityRecord> {
    // Idempotency: same eventId returns existing record
    const existing = this.byEventId.get(event.eventId);
    if (existing) return existing;

    // Assign monotonic sequence number
    const sequenceNumber = ++this.sequenceCounter;

    const record: ActivityRecord = {
      activityId: `act-${sequenceNumber}-${event.eventId.slice(0, 8)}` as ActivityRecordId,
      eventId: event.eventId,
      sequenceNumber,
      type: event.type,
      timestamp: event.timestamp,
      executionId: event.executionId,
      traceId: event.traceId,
      requestId: event.requestId,
      workflowRunId: event.workflowRunId,
      taskId: event.taskId,
      agentAssignmentId: event.agentAssignmentId,
      repositoryBindingId: event.repositoryBindingId,
      runtimeSessionBindingId: event.runtimeSessionBindingId,
      aiBindingId: event.aiBindingId,
      actor: event.actor,
      actorId: event.actorId,
      source: event.source,
      payload: event.payload,
      visibility: event.visibility ?? 'all',
    };

    this.byEventId.set(event.eventId, record);
    this.byActivityId.set(record.activityId, record);
    this.records.push(record);

    return record;
  }

  async query(q: M9ActivityQuery): Promise<readonly ActivityRecord[]> {
    let results = this.records.filter((r) => matchesQuery(r, q));

    // Sort by deterministic order: sequence number
    results.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    // Apply limit
    if (q.limit !== undefined && q.limit >= 0) {
      results = results.slice(0, q.limit);
    }

    return results;
  }

  async getAfter(cursor: ActivityCursor): Promise<readonly ActivityRecord[]> {
    return this.records
      .filter((r) => r.sequenceNumber > cursor.sequenceNumber)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  async getByEventId(eventId: string): Promise<ActivityRecord | undefined> {
    return this.byEventId.get(eventId);
  }

  async replay(from?: ActivityCursor, to?: ActivityCursor): Promise<readonly ActivityRecord[]> {
    let results = this.records;

    if (from) {
      results = results.filter((r) => r.sequenceNumber > from.sequenceNumber);
    }
    if (to) {
      results = results.filter((r) => r.sequenceNumber <= to.sequenceNumber);
    }

    return results.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  async rebuild(): Promise<readonly ActivityRecord[]> {
    // Rebuild is simply returning all records in deterministic order
    return [...this.records].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  async getCursor(): Promise<ActivityCursor | null> {
    if (this.records.length === 0) return null;

    const last = this.records[this.records.length - 1];
    return {
      sequenceNumber: last.sequenceNumber,
      eventId: last.eventId,
      timestamp: last.timestamp,
    };
  }

  async lastSequence(): Promise<number> {
    if (this.records.length === 0) return 0;
    return this.records[this.records.length - 1].sequenceNumber;
  }

  /** Number of records in the store. */
  size(): number {
    return this.records.length;
  }
}

// ─── Query Matching ────────────────────────────────────────

function matchesQuery(record: ActivityRecord, q: M9ActivityQuery): boolean {
  if (q.workflowRunId !== undefined && record.workflowRunId !== q.workflowRunId) return false;
  if (q.executionId !== undefined && record.executionId !== q.executionId) return false;
  if (q.taskId !== undefined && record.taskId !== q.taskId) return false;
  if (q.actor !== undefined && record.actor.type !== q.actor) return false;
  if (q.actorId !== undefined && record.actorId !== q.actorId) return false;
  if (q.source !== undefined && record.source !== q.source) return false;

  // Type filter (supports single or array)
  if (q.type !== undefined) {
    if (Array.isArray(q.type)) {
      if (!q.type.includes(record.type)) return false;
    } else {
      if (record.type !== q.type) return false;
    }
  }

  // Cursor-based filtering
  if (q.after !== undefined) {
    if (record.sequenceNumber <= q.after.sequenceNumber) return false;
  }
  if (q.before !== undefined) {
    if (record.timestamp > q.before) return false;
  }
  if (q.afterTimestamp !== undefined) {
    if (record.timestamp <= q.afterTimestamp) return false;
  }

  return true;
}
