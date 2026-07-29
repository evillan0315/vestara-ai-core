/**
 * NotificationStore — SQLite-backed notification persistence.
 *
 * Stores user-facing notifications with read/unread state.
 * Designed to be fed by ActivityService domain events and queried
 * by the UI notification center.
 *
 * Architecture Traceability:
 *   v7.6 — Notification Center & Alerting
 */

import type { Logger } from '@vestara/logger';

let SQL: any = null;

async function getSql(): Promise<any> {
  if (SQL) return SQL;
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
  return SQL;
}

export interface StoredNotification {
  id: string;
  type: string;
  category: string;
  message: string;
  actorName: string;
  resourceType: string;
  resourceId: string;
  read: number; // 0 or 1 (SQLite boolean)
  timestamp: string;
  metadata: string;
}

export interface AppNotification {
  id: string;
  type: string;
  category: string;
  message: string;
  actorName: string;
  resourceType: string;
  resourceId: string;
  read: boolean;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export class NotificationStore {
  private db: any;
  private logger?: Logger;
  private initialized = false;
  private dbPath?: string;

  constructor(options?: { dbPath?: string; logger?: Logger }) {
    this.dbPath = options?.dbPath;
    this.logger = options?.logger?.child({ component: 'notification-store' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const sql = await getSql();
    if (this.dbPath) {
      try {
        const fs = require('node:fs') as typeof import('node:fs');
        this.db = new sql.Database(fs.readFileSync(this.dbPath));
      } catch {
        this.db = new sql.Database();
      }
    } else {
      this.db = new sql.Database();
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        actor_name TEXT NOT NULL DEFAULT '',
        resource_type TEXT NOT NULL DEFAULT '',
        resource_id TEXT NOT NULL DEFAULT '',
        read INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL,
        metadata TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications(category, timestamp DESC);
    `);
    this.initialized = true;
    this.logger?.info('NotificationStore initialized');
  }

  async insert(notification: Omit<AppNotification, 'read'>): Promise<void> {
    await this.initialize();
    const stmt = this.db.prepare(`
      INSERT INTO notifications (id, type, category, message, actor_name, resource_type, resource_id, read, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);
    stmt.bind([
      notification.id,
      notification.type,
      notification.category,
      notification.message,
      notification.actorName,
      notification.resourceType,
      notification.resourceId,
      notification.timestamp,
      JSON.stringify(notification.metadata),
    ]);
    stmt.step();
    stmt.free();
    this._persist();
  }

  async list(options?: {
    limit?: number;
    unreadOnly?: boolean;
    category?: string;
    before?: string;
  }): Promise<AppNotification[]> {
    await this.initialize();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.unreadOnly) {
      conditions.push('read = 0');
    }
    if (options?.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options?.before) {
      conditions.push('timestamp < ?');
      params.push(options.before);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(options?.limit ?? 50, 200);
    const sql = `SELECT * FROM notifications ${where} ORDER BY timestamp DESC LIMIT ?`;

    const stmt = this.db.prepare(sql);
    stmt.bind([...params, limit]);
    const results: AppNotification[] = [];
    while (stmt.step()) {
      results.push(this._rowToNotification(stmt.getAsObject()));
    }
    stmt.free();
    return results;
  }

  async markRead(id: string): Promise<void> {
    await this.initialize();
    this.db.run('UPDATE notifications SET read = 1 WHERE id = ?', [id]);
    this._persist();
  }

  async markAllRead(): Promise<number> {
    await this.initialize();
    const result = this.db.run('UPDATE notifications SET read = 1 WHERE read = 0');
    this._persist();
    return result?.changes ?? 0;
  }

  async unreadCount(): Promise<number> {
    await this.initialize();
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0');
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();
    return row.count;
  }

  async deleteBefore(timestamp: string): Promise<void> {
    await this.initialize();
    this.db.run('DELETE FROM notifications WHERE timestamp < ?', [timestamp]);
    this._persist();
  }

  private _persist(): void {
    if (!this.dbPath) return;
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const data = this.db.export();
      const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch {}
  }

  private _rowToNotification(row: Record<string, unknown>): AppNotification {
    return {
      id: row.id as string,
      type: row.type as string,
      category: row.category as string,
      message: row.message as string,
      actorName: row.actor_name as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      read: (row.read as number) === 1,
      timestamp: row.timestamp as string,
      metadata: this._parseJson(row.metadata as string, {}),
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
