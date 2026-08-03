import type { ConversationStore } from '@vestara/conversation';
import type { Logger } from '@vestara/logger';
import type { Conversation, ConversationStatus, ConversationSummary, Message } from '@vestara/shared';

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

/**
 * SQLite-backed `ConversationStore` for `@vestara/conversation`. Persists the
 * conversation + message rows so chat history survives restart. Uses the same
 * sql.js pattern as `SqliteConversationSessionStore`; each store owns its own
 * tables so they can share a dbPath without interfering.
 */
export class SqliteConversationStore implements ConversationStore {
  private db: any;
  private logger?: Logger;
  private initialized = false;
  private dbPath?: string;

  constructor(options?: { dbPath?: string; logger?: Logger }) {
    this.dbPath = options?.dbPath;
    this.logger = options?.logger?.child({ component: 'conversation-store' });
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
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        tokens INTEGER,
        cost REAL,
        latency INTEGER,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation_messages_conv ON conversation_messages(conversation_id, created_at);
    `);
    this.initialized = true;
  }

  private async _db(): Promise<any> {
    await this.initialize();
    return this.db;
  }

  async create(conversation: Conversation): Promise<void> {
    const db = await this._db();
    dbRun(
      db,
      `INSERT INTO conversations (id, user_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        conversation.id,
        conversation.userId,
        conversation.title,
        conversation.status,
        conversation.createdAt,
        conversation.updatedAt,
      ],
    );
    this._persist();
  }

  async get(id: string): Promise<Conversation | null> {
    const db = await this._db();
    const row = dbGet(db, 'SELECT * FROM conversations WHERE id = ?', [id]);
    if (!row) return null;
    const messages = dbAll(
      db,
      'SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at, rowid',
      [id],
    );
    return {
      id: row.id as string,
      userId: row.user_id as string,
      title: row.title as string,
      status: row.status as ConversationStatus,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      messages: messages.map((m) => this._rowToMessage(m)),
    };
  }

  async list(userId: string): Promise<ConversationSummary[]> {
    const db = await this._db();
    const rows = dbAll(
      db,
      `SELECT c.*, COUNT(m.id) AS message_count
       FROM conversations c
       LEFT JOIN conversation_messages m ON m.conversation_id = c.id
       WHERE c.user_id = ? AND c.status != 'deleted'
       GROUP BY c.id ORDER BY c.updated_at DESC`,
      [userId],
    );
    return rows.map((row: any) => ({
      id: row.id as string,
      title: row.title as string,
      messageCount: Number(row.message_count ?? 0),
      status: row.status as ConversationStatus,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }));
  }

  async addMessage(conversationId: string, message: Message): Promise<void> {
    const db = await this._db();
    dbRun(
      db,
      `INSERT INTO conversation_messages
       (id, conversation_id, role, content, provider, model, tokens, cost, latency, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.id,
        conversationId,
        message.role,
        message.content,
        message.provider ?? null,
        message.model ?? null,
        message.tokens ?? null,
        message.cost ?? null,
        message.latency ?? null,
        message.createdAt,
      ],
    );
    dbRun(db, 'UPDATE conversations SET updated_at = ? WHERE id = ?', [message.createdAt, conversationId]);
    this._persist();
  }

  async setStatus(id: string, status: Conversation['status']): Promise<void> {
    const db = await this._db();
    dbRun(db, 'UPDATE conversations SET status = ? WHERE id = ?', [status, id]);
    this._persist();
  }

  async remove(id: string): Promise<void> {
    const db = await this._db();
    dbRun(db, 'DELETE FROM conversation_messages WHERE conversation_id = ?', [id]);
    dbRun(db, 'DELETE FROM conversations WHERE id = ?', [id]);
    this._persist();
  }

  private _rowToMessage(row: Record<string, unknown>): Message {
    return {
      id: row.id as string,
      conversationId: row.conversation_id as string,
      role: row.role as Message['role'],
      content: row.content as string,
      provider: (row.provider as string) ?? undefined,
      model: (row.model as string) ?? undefined,
      tokens: (row.tokens as number) ?? undefined,
      cost: (row.cost as number) ?? undefined,
      latency: (row.latency as number) ?? undefined,
      createdAt: row.created_at as string,
    };
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
}
