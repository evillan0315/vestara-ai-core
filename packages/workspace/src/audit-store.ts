/**
 * AuditStore — SQLite-backed audit log for user actions.
 *
 * Records who did what, when, and to which resource.
 * Immutable: entries are write-only (never deleted or updated).
 *
 * Architecture Traceability:
 *   v8.0: Multi-User Collaboration
 *   Natural Law: Accountability drives trust
 *   Purpose: Let's Change the World
 */

export interface AuditEntry {
  id: string;
  userId: string;
  username: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  timestamp: string;
}

export class AuditStore {
  private db: any;

  constructor(db: any) {
    this.db = db;
    // Schema is owned by the migration chain (workspace-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  /** Append an entry to the audit log. */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): AuditEntry {
    const id = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (id, user_id, username, action, resource, resource_id, details, ip, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run([
      id,
      entry.userId,
      entry.username,
      entry.action,
      entry.resource,
      entry.resourceId || null,
      entry.details || null,
      entry.ip || null,
      timestamp,
    ]);
    stmt.free();
    return { id, ...entry, timestamp };
  }

  /** Query audit log with optional filters. Results in reverse chronological order. */
  query(options?: {
    limit?: number;
    offset?: number;
    userId?: string;
    action?: string;
    resource?: string;
    since?: string;
    until?: string;
  }): AuditEntry[] {
    let sql =
      'SELECT id, user_id, username, action, resource, resource_id, details, ip, timestamp FROM audit_log WHERE 1=1';
    const params: unknown[] = [];

    if (options?.userId) {
      sql += ' AND user_id = ?';
      params.push(options.userId);
    }
    if (options?.action) {
      sql += ' AND action = ?';
      params.push(options.action);
    }
    if (options?.resource) {
      sql += ' AND resource = ?';
      params.push(options.resource);
    }
    if (options?.since) {
      sql += ' AND timestamp >= ?';
      params.push(options.since);
    }
    if (options?.until) {
      sql += ' AND timestamp <= ?';
      params.push(options.until);
    }

    sql += ' ORDER BY timestamp DESC';
    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    } else {
      sql += ' LIMIT 100';
    }
    if (options?.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const results: AuditEntry[] = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        userId: row.user_id as string,
        username: row.username as string,
        action: row.action as string,
        resource: row.resource as string,
        resourceId: row.resource_id as string | undefined,
        details: row.details as string | undefined,
        ip: row.ip as string | undefined,
        timestamp: row.timestamp as string,
      });
    }
    stmt.free();
    return results;
  }

  /** Get total entry count. */
  count(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM audit_log');
    stmt.step();
    const row = stmt.getAsObject();
    stmt.free();
    return (row.count as number) || 0;
  }

  /** Prune entries older than a given ISO timestamp. Returns number of deleted rows. */
  pruneOlderThan(timestamp: string): number {
    const stmt = this.db.prepare('DELETE FROM audit_log WHERE timestamp < ?');
    stmt.bind([timestamp]);
    stmt.step();
    const changes = this.db.getRowsModified();
    stmt.free();
    return changes;
  }
}
