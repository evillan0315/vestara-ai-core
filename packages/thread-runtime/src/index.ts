import * as fs from 'node:fs';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import type {
  AgentEnvironmentId,
  AgentRunOutcome,
  AgentRunState,
  AgentTurn,
  AgentTurnId,
  CausationId,
  CorrelationId,
  TaskThread,
  TaskThreadId,
  TaskThreadStatus,
  ThreadItem,
  ThreadItemId,
  ThreadItemKind,
} from '@vestara/types';
import type { Database, SqlValue } from 'sql.js';
import { THREAD_MANIFEST } from './migrations';

export interface CreateThreadInput {
  readonly id?: TaskThreadId;
  readonly taskId: string;
  readonly title: string;
  readonly environmentId: AgentEnvironmentId;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CreateTurnInput {
  readonly id?: AgentTurnId;
  readonly threadId: TaskThreadId;
  readonly input: string;
}

export interface AppendThreadItemInput<TPayload extends Readonly<Record<string, unknown>>> {
  readonly id?: ThreadItemId;
  readonly threadId: TaskThreadId;
  readonly turnId: AgentTurnId;
  readonly kind: ThreadItemKind;
  readonly actorId: string;
  readonly payload: TPayload;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
}

export interface ThreadReplay {
  readonly thread: TaskThread;
  readonly turns: readonly AgentTurn[];
  readonly items: readonly ThreadItem[];
}

export interface CreateCheckpointInput {
  readonly threadId: TaskThreadId;
  readonly turnId: AgentTurnId;
  readonly reason: string;
  readonly snapshot: Readonly<Record<string, unknown>>;
}

export interface ThreadCheckpoint {
  readonly id: string;
  readonly threadId: TaskThreadId;
  readonly turnId: AgentTurnId;
  readonly reason: string;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface ThreadStore {
  createThread(input: CreateThreadInput): TaskThread;
  getThread(id: TaskThreadId): TaskThread | undefined;
  listThreads(): readonly TaskThread[];
  updateThreadStatus(id: TaskThreadId, status: TaskThreadStatus): TaskThread;
  createTurn(input: CreateTurnInput): AgentTurn;
  getTurn(id: AgentTurnId): AgentTurn | undefined;
  getActiveTurn(threadId: TaskThreadId): AgentTurn | undefined;
  listTurns(threadId: TaskThreadId): readonly AgentTurn[];
  transitionTurn(id: AgentTurnId, state: AgentRunState, outcome?: AgentRunOutcome): AgentTurn;
  appendItem<TPayload extends Readonly<Record<string, unknown>>>(
    input: AppendThreadItemInput<TPayload>,
  ): ThreadItem<TPayload>;
  listItems(threadId: TaskThreadId, turnId?: AgentTurnId): readonly ThreadItem[];
  createCheckpoint(input: CreateCheckpointInput): ThreadCheckpoint;
  latestCheckpoint(threadId: TaskThreadId): ThreadCheckpoint | undefined;
  replay(threadId: TaskThreadId): ThreadReplay;
  close(): void;
}

let identifierCounter = 0;

function identifier(prefix: string): string {
  return `${prefix}-${Date.now()}-${++identifierCounter}`;
}

function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'string') return {};
  const parsed: unknown = JSON.parse(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function queryRows(db: Database, sql: string, params: readonly SqlValue[] = []): readonly unknown[][] {
  const statement = db.prepare(sql);
  try {
    statement.bind([...params]);
    const rows: unknown[][] = [];
    while (statement.step()) rows.push(statement.get());
    return rows;
  } finally {
    statement.free();
  }
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

export class FileThreadStore implements ThreadStore {
  private persistTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly persistDebounceMs: number;

  private constructor(
    private readonly db: Database,
    private readonly dbPath: string,
    persistDebounceMs: number,
  ) {
    this.persistDebounceMs = persistDebounceMs;
  }

  static async open(dbPath: string, options?: { persistDebounceMs?: number }): Promise<FileThreadStore> {
    const initSqlJs = (await import('sql.js')).default;
    const sqlJsDir = path.dirname(require.resolve('sql.js'));
    const SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlJsDir, file) });
    const data = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : undefined;
    const raw = data ? new SQL.Database(data) : new SQL.Database();
    migrate(raw, THREAD_MANIFEST, {
      persist: (migrated) => {
        fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
        fs.writeFileSync(path.resolve(dbPath), Buffer.from(migrated.export()));
      },
    });
    const debounceMs = options?.persistDebounceMs ?? positiveInt(process.env.VESTARA_THREAD_PERSIST_DEBOUNCE_MS, 250);
    return new FileThreadStore(raw, path.resolve(dbPath), debounceMs);
  }

