import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { inspectM9Schema, M9SchemaCompatibilityError, migrateM9Schema } from './m9-native-schema';
import type {
  ActivityCursor,
  ActivityEvent,
  ActivityRecord,
  ActivityRecordId,
  M9ActivityStore as IActivityStore,
  M9ActivityQuery,
} from './m9-types';

type Row = Record<string, unknown>;

export interface NativeM9StoreOptions {
  readonly busyTimeoutMs?: number;
  readonly onPersistenceError?: (error: unknown) => void;
}

export class M9StoreOpenError extends Error {
  readonly status: 'migration-required' | 'unsupported' | 'incompatible' | 'corrupt';
  readonly dbPath: string;

  constructor(
    status: 'migration-required' | 'unsupported' | 'incompatible' | 'corrupt',
    dbPath: string,
    message: string,
  ) {
    super(message);
    this.name = 'M9StoreOpenError';
    this.status = status;
    this.dbPath = dbPath;
  }
}

export class NativeSqliteActivityStore implements IActivityStore {
  private readonly busyTimeoutMs: number;

  constructor(
    private readonly db: DatabaseSync,
    options: NativeM9StoreOptions = {},
  ) {
    this.busyTimeoutMs = Math.max(1, Math.min(1000, Math.floor(options.busyTimeoutMs ?? 250)));
    try {
      db.exec(`PRAGMA busy_timeout = ${this.busyTimeoutMs}`);
      const inspection = inspectM9Schema(db);
      if (inspection.status !== 'current') {
        throw new M9SchemaCompatibilityError(inspection.status, inspection.reason);
      }
    } catch (error) {
      options.onPersistenceError?.(error);
      throw error;
    }
    this.onPersistenceError = options.onPersistenceError;
  }

  private readonly onPersistenceError?: (error: unknown) => void;

