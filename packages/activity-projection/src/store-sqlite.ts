import type { ActivityRecord } from './contracts';
import { type ActivitySeverity, severityOf } from './severity';
import { type ActivityPage, type ActivityQuery, type ActivityStore, DuplicateActivityError } from './store';

/**
 * SQLite-backed activity store. Satisfies the same append-only contract as the
 * in-memory store but persists every record, so the Activity Room reconstructs
 * its state after a refresh or restart. Records are stored as JSON payloads in
 * `activity_events` and reloaded in sequence order on boot.
 */
export class SqliteActivityStore implements ActivityStore {
  private readonly persist?: () => void;

  constructor(
    private readonly db: any,
    options: { persist?: () => void } = {},
  ) {
    this.persist = options.persist;
  }

  async append(record: ActivityRecord): Promise<void> {
    const existing = this.db.exec('SELECT 1 FROM activity_events WHERE id = ?', [record.id])[0]?.values?.length ?? 0;
    if (existing > 0) throw new DuplicateActivityError(record.id);
    this.db.run('INSERT INTO activity_events (id, sequence, kind, payload_json) VALUES (?, ?, ?, ?)', [
      record.id,
      record.sequence,
      record.kind,
      JSON.stringify(record),
    ]);
    this.persist?.();
  }

  async get(id: string): Promise<ActivityRecord | null> {
    const row = this.db.exec('SELECT payload_json FROM activity_events WHERE id = ?', [id])[0]?.values?.[0]?.[0];
    return row === undefined || row === null ? null : (JSON.parse(String(row)) as ActivityRecord);
  }

  async lastSequence(): Promise<number> {
    const value = this.db.exec('SELECT COALESCE(MAX(sequence), 0) FROM activity_events')[0]?.values?.[0]?.[0];
    return Number(value ?? 0);
  }

  async list(query: ActivityQuery = {}): Promise<ActivityPage> {
    const rows = this.db.exec('SELECT payload_json FROM activity_events ORDER BY sequence, id')[0]?.values ?? [];
    const records = (rows as unknown[][]).map((row) => JSON.parse(String(row[0])) as ActivityRecord);
    const matches = records.filter((record) => matchesQuery(record, query));
    // beforeSequence = backward cursor pagination (latest N below the cursor).
    const limited =
      query.limit !== undefined && query.limit >= 0
        ? query.beforeSequence !== undefined
          ? matches.slice(-query.limit)
          : matches.slice(0, query.limit)
        : matches;
    const last = limited.at(-1);
    return {
      records: limited,
      nextSequence: last !== undefined ? last.sequence + 1 : undefined,
    };
  }

  size(): number {
    return Number(this.db.exec('SELECT COUNT(*) FROM activity_events')[0]?.values?.[0]?.[0] ?? 0);
  }
}

function matchesQuery(record: ActivityRecord, query: ActivityQuery): boolean {
  if (query.workflowId !== undefined && record.workflowId !== query.workflowId) return false;
  if (query.sessionId !== undefined && record.sessionId !== query.sessionId) return false;
  if (query.taskId !== undefined && record.taskId !== query.taskId) return false;
  if (query.kind !== undefined && record.kind !== query.kind) return false;
  if (query.severity !== undefined && (severityOf(record) as ActivitySeverity) !== query.severity) return false;
  if (query.agentId !== undefined && !matchesAgent(record, query.agentId)) return false;
  if (query.afterSequence !== undefined && record.sequence <= query.afterSequence) return false;
  if (query.beforeSequence !== undefined && record.sequence >= query.beforeSequence) return false;
  return true;
}

function matchesAgent(record: ActivityRecord, agentId: string): boolean {
  if (record.actor.id === agentId) return true;
  if (record.kind === 'agent-message' && record.agentId === agentId) return true;
  return false;
}