  createThread(input: CreateThreadInput): TaskThread {
    const now = new Date().toISOString();
    const thread: TaskThread = {
      id: input.id ?? (identifier('thread') as TaskThreadId),
      taskId: input.taskId,
      title: input.title,
      status: 'active',
      environmentId: input.environmentId,
      createdAt: now,
      updatedAt: now,
      metadata: input.metadata ?? {},
    };
    this.db.run(
      `INSERT INTO task_threads
       (id, task_id, title, status, environment_id, created_at, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        thread.id,
        thread.taskId,
        thread.title,
        thread.status,
        thread.environmentId,
        thread.createdAt,
        thread.updatedAt,
        stringify(thread.metadata),
      ],
    );
    this.persist();
    return thread;
  }

  getThread(id: TaskThreadId): TaskThread | undefined {
    return this.threadFromRow(queryRows(this.db, 'SELECT * FROM task_threads WHERE id = ?', [id])[0]);
  }

  listThreads(): readonly TaskThread[] {
    return queryRows(this.db, 'SELECT * FROM task_threads ORDER BY created_at, id')
      .map((row) => this.threadFromRow(row))
      .filter((thread): thread is TaskThread => thread !== undefined);
  }

  updateThreadStatus(id: TaskThreadId, status: TaskThreadStatus): TaskThread {
    const updatedAt = new Date().toISOString();
    this.db.run('UPDATE task_threads SET status = ?, updated_at = ? WHERE id = ?', [status, updatedAt, id]);
    if (this.db.getRowsModified() !== 1) throw new Error(`Thread not found: ${id}`);
    this.persist();
    return this.requireThread(id);
  }

  createTurn(input: CreateTurnInput): AgentTurn {
    this.requireThread(input.threadId);
    const sequence = this.nextSequence('agent_turns', input.threadId);
    const turn: AgentTurn = {
      id: input.id ?? (identifier('turn') as AgentTurnId),
      threadId: input.threadId,
      sequence,
      state: 'queued',
      input: input.input,
      startedAt: new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO agent_turns
       (id, thread_id, sequence, state, input, outcome_json, started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, NULL)`,
      [turn.id, turn.threadId, turn.sequence, turn.state, turn.input, turn.startedAt],
    );
    this.touchThread(input.threadId);
    this.persist();
    return turn;
  }

  getTurn(id: AgentTurnId): AgentTurn | undefined {
    return this.turnFromRow(queryRows(this.db, 'SELECT * FROM agent_turns WHERE id = ?', [id])[0]);
  }

  getActiveTurn(threadId: TaskThreadId): AgentTurn | undefined {
    const terminal = ['completed', 'failed', 'cancelled'];
    return this.listTurns(threadId)
      .filter((turn) => !terminal.includes(turn.state))
      .at(-1);
  }

  listTurns(threadId: TaskThreadId): readonly AgentTurn[] {
    return queryRows(this.db, 'SELECT * FROM agent_turns WHERE thread_id = ? ORDER BY sequence', [threadId])
      .map((row) => this.turnFromRow(row))
      .filter((turn): turn is AgentTurn => turn !== undefined);
  }