  static open(dbPath: string, options: NativeM9StoreOptions = {}): NativeSqliteActivityStore {
    const resolvedPath = path.resolve(dbPath);
    if (!existsSync(resolvedPath)) {
      throw new M9StoreOpenError(
        'migration-required',
        resolvedPath,
        'M9 database does not exist; explicit migration is required',
      );
    }
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(resolvedPath);
    } catch (error) {
      throw new M9StoreOpenError('corrupt', resolvedPath, `M9 database could not be opened: ${String(error)}`);
    }
    try {
      if (db === undefined) throw new M9StoreOpenError('corrupt', resolvedPath, 'M9 database handle was not opened');
      return new NativeSqliteActivityStore(db, options);
    } catch (error) {
      db.close();
      if (error instanceof M9SchemaCompatibilityError) {
        throw new M9StoreOpenError(error.status, resolvedPath, error.message);
      }
      throw error;
    }
  }

  /** Explicit migration authority. Normal store opening never calls this path. */
  static migrate(dbPath: string, options: NativeM9StoreOptions = {}): void {
    const resolvedPath = path.resolve(dbPath);
    mkdirSync(path.dirname(resolvedPath), { recursive: true });
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(resolvedPath);
      const busyTimeoutMs = Math.max(1, Math.min(1000, Math.floor(options.busyTimeoutMs ?? 250)));
      db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs}; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL`);
      migrateM9Schema(db);
    } catch (error) {
      options.onPersistenceError?.(error);
      throw error;
    } finally {
      try {
        db?.close();
      } catch {
        // Preserve the migration error.
      }
    }
  }

  close(): void {
    this.db.close();
  }

  async append(event: ActivityEvent): Promise<ActivityRecord> {
    return this.inTransaction(() => {
      const existing = this.db.prepare('SELECT * FROM m9_activity_events WHERE event_id = ?').get(event.eventId) as
        | Row
        | undefined;
      if (existing !== undefined) return this.rowToRecord(existing);

      const allocated = this.db
        .prepare(
          `UPDATE m9_sequence_allocator
           SET next_sequence = next_sequence + 1
           WHERE allocator_id = 1
           RETURNING next_sequence - 1 AS allocated_sequence`,
        )
        .get() as Row | undefined;
      if (allocated === undefined) throw new Error('M9 sequence allocator is not initialized');

      const sequenceNumber = Number(allocated.allocated_sequence);
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
        actorId: event.actorId ?? event.actor.id,
        source: event.source,
        payload: event.payload,
        visibility: event.visibility ?? 'all',
      };

      this.db
        .prepare(
          `INSERT INTO m9_activity_events (
            activity_id, event_id, sequence_number, type, timestamp,
            execution_id, trace_id, request_id, workflow_run_id, task_id,
            agent_assignment_id, repository_binding_id, runtime_session_binding_id,
            ai_binding_id, actor_type, actor_id, actor_display_name,
            source, payload_json, visibility
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
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
        );
      return record;
    });
  }

  async query(q: M9ActivityQuery): Promise<readonly ActivityRecord[]> {
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
      const types = Array.isArray(q.type) ? q.type : [q.type];
      conditions.push(`type IN (${types.map(() => '?').join(', ')})`);
      params.push(...types);
    }
    if (q.after !== undefined) {
      conditions.push('sequence_number > ?');
      params.push(q.after.sequenceNumber);
    }
    if (q.beforeSequence !== undefined) {
      conditions.push('sequence_number < ?');
      params.push(q.beforeSequence);
    }
    if (q.before !== undefined) {
      conditions.push('timestamp <= ?');
      params.push(q.before);
    }
    if (q.afterTimestamp !== undefined) {
      conditions.push('timestamp > ?');
      params.push(q.afterTimestamp);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const limit = q.limit !== undefined ? ' LIMIT ?' : '';
    if (q.limit !== undefined) params.push(q.limit);
    // AR-HISTORY-002: backward pagination must return the window immediately
    // preceding the cursor, not the globally oldest rows. Select newest-first
    // under the cursor, then restore canonical ascending order for the caller
    // (parity with the in-memory M9 store's slice(-limit) semantics).
    const backward = q.beforeSequence !== undefined;
    const order = backward ? 'DESC' : 'ASC';
    const records = this.rows(
      `SELECT * FROM m9_activity_events${where} ORDER BY sequence_number ${order}${limit}`,
      params,
    );
    return backward ? [...records].reverse() : records;
  }

  async getAfter(cursor: ActivityCursor): Promise<readonly ActivityRecord[]> {
    return this.rows('SELECT * FROM m9_activity_events WHERE sequence_number > ? ORDER BY sequence_number ASC', [
      cursor.sequenceNumber,
    ]);
  }

  async getByEventId(eventId: string): Promise<ActivityRecord | undefined> {
    const row = this.db.prepare('SELECT * FROM m9_activity_events WHERE event_id = ?').get(eventId) as Row | undefined;
    return row === undefined ? undefined : this.rowToRecord(row);
  }

  async getByActivityId(activityId: string): Promise<ActivityRecord | undefined> {
    const row = this.db.prepare('SELECT * FROM m9_activity_events WHERE activity_id = ?').get(activityId) as
      | Row
      | undefined;
    return row === undefined ? undefined : this.rowToRecord(row);
  }

  async replay(from?: ActivityCursor, to?: ActivityCursor): Promise<readonly ActivityRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (from !== undefined) {
      conditions.push('sequence_number > ?');
      params.push(from.sequenceNumber);
    }
    if (to !== undefined) {
      conditions.push('sequence_number <= ?');
      params.push(to.sequenceNumber);
    }
    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    return this.rows(`SELECT * FROM m9_activity_events${where} ORDER BY sequence_number ASC`, params);
  }

  async rebuild(): Promise<readonly ActivityRecord[]> {
    return this.rows('SELECT * FROM m9_activity_events ORDER BY sequence_number ASC');
  }

  async getCursor(): Promise<ActivityCursor | null> {
    const row = this.db
      .prepare(
        'SELECT event_id, sequence_number, timestamp FROM m9_activity_events ORDER BY sequence_number DESC LIMIT 1',
      )
      .get() as Row | undefined;
    return row === undefined
      ? null
      : {
          eventId: String(row.event_id),
          sequenceNumber: Number(row.sequence_number),
          timestamp: String(row.timestamp),
        };
  }

  async lastSequence(): Promise<number> {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sequence_number), 0) AS sequence_number FROM m9_activity_events')
      .get() as Row;
    return Number(row.sequence_number);
  }

  async retainNewest(limit: number): Promise<{
    readonly deletedCount: number;
    readonly retainedCount: number;
    readonly firstRetainedSequence: number | null;
    readonly lastRetainedSequence: number | null;
  }> {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Activity retention limit must be a positive integer');
    return this.inTransaction(() => {
      const count = Number((this.db.prepare('SELECT COUNT(*) AS count FROM m9_activity_events').get() as Row).count);
      const newest = this.db
        .prepare('SELECT sequence_number FROM m9_activity_events ORDER BY sequence_number DESC LIMIT ?')
        .get(limit) as Row | undefined;
      const oldestRetained = this.db
        .prepare('SELECT sequence_number FROM m9_activity_events ORDER BY sequence_number DESC LIMIT 1 OFFSET ?')
        .get(Math.max(0, limit - 1)) as Row | undefined;
      if (count <= limit) {
        return {
          deletedCount: 0,
          retainedCount: count,
          firstRetainedSequence: oldestRetained ? Number(oldestRetained.sequence_number) : null,
          lastRetainedSequence: newest ? Number(newest.sequence_number) : null,
        };
      }
      const cutoff = Number(oldestRetained?.sequence_number);
      const deletedCount = Number(
        (this.db.prepare('DELETE FROM m9_activity_events WHERE sequence_number < ?').run(cutoff) as { changes: number })
          .changes,
      );
      return {
        deletedCount,
        retainedCount: count - deletedCount,
        firstRetainedSequence: cutoff,
        lastRetainedSequence: Number(newest?.sequence_number),
      };
    });
  }

  private rows(sql: string, params: readonly unknown[] = []): readonly ActivityRecord[] {
    return this.db
      .prepare(sql)
      .all(...(params as never[]))
      .map((row) => this.rowToRecord(row as Row));
  }

  private inTransaction<T>(operation: () => T): T {
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* Preserve original error. */
      }
      this.onPersistenceError?.(error);
      throw error;
    }
  }

  private rowToRecord(row: Row): ActivityRecord {
    return {
      activityId: String(row.activity_id) as ActivityRecordId,
      eventId: String(row.event_id),
      sequenceNumber: Number(row.sequence_number),
      type: String(row.type) as ActivityRecord['type'],
      timestamp: String(row.timestamp),
      executionId: row.execution_id == null ? undefined : (String(row.execution_id) as ActivityRecord['executionId']),
      traceId: row.trace_id == null ? undefined : (String(row.trace_id) as ActivityRecord['traceId']),
      requestId: row.request_id == null ? undefined : (String(row.request_id) as ActivityRecord['requestId']),
      workflowRunId:
        row.workflow_run_id == null ? undefined : (String(row.workflow_run_id) as ActivityRecord['workflowRunId']),
      taskId: row.task_id == null ? undefined : (String(row.task_id) as ActivityRecord['taskId']),
      agentAssignmentId: row.agent_assignment_id == null ? undefined : String(row.agent_assignment_id),
      repositoryBindingId:
        row.repository_binding_id == null
          ? undefined
          : (String(row.repository_binding_id) as ActivityRecord['repositoryBindingId']),
      runtimeSessionBindingId:
        row.runtime_session_binding_id == null
          ? undefined
          : (String(row.runtime_session_binding_id) as ActivityRecord['runtimeSessionBindingId']),
      aiBindingId: row.ai_binding_id == null ? undefined : (String(row.ai_binding_id) as ActivityRecord['aiBindingId']),
      actor: {
        type: String(row.actor_type) as ActivityRecord['actor']['type'],
        id: row.actor_id == null ? '' : String(row.actor_id),
        displayName: String(row.actor_display_name),
      },
      actorId: row.actor_id == null ? undefined : String(row.actor_id),
      source: String(row.source) as ActivityRecord['source'],
      payload: JSON.parse(String(row.payload_json)) as ActivityRecord['payload'],
      visibility: String(row.visibility) as ActivityRecord['visibility'],
    };
  }
}
