/**
 * ActivityLogStore — SQLite-backed activity event persistence.
 *
 * Every domain event is durably stored, enabling the dashboard to
 * replay history after reconnection and supporting future audit,
 * analytics, and enterprise features.
 *
 * Architecture Traceability:
 *   PCS-020 → Real-Time Activity Stream
 */

import type { WorkspaceEvent } from '@vestara/events';
import type { Logger } from '@vestara/logger';

let SQL: any = null;

async function getSql(): Promise<any> {
  if (SQL) return SQL;
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
  return SQL;
}

export class ActivityLogStore {
  private db: any;
  private logger?: Logger;
  private initialized = false;
  private dbPath?: string;

  constructor(options?: { dbPath?: string; logger?: Logger }) {
    this.dbPath = options?.dbPath;
    this.logger = options?.logger?.child({ component: 'activity-log' });
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
      CREATE TABLE IF NOT EXISTS activity_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        resource_name TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_events(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_category ON activity_events(category, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_events(type, timestamp DESC);
    `);
    this.initialized = true;
    this.logger?.info('ActivityLogStore initialized');
  }

  async append(event: WorkspaceEvent): Promise<void> {
    await this.initialize();

    const stmt = this.db.prepare(`
      INSERT INTO activity_events
      (id, timestamp, category, type, actor_id, actor_name, actor_type, resource_type, resource_id, resource_name, message, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.bind([
      event.id,
      event.timestamp,
      event.category,
      event.type,
      event.actor.id,
      event.actor.name,
      event.actor.type,
      event.resource.type,
      event.resource.id,
      event.resource.name,
      event.message,
      JSON.stringify(event.metadata),
    ]);
    stmt.step();
    stmt.free();

    this._persist();
  }

  async query(options?: {
    category?: string;
    type?: string;
    limit?: number;
    before?: string;
    actorId?: string;
  }): Promise<WorkspaceEvent[]> {
    await this.initialize();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options?.before) {
      conditions.push('timestamp < ?');
      params.push(options.before);
    }
    if (options?.actorId) {
      conditions.push('actor_id = ?');
      params.push(options.actorId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(options?.limit ?? 50, 500);
    const sql = `SELECT * FROM activity_events ${where} ORDER BY timestamp DESC LIMIT ?`;

    const stmt = this.db.prepare(sql);
    stmt.bind([...params, limit]);
    const events: WorkspaceEvent[] = [];
    while (stmt.step()) {
      events.push(this._rowToEvent(stmt.getAsObject()));
    }
    stmt.free();
    return events;
  }

  async count(): Promise<number> {
    await this.initialize();
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM activity_events');
    stmt.step();
    const row = stmt.getAsObject() as { count: number };
    stmt.free();
    return row.count;
  }

  async deleteBefore(timestamp: string): Promise<void> {
    await this.initialize();
    this.db.run('DELETE FROM activity_events WHERE timestamp < ?', [timestamp]);
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

  private _rowToEvent(row: Record<string, unknown>): WorkspaceEvent {
    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      category: row.category as any,
      type: row.type as any,
      actor: {
        id: row.actor_id as string,
        name: row.actor_name as string,
        type: row.actor_type as any,
      },
      resource: {
        type: row.resource_type as string,
        id: row.resource_id as string,
        name: row.resource_name as string,
      },
      message: row.message as string,
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
