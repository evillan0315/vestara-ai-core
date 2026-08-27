/**
 * ARX-015 M9: Durable SQLite-backed Activity Store
 *
 * Persistence authority for the Activity Room. Records survive process restarts.
 * Deduplication by eventId is enforced at the database level, not just in-memory.
 * Monotonic sequence numbers are allocated from MAX(sequence)+1 in the database.
 *
 * This is the durable substrate. It is never an orchestration authority.
 */

import type {
  ActivityCursor,
  ActivityEvent,
  ActivityQuery,
  ActivityRecord,
  ActivityRecordId,
  ActivityStore as IActivityStore,
} from '@vestara/types';

/**
 * SQLite-backed Activity Store with durable persistence.
 * Uses sql.js Database interface for portability.
 */
export class SqliteActivityStore implements IActivityStore {
  private readonly db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS m9_activity_events (
        activity_id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        sequence_number INTEGER NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        execution_id TEXT,
        trace_id TEXT,
        request_id TEXT,
        workflow_run_id TEXT,
        task_id TEXT,
        agent_assignment_id TEXT,
        repository_binding_id TEXT,
        runtime_session_binding_id TEXT,
        ai_binding_id TEXT,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        actor_display_name TEXT NOT NULL,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        visibility TEXT NOT NULL DEFAULT 'all'
      );
      CREATE INDEX IF NOT EXISTS idx_m9_sequence ON m9_activity_events(sequence_number);
      CREATE INDEX IF NOT EXISTS idx_m9_event_id ON m9_activity_events(event_id);
      CREATE INDEX IF NOT EXISTS idx_m9_workflow_run ON m9_activity_events(workflow_run_id);
      CREATE INDEX IF NOT EXISTS idx_m9_execution ON m9_activity_events(execution_id);
      CREATE INDEX IF NOT EXISTS idx_m9_task ON m9_activity_events(task_id);
      CREATE INDEX IF NOT EXISTS idx_m9_type ON m9_activity_events(type);
      CREATE INDEX IF NOT EXISTS idx_m9_timestamp ON m9_activity_events(timestamp);
    `);
  }

  async append(event: ActivityEvent): Promise<ActivityRecord> {
    // Idempotency: same eventId returns existing record
    const existing = this.getByEventIdSync(event.eventId);
    if (existing) return existing;

    // Allocate monotonic sequence from database
    const sequenceNumber = this.allocateSequence();

    const activityId = `act-${sequenceNumber}-${event.eventId.slice(0, 8)}` as ActivityRecordId;

    const record: ActivityRecord = {
      activityId,
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

    this.insertRecord(record);
    return record;
  }

  async query(q: ActivityQuery): Promise<readonly ActivityRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (q.workflowRunId !== undefined) {
      conditions.push('workflow_run_id = ?');
      params.push(q.workflowRunId);
    }
    if (q.executionId !== undefined) {
      conditions.push('execution_id = ?');
      params.push(q.executionId);
    }
    if (q.taskId !== undefined) {
      conditions.push('task_id = ?');
      params.push(q.taskId);
    }
    if (q.actor !== undefined) {
      conditions.push('actor_type = ?');
      params.push(q.actor);
    }
    if (q.actorId !== undefined) {
      conditions.push('actor_id = ?');
      params.push(q.actorId);
    }
    if (q.source !== undefined) {
      conditions.push('source = ?');
      params.push(q.source);
    }
    if (q.type !== undefined) {
      if (Array.isArray(q.type)) {
        conditions.push(`type IN (${q.type.map(() => '?').join(',')})`);
        params.push(...q.type);
      } else {
        conditions.push('type = ?');
        params.push(q.type);
      }
    }
    if (q.after !== undefined) {
      conditions.push('sequence_number > ?');
      params.push(q.after.sequenceNumber);
    }
    if (q.before !== undefined) {
      conditions.push('timestamp <= ?');
      params.push(q.before);
    }
    if (q.afterTimestamp !== undefined) {
      conditions.push('timestamp > ?');
      params.push(q.afterTimestamp);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = q.limit !== undefined ? `LIMIT ${q.limit}` : '';

    const sql = `SELECT * FROM m9_activity_events ${where} ORDER BY sequence_number ASC ${limit}`;
    const rows = this.db.exec(sql, params)[0]?.values ?? [];

    return rows.map((row: unknown[]) => this.rowToRecord(row));
  }

  async getAfter(cursor: ActivityCursor): Promise<readonly ActivityRecord[]> {
    const rows =
      this.db.exec('SELECT * FROM m9_activity_events WHERE sequence_number > ? ORDER BY sequence_number ASC', [
        cursor.sequenceNumber,
      ])[0]?.values ?? [];

    return rows.map((row: unknown[]) => this.rowToRecord(row));
  }

  async getByEventId(eventId: string): Promise<ActivityRecord | undefined> {
    return this.getByEventIdSync(eventId);
  }

  async replay(from?: ActivityCursor, to?: ActivityCursor): Promise<readonly ActivityRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (from) {
      conditions.push('sequence_number > ?');
      params.push(from.sequenceNumber);
    }
    if (to) {
      conditions.push('sequence_number <= ?');
      params.push(to.sequenceNumber);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM m9_activity_events ${where} ORDER BY sequence_number ASC`;
    const rows = this.db.exec(sql, params)[0]?.values ?? [];