  transitionTurn(id: AgentTurnId, state: AgentRunState, outcome?: AgentRunOutcome): AgentTurn {
    const completedAt = outcome ? outcome.completedAt : null;
    this.db.run('UPDATE agent_turns SET state = ?, outcome_json = ?, completed_at = ? WHERE id = ?', [
      state,
      outcome ? stringify(outcome) : null,
      completedAt,
      id,
    ]);
    if (this.db.getRowsModified() !== 1) throw new Error(`Turn not found: ${id}`);
    const turn = this.requireTurn(id);
    this.touchThread(turn.threadId);
    this.persist();
    return turn;
  }

  appendItem<TPayload extends Readonly<Record<string, unknown>>>(
    input: AppendThreadItemInput<TPayload>,
  ): ThreadItem<TPayload> {
    this.requireThread(input.threadId);
    const turn = this.requireTurn(input.turnId);
    if (turn.threadId !== input.threadId) throw new Error('Turn does not belong to thread');
    const item: ThreadItem<TPayload> = {
      id: input.id ?? (identifier('item') as ThreadItemId),
      threadId: input.threadId,
      turnId: input.turnId,
      sequence: this.nextSequence('thread_items', input.threadId),
      kind: input.kind,
      actorId: input.actorId,
      payload: input.payload,
      createdAt: new Date().toISOString(),
      correlationId: input.correlationId,
      causationId: input.causationId,
    };
    this.db.run(
      `INSERT INTO thread_items
       (id, thread_id, turn_id, sequence, kind, actor_id, payload_json, created_at, correlation_id, causation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        item.threadId,
        item.turnId,
        item.sequence,
        item.kind,
        item.actorId,
        stringify(item.payload),
        item.createdAt,
        item.correlationId,
        item.causationId ?? null,
      ],
    );
    this.touchThread(input.threadId);
    this.persist();
    return item;
  }

  listItems(threadId: TaskThreadId, turnId?: AgentTurnId): readonly ThreadItem[] {
    const rows = turnId
      ? queryRows(this.db, 'SELECT * FROM thread_items WHERE thread_id = ? AND turn_id = ? ORDER BY sequence', [
          threadId,
          turnId,
        ])
      : queryRows(this.db, 'SELECT * FROM thread_items WHERE thread_id = ? ORDER BY sequence', [threadId]);
    return rows.map((row) => this.itemFromRow(row)).filter((item): item is ThreadItem => item !== undefined);
  }

  createCheckpoint(input: CreateCheckpointInput): ThreadCheckpoint {
    this.requireThread(input.threadId);
    const turn = this.requireTurn(input.turnId);
    if (turn.threadId !== input.threadId) throw new Error('Turn does not belong to thread');
    const checkpoint: ThreadCheckpoint = {
      id: identifier('checkpoint'),
      threadId: input.threadId,
      turnId: input.turnId,
      reason: input.reason,
      snapshot: input.snapshot,
      createdAt: new Date().toISOString(),
    };
    this.db.run(
      `INSERT INTO thread_checkpoints
       (id, thread_id, turn_id, reason, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        checkpoint.id,
        checkpoint.threadId,
        checkpoint.turnId,
        checkpoint.reason,
        stringify(checkpoint.snapshot),
        checkpoint.createdAt,
      ],
    );
    this.persist();
    return checkpoint;
  }

  latestCheckpoint(threadId: TaskThreadId): ThreadCheckpoint | undefined {
    const row = queryRows(
      this.db,
      'SELECT * FROM thread_checkpoints WHERE thread_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [threadId],
    )[0];
    return this.checkpointFromRow(row);
  }

  replay(threadId: TaskThreadId): ThreadReplay {
    return { thread: this.requireThread(threadId), turns: this.listTurns(threadId), items: this.listItems(threadId) };
  }

  close(): void {
    this.flushPersist();
    this.db.close();
  }

