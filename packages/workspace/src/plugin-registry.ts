/**
 * PluginRegistry — SQLite-backed persistence for plugin definitions and executions.
 *
 * Architecture Traceability:
 *   PCS: PCS-014 — Plugin Ecosystem
 */

import type { PluginDefinition, PluginExecution } from './types';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const r = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return r;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

export class PluginRegistry {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
    this.seedBuiltIn();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT, version TEXT, publisher TEXT,
        description TEXT,
        permissions TEXT DEFAULT '[]',
        hooks TEXT DEFAULT '[]',
        status TEXT DEFAULT 'active',
        created_at TEXT
      );
      CREATE TABLE IF NOT EXISTS plugin_executions (
        id TEXT PRIMARY KEY,
        plugin_id TEXT,
        hook TEXT,
        status TEXT,
        duration INTEGER,
        message TEXT,
        timestamp TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pe_plugin ON plugin_executions(plugin_id);
    `);
  }

  private seedBuiltIn(): void {
    const existing = dbGet(this.db, 'SELECT COUNT(*) as c FROM plugins');
    if (existing && existing.c > 0) return;

    const now = new Date().toISOString();
    const builtIn: PluginDefinition[] = [
      {
        id: 'vestara/github',
        name: 'GitHub Integration',
        version: '1.0.0',
        publisher: 'Vestara',
        description: 'Create issues and PRs from verification results.',
        permissions: [
          { resource: 'repository', action: 'read' },
          { resource: 'collaboration', action: 'read' },
        ],
        hooks: ['after-verify', 'after-approve'],
        status: 'active',
        createdAt: now,
      },
      {
        id: 'vestara/jira',
        name: 'Jira Connector',
        version: '1.0.0',
        publisher: 'Vestara',
        description: 'Create and update Jira tickets from plans and approvals.',
        permissions: [{ resource: 'collaboration', action: 'read' }],
        hooks: ['after-plan', 'after-approve'],
        status: 'active',
        createdAt: now,
      },
      {
        id: 'vestara/slack',
        name: 'Slack Notifier',
        version: '1.0.0',
        publisher: 'Vestara',
        description: 'Send notifications to Slack channels on verification and approval.',
        permissions: [{ resource: 'collaboration', action: 'read' }],
        hooks: ['after-verify', 'after-approve'],
        status: 'active',
        createdAt: now,
      },
      {
        id: 'vestara/logs',
        name: 'Structured Log Export',
        version: '1.0.0',
        publisher: 'Vestara',
        description: 'Export structured execution logs to external systems.',
        permissions: [{ resource: 'repository', action: 'read' }],
        hooks: ['after-execution'],
        status: 'active',
        createdAt: now,
      },
    ];

    for (const plugin of builtIn) {
      dbRun(
        this.db,
        `INSERT INTO plugins (id, name, version, publisher, description, permissions, hooks, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          plugin.id,
          plugin.name,
          plugin.version,
          plugin.publisher,
          plugin.description,
          JSON.stringify(plugin.permissions),
          JSON.stringify(plugin.hooks),
          plugin.status,
          plugin.createdAt,
        ],
      );
    }
  }

  async list(): Promise<PluginDefinition[]> {
    return dbAll(this.db, 'SELECT * FROM plugins ORDER BY created_at ASC').map((r: any) => this.rowToPlugin(r));
  }

  async get(id: string): Promise<PluginDefinition | null> {
    const row = dbGet(this.db, 'SELECT * FROM plugins WHERE id = ?', [id]);
    return row ? this.rowToPlugin(row) : null;
  }

  async setStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
    dbRun(this.db, 'UPDATE plugins SET status = ? WHERE id = ?', [status, id]);
  }

  async remove(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM plugins WHERE id = ?', [id]);
  }

  async addExecution(execution: PluginExecution): Promise<void> {
    dbRun(
      this.db,
      'INSERT INTO plugin_executions (id, plugin_id, hook, status, duration, message, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        execution.id,
        execution.pluginId,
        execution.hook,
        execution.status,
        execution.duration,
        execution.message,
        execution.timestamp,
      ],
    );
  }

  async getExecutions(pluginId: string, limit = 20): Promise<PluginExecution[]> {
    return dbAll(this.db, 'SELECT * FROM plugin_executions WHERE plugin_id = ? ORDER BY timestamp DESC LIMIT ?', [
      pluginId,
      limit,
    ]).map((r: any) => ({
      id: r.id,
      pluginId: r.plugin_id,
      hook: r.hook,
      status: r.status,
      duration: r.duration,
      message: r.message,
      timestamp: r.timestamp,
    }));
  }

  private rowToPlugin(row: any): PluginDefinition {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      publisher: row.publisher,
      description: row.description,
      permissions: JSON.parse(row.permissions ?? '[]'),
      hooks: JSON.parse(row.hooks ?? '[]'),
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
