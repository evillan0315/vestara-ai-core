import type { Logger } from '@vestara/logger';
import type { AudioTimelineEntry, ConversationSession, Message } from '@vestara/shared';

let SQL: any = null;

async function getDb(): Promise<any> {
  if (SQL) return SQL;
  const { getSql } = await import('@vestara/shared');
  SQL = await getSql();
  return SQL;
}

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const result = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return result;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export class SqliteConversationSessionStore {
  private db: any;
  private logger?: Logger;
  private initialized = false;
  private dbPath?: string;

  constructor(options?: { dbPath?: string; logger?: Logger }) {
    this.dbPath = options?.dbPath;
    this.logger = options?.logger?.child({ component: 'session-store' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const sql = await getDb();
    if (this.dbPath) {
      try {
        const fs = await import('node:fs');
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new sql.Database(buffer);
      } catch {
        this.db = new sql.Database();
      }
    } else {
      this.db = new sql.Database();
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        context TEXT DEFAULT '{}',
        referenced_artifacts TEXT DEFAULT '[]',
        summaries TEXT DEFAULT '[]',
        actions TEXT DEFAULT '[]',
        memory_updates TEXT DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS session_transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        tokens INTEGER,
        latency INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS session_audio_timeline (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        duration INTEGER,
        data TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON conversation_sessions(user_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_transcript_session ON session_transcripts(session_id, created_at);
    `);
    this.initialized = true;
    this.logger?.info('SessionStore initialized');
  }

  async save(session: ConversationSession): Promise<void> {
    await this.initialize();
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO conversation_sessions
       (id, user_id, profile_id, started_at, ended_at, context, referenced_artifacts, summaries, actions, memory_updates)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.userId,
        session.profileId,
        session.startedAt,
        session.endedAt ?? null,
        JSON.stringify(session.context),
        JSON.stringify(session.referencedArtifacts),
        JSON.stringify(session.summaries),
        JSON.stringify(session.actions),
        JSON.stringify(session.memoryUpdates),
      ],
    );

    dbRun(this.db, 'DELETE FROM session_transcripts WHERE session_id = ?', [session.id]);
    for (const msg of session.transcript) {
      dbRun(
        this.db,
        `INSERT INTO session_transcripts
         (session_id, role, content, provider, model, tokens, latency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id,
          msg.role,
          msg.content,
          msg.provider ?? null,
          msg.model ?? null,
          msg.tokens ?? null,
          msg.latency ?? null,
          msg.createdAt,
        ],
      );
    }

    dbRun(this.db, 'DELETE FROM session_audio_timeline WHERE session_id = ?', [session.id]);
    for (const entry of session.audioTimeline) {
      dbRun(
        this.db,
        `INSERT INTO session_audio_timeline (session_id, timestamp, type, duration, data)
         VALUES (?, ?, ?, ?, ?)`,
        [session.id, entry.timestamp, entry.type, entry.duration ?? null, entry.data ?? null],
      );
    }

    this._persist();
    this.logger?.debug('Session saved', {
      id: session.id,
      transcriptCount: session.transcript.length,
    });
  }

  async load(id: string): Promise<ConversationSession | null> {
    await this.initialize();
    const row = dbGet(this.db, 'SELECT * FROM conversation_sessions WHERE id = ?', [id]);
    if (!row) return null;

    const transcript = dbAll(this.db, 'SELECT * FROM session_transcripts WHERE session_id = ? ORDER BY created_at', [
      id,
    ]);
    const audioTimeline = dbAll(this.db, 'SELECT * FROM session_audio_timeline WHERE session_id = ? ORDER BY id', [id]);

    return this._rowToSession(row, transcript, audioTimeline);
  }

  async listRecent(userId: string, limit = 10): Promise<ConversationSession[]> {
    await this.initialize();
    const rows = dbAll(
      this.db,
      'SELECT * FROM conversation_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?',
      [userId, limit],
    );
    return rows.map((row: any) => this._rowToSession(row, [], []));
  }

  async delete(id: string): Promise<void> {
    await this.initialize();
    dbRun(this.db, 'DELETE FROM session_transcripts WHERE session_id = ?', [id]);
    dbRun(this.db, 'DELETE FROM session_audio_timeline WHERE session_id = ?', [id]);
    dbRun(this.db, 'DELETE FROM conversation_sessions WHERE id = ?', [id]);
    this._persist();
  }

  private _persist(): void {
    if (!this.dbPath) return;
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, buffer);
    } catch {}
  }

  private _rowToSession(
    row: Record<string, unknown>,
    transcriptRows: Record<string, unknown>[],
    audioRows: Record<string, unknown>[],
  ): ConversationSession {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      profileId: row.profile_id as string,
      startedAt: row.started_at as string,
      endedAt: (row.ended_at as string) ?? undefined,
      transcript: transcriptRows.map((r) => ({
        id: String(r.id),
        conversationId: r.session_id as string,
        role: r.role as Message['role'],
        content: r.content as string,
        provider: (r.provider as string) ?? undefined,
        model: (r.model as string) ?? undefined,
        tokens: (r.tokens as number) ?? undefined,
        latency: (r.latency as number) ?? undefined,
        createdAt: r.created_at as string,
      })),
      audioTimeline: audioRows.map((r) => ({
        timestamp: r.timestamp as string,
        type: r.type as AudioTimelineEntry['type'],
        duration: (r.duration as number) ?? undefined,
        data: (r.data as string) ?? undefined,
      })),
      context: this._parseJson<Record<string, unknown>>(row.context as string, {}),
      referencedArtifacts: this._parseJson<string[]>(row.referenced_artifacts as string, []),
      summaries: this._parseJson<string[]>(row.summaries as string, []),
      actions: this._parseJson<string[]>(row.actions as string, []),
      memoryUpdates: this._parseJson<string[]>(row.memory_updates as string, []),
    };
  }

  private _parseJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