  /**
   * Coalesce writes: mark the DB dirty and schedule a single export+write
   * after the debounce window. Many rapid mutations (e.g. workflow start) then
   * flush as ONE full-DB write instead of one synchronous export per mutation,
   * which otherwise blocks the event loop for minutes. In-memory reads remain
   * immediately consistent; durability only lags by the debounce window.
   */
  private persist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      try {
        this.flushPersist();
      } catch {
        // Never let a failed background flush take the process down; the next
        // mutation re-schedules.
      }
    }, this.persistDebounceMs);
  }

  /** Synchronously export the in-memory DB and atomically replace the file. */
  private flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const temporaryPath = `${this.dbPath}.tmp`;
    fs.writeFileSync(temporaryPath, Buffer.from(this.db.export()));
    fs.renameSync(temporaryPath, this.dbPath);
  }

  private nextSequence(table: 'agent_turns' | 'thread_items', threadId: TaskThreadId): number {
    const row = queryRows(
      this.db,
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM ${table} WHERE thread_id = ?`,
      [threadId],
    )[0];
    return numberValue(row?.[0] ?? 1);
  }

  private touchThread(id: TaskThreadId): void {
    this.db.run('UPDATE task_threads SET updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);
  }

  private requireThread(id: TaskThreadId): TaskThread {
    const thread = this.getThread(id);
    if (!thread) throw new Error(`Thread not found: ${id}`);
    return thread;
  }

  private requireTurn(id: AgentTurnId): AgentTurn {
    const turn = this.getTurn(id);
    if (!turn) throw new Error(`Turn not found: ${id}`);
    return turn;
  }

  private threadFromRow(row: readonly unknown[] | undefined): TaskThread | undefined {
    if (!row) return undefined;
    return {
      id: String(row[0]) as TaskThreadId,
      taskId: String(row[1]),
      title: String(row[2]),
      status: String(row[3]) as TaskThreadStatus,
      environmentId: String(row[4]) as AgentEnvironmentId,
      createdAt: String(row[5]),
      updatedAt: String(row[6]),
      metadata: parseRecord(row[7]),
    };
  }

  private turnFromRow(row: readonly unknown[] | undefined): AgentTurn | undefined {
    if (!row) return undefined;
    const outcome = row[5] ? (parseRecord(row[5]) as unknown as AgentRunOutcome) : undefined;
    return {
      id: String(row[0]) as AgentTurnId,
      threadId: String(row[1]) as TaskThreadId,
      sequence: numberValue(row[2]),
      state: String(row[3]) as AgentRunState,
      input: String(row[4]),
      outcome,
      startedAt: String(row[6]),
      completedAt: row[7] ? String(row[7]) : undefined,
    };
  }

  private itemFromRow(row: readonly unknown[] | undefined): ThreadItem | undefined {
    if (!row) return undefined;
    return {
      id: String(row[0]) as ThreadItemId,
      threadId: String(row[1]) as TaskThreadId,
      turnId: String(row[2]) as AgentTurnId,
      sequence: numberValue(row[3]),
      kind: String(row[4]) as ThreadItemKind,
      actorId: String(row[5]),
      payload: parseRecord(row[6]),
      createdAt: String(row[7]),
      correlationId: String(row[8]) as CorrelationId,
      causationId: row[9] ? (String(row[9]) as CausationId) : undefined,
    };
  }

  private checkpointFromRow(row: readonly unknown[] | undefined): ThreadCheckpoint | undefined {
    if (!row) return undefined;
    return {
      id: String(row[0]),
      threadId: String(row[1]) as TaskThreadId,
      turnId: String(row[2]) as AgentTurnId,
      reason: String(row[3]),
      snapshot: parseRecord(row[4]),
      createdAt: String(row[5]),
    };
  }
}
export { THREAD_MANIFEST } from './migrations';

function positiveInt(...candidates: Array<number | string | undefined>): number {
  for (const candidate of candidates) {
    const parsed = typeof candidate === 'number' ? candidate : Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return 250;
}
