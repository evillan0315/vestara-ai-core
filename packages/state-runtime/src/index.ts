/**
 * @vestara/state-runtime — Persistent State Runtime
 *
 * SQLite-backed persistent state using sql.js (WASM). Conversations,
 * settings, and session state survive restarts. WAL-mode semantics
 * via explicit save-to-disk.
 *
 * Recovery invariant: Unexpected shutdown never corrupts the runtime.
 *
 * Architecture Traceability:
 *   Runtime: VESTARA-KERNEL.md → Shutdown / Recovery
 *   Foundation: DATA-DICT → Entities
 */

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';
import type { Conversation, ConversationSummary, Message } from '@vestara/shared';
import { migrate } from '@vestara/sqlite-migrations';
import { STATE_MANIFEST } from './migrations';

let SQL: any = null;

async function getSql(): Promise<any> {
  if (SQL) return SQL;
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
  return SQL;
}

// ─── Stores ──────────────────────────────────────────────────

export interface ConversationStore {
  saveConversation(conv: Conversation): Promise<void>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(limit?: number): Promise<ConversationSummary[]>;
  deleteConversation(id: string): Promise<void>;
  saveMessage(convId: string, msg: Message): Promise<void>;
}

export interface SettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
}

export interface StateRuntime {
  conversations: ConversationStore;
  settings: SettingsStore;
  initialize(dbPath?: string): Promise<void>;
  checkpoint(): Promise<void>;
  shutdown(): Promise<void>;
}

// ─── SQLite Implementation ──────────────────────────────────

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

class SqliteConversationStore implements ConversationStore {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async saveConversation(conv: Conversation): Promise<void> {
    dbRun(this.db, 'INSERT OR REPLACE INTO conversations VALUES (?,?,?,?,?,?)', [
      conv.id,
      conv.userId,
      conv.title,
      conv.status,
      conv.createdAt,
      conv.updatedAt,
    ]);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const row = dbGet(this.db, 'SELECT * FROM conversations WHERE id = ?', [id]);
    if (!row) return null;
    const msgs = dbAll(this.db, 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at', [id]);
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      status: row.status,
      messages: msgs.map((r: any) => ({
        id: r.id,
        conversationId: r.conversation_id,
        role: r.role,
        content: r.content,
        provider: r.provider,
        model: r.model,
        tokens: r.tokens,
        latency: r.latency,
        createdAt: r.created_at,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listConversations(limit = 50): Promise<ConversationSummary[]> {
    const rows = dbAll(
      this.db,
      `SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as mc
       FROM conversations c WHERE c.status != 'deleted' ORDER BY c.updated_at DESC LIMIT ?`,
      [limit],
    );
    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      messageCount: r.mc,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async deleteConversation(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM conversations WHERE id = ?', [id]);
  }

  async saveMessage(convId: string, msg: Message): Promise<void> {
    dbRun(this.db, 'INSERT OR REPLACE INTO messages VALUES (?,?,?,?,?,?,?,?,?)', [
      msg.id,
      convId,
      msg.role,
      msg.content,
      msg.provider ?? null,
      msg.model ?? null,
      msg.tokens ?? 0,
      msg.latency ?? 0,
      msg.createdAt,
    ]);
  }
}

class SqliteSettingsStore implements SettingsStore {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async get(key: string): Promise<string | null> {
    const r = dbGet(this.db, 'SELECT value FROM settings WHERE key = ?', [key]);
    return r?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    dbRun(this.db, 'INSERT OR REPLACE INTO settings VALUES (?,?,?)', [key, value, new Date().toISOString()]);
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = dbAll(this.db, 'SELECT key, value FROM settings');
    const r: Record<string, string> = {};
    for (const row of rows) r[row.key] = row.value;
    return r;
  }
}

// ─── Default State Runtime ──────────────────────────────────

export class DefaultStateRuntime implements StateRuntime {
  conversations: ConversationStore;
  settings: SettingsStore;

  private db: any = null;
  private dbPath = './vestara-state.db';
  private logger?: Logger;
  private eventBus?: EventBus;

  constructor(opts?: { logger?: Logger; eventBus?: EventBus }) {
    this.logger = opts?.logger?.child({ component: 'state' });
    this.eventBus = opts?.eventBus;
    this.conversations = null!;
    this.settings = null!;
  }

  async initialize(dbPath?: string): Promise<void> {
    if (dbPath) this.dbPath = dbPath;
    const fs = await import('node:fs');
    const SQL = await getSql();

    let buf: Buffer | undefined;
    try {
      if (fs.existsSync(this.dbPath)) buf = fs.readFileSync(this.dbPath);
    } catch {
      /* first boot */
    }

    this.db = new SQL.Database(buf);
    migrate(this.db, STATE_MANIFEST, {
      persist: (migrated) => {
        fs.writeFileSync(this.dbPath, Buffer.from(migrated.export()));
      },
    });
    this.conversations = new SqliteConversationStore(this.db);
    this.settings = new SqliteSettingsStore(this.db);
    this.logger?.info('State runtime initialized', { path: this.dbPath });
  }

  async checkpoint(): Promise<void> {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const fs = await import('node:fs');
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (error) {
      this.logger?.error('Checkpoint failed', { error: error instanceof Error ? error : undefined });
    }
  }

  async shutdown(): Promise<void> {
    if (!this.db) return;
    try {
      await this.checkpoint();
      this.db.close();
      this.db = null;
    } catch (error) {
      this.logger?.error('Shutdown error', { error: error instanceof Error ? error : undefined });
    }
  }
}
