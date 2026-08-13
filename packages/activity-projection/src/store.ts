import type { ActivityKind, ActivityRecord } from './contracts';
import { type ActivitySeverity, severityOf } from './severity';

export interface ActivityQuery {
  readonly workflowId?: string;
  readonly sessionId?: string;
  readonly taskId?: string;
  readonly agentId?: string;
  readonly kind?: ActivityKind;
  readonly severity?: ActivitySeverity;
  readonly afterSequence?: number;
  readonly beforeSequence?: number;
  readonly limit?: number;
}

export interface ActivityPage {
  readonly records: readonly ActivityRecord[];
  /** Sequence to resume from for the next page, when more records may exist. */
  readonly nextSequence?: number;
}

/** Thrown when an append collides with an existing record id (append-only contract). */
export class DuplicateActivityError extends Error {
  readonly id: string;

  constructor(id: string) {
    super(`Duplicate activity record: ${id}`);
    this.name = 'DuplicateActivityError';
    this.id = id;
  }
}

/**
 * Append-only activity persistence. Records are immutable once appended; a
 * lifecycle change is a new correlated record, never an update. Ordering is
 * deterministic: sequence, then timestamp, then id.
 */
export interface ActivityStore {
  append(record: ActivityRecord): Promise<void>;
  get(id: string): Promise<ActivityRecord | null>;
  list(query?: ActivityQuery): Promise<ActivityPage>;
  lastSequence(): Promise<number>;
}

/** In-memory activity store used by AAR-001A and by tests. */
export class InMemoryActivityStore implements ActivityStore {
  private readonly byId = new Map<string, ActivityRecord>();
  private readonly records: ActivityRecord[] = [];

  async append(record: ActivityRecord): Promise<void> {
    if (this.byId.has(record.id)) throw new DuplicateActivityError(record.id);
    const stored = cloneRecord(record);
    this.byId.set(record.id, stored);
    this.records.push(stored);
  }

  async get(id: string): Promise<ActivityRecord | null> {
    const record = this.byId.get(id);
    return record === undefined ? null : cloneRecord(record);
  }

  async lastSequence(): Promise<number> {
    let max = 0;
    for (const record of this.records) {
      if (record.sequence > max) max = record.sequence;
    }
    return max;
  }

  async list(query: ActivityQuery = {}): Promise<ActivityPage> {
    const matches = this.records.filter((record) => matchesQuery(record, query));
    matches.sort(compareRecords);
    // beforeSequence = backward cursor pagination: return the latest N below the
    // cursor (the page just before the oldest loaded), not the oldest N overall.
    const limited =
      query.limit !== undefined && query.limit >= 0
        ? query.beforeSequence !== undefined
          ? matches.slice(-query.limit)
          : matches.slice(0, query.limit)
        : matches;
    const last = limited.at(-1);
    return {
      records: limited.map(cloneRecord),
      nextSequence: last !== undefined ? last.sequence + 1 : undefined,
    };
  }

  size(): number {
    return this.records.length;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }
}

function cloneRecord(record: ActivityRecord): ActivityRecord {
  return structuredClone(record);
}

function matchesQuery(record: ActivityRecord, query: ActivityQuery): boolean {
  if (query.workflowId !== undefined && record.workflowId !== query.workflowId) return false;
  if (query.sessionId !== undefined && record.sessionId !== query.sessionId) return false;
  if (query.taskId !== undefined && record.taskId !== query.taskId) return false;
  if (query.kind !== undefined && record.kind !== query.kind) return false;
  if (query.severity !== undefined && severityOf(record) !== query.severity) return false;
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

/** Deterministic ordering: sequence first, then timestamp, then id. */
function compareRecords(left: ActivityRecord, right: ActivityRecord): number {
  if (left.sequence !== right.sequence) return left.sequence - right.sequence;
  if (left.timestamp !== right.timestamp) return left.timestamp.localeCompare(right.timestamp);
  return left.id.localeCompare(right.id);
}