    return rows.map((row: unknown[]) => this.rowToRecord(row));
  }

  async rebuild(): Promise<readonly ActivityRecord[]> {
    // Rebuild returns all records in deterministic order.
    // Does NOT regenerate identity, sequencing, timestamps, or lineage.
    const rows = this.db.exec('SELECT * FROM m9_activity_events ORDER BY sequence_number ASC')[0]?.values ?? [];

    return rows.map((row: unknown[]) => this.rowToRecord(row));
  }

  async getCursor(): Promise<ActivityCursor | null> {
    const rows =
      this.db.exec(
        'SELECT event_id, sequence_number, timestamp FROM m9_activity_events ORDER BY sequence_number DESC LIMIT 1',
      )[0]?.values ?? [];

    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      eventId: String(row[0]),
      sequenceNumber: Number(row[1]),
      timestamp: String(row[2]),
    };
  }

  async lastSequence(): Promise<number> {
    const result = this.db.exec('SELECT COALESCE(MAX(sequence_number), 0) FROM m9_activity_events');
    return Number(result[0]?.values?.[0]?.[0] ?? 0);
  }

  // ─── Private Helpers ──────────────────────────────────────

  private allocateSequence(): number {
    const result = this.db.exec('SELECT COALESCE(MAX(sequence_number), 0) + 1 FROM m9_activity_events');
    return Number(result[0]?.values?.[0]?.[0] ?? 1);
  }

  private insertRecord(record: ActivityRecord): void {
    this.db.run(
      `INSERT INTO m9_activity_events (
        activity_id, event_id, sequence_number, type, timestamp,
        execution_id, trace_id, request_id, workflow_run_id, task_id,
        agent_assignment_id, repository_binding_id, runtime_session_binding_id,
        ai_binding_id, actor_type, actor_id, actor_display_name,
        source, payload_json, visibility
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.activityId,
        record.eventId,
        record.sequenceNumber,
        record.type,
        record.timestamp,
        record.executionId ?? null,
        record.traceId ?? null,
        record.requestId ?? null,
        record.workflowRunId ?? null,
        record.taskId ?? null,
        record.agentAssignmentId ?? null,
        record.repositoryBindingId ?? null,
        record.runtimeSessionBindingId ?? null,
        record.aiBindingId ?? null,
        record.actor.type,
        record.actor.id,
        record.actor.displayName,
        record.source,
        JSON.stringify(record.payload),
        record.visibility,
      ],
    );
  }

  private getByEventIdSync(eventId: string): ActivityRecord | undefined {
    const rows = this.db.exec('SELECT * FROM m9_activity_events WHERE event_id = ?', [eventId])[0]?.values ?? [];

    if (rows.length === 0) return undefined;
    return this.rowToRecord(rows[0]);
  }

  private rowToRecord(row: unknown[]): ActivityRecord {
    return {
      activityId: String(row[0]) as ActivityRecordId,
      eventId: String(row[1]),
      sequenceNumber: Number(row[2]),
      type: String(row[3]) as ActivityRecord['type'],
      timestamp: String(row[4]),
      executionId: row[5] != null ? (String(row[5]) as any) : undefined,
      traceId: row[6] != null ? (String(row[6]) as any) : undefined,
      requestId: row[7] != null ? (String(row[7]) as any) : undefined,
      workflowRunId: row[8] != null ? (String(row[8]) as any) : undefined,
      taskId: row[9] != null ? (String(row[9]) as any) : undefined,
      agentAssignmentId: row[10] != null ? String(row[10]) : undefined,
      repositoryBindingId: row[11] != null ? (String(row[11]) as any) : undefined,
      runtimeSessionBindingId: row[12] != null ? (String(row[12]) as any) : undefined,
      aiBindingId: row[13] != null ? (String(row[13]) as any) : undefined,
      actor: {
        type: String(row[14]) as any,
        id: row[15] != null ? String(row[15]) : '',
        displayName: String(row[16]),
      },
      actorId: row[15] != null ? String(row[15]) : undefined,
      source: String(row[17]) as ActivityRecord['source'],
      payload: JSON.parse(String(row[18])),
      visibility: String(row[19]) as ActivityRecord['visibility'],
    };
  }
}
