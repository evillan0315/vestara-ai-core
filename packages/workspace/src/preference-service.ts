/**
 * PreferenceService — User preferences persisted across sessions.
 *
 * Remembers user choices: default provider, preferred panels,
 * theme, workflow preferences, and agent selections.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Persistence Model
 */

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

const DEFAULTS: Record<string, string> = {
  provider: 'opencode',
  model: 'deepseek-v4-flash-free',
  theme: 'dark',
  panels: 'dashboard,repository',
  autoIndex: 'true',
  showWelcomeTour: 'true',
  defaultAgent: 'architect',
  verifyOnImplement: 'true',
  predictBeforePlan: 'false',
};

export class PreferenceService {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);
    // Seed defaults
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const existing = dbGet(this.db, 'SELECT value FROM preferences WHERE key = ?', [key]);
      if (!existing) {
        dbRun(this.db, 'INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)', [
          key,
          value,
          new Date().toISOString(),
        ]);
      }
    }
  }

  get(key: string): string {
    const row = dbGet(this.db, 'SELECT value FROM preferences WHERE key = ?', [key]);
    return row?.value ?? DEFAULTS[key] ?? '';
  }

  set(key: string, value: string): void {
    dbRun(this.db, 'INSERT OR REPLACE INTO preferences (key, value, updated_at) VALUES (?, ?, ?)', [
      key,
      value,
      new Date().toISOString(),
    ]);
    // Notify any persist callback
    this._onChange?.();
  }

  private _onChange?: () => void;

  onPersist(fn: () => void): void {
    this._onChange = fn;
  }

  getAll(): Record<string, string> {
    const rows = dbAll(this.db, 'SELECT key, value FROM preferences ORDER BY key');
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  getBoolean(key: string): boolean {
    return this.get(key) === 'true';
  }

  reset(key: string): void {
    if (key in DEFAULTS) {
      this.set(key, DEFAULTS[key]);
    }
  }

  renderAll(): string {
    const all = this.getAll();
    const lines: string[] = ['Preferences:'];
    for (const [key, value] of Object.entries(all)) {
      const isDefault = DEFAULTS[key] === value;
      lines.push(`  ${key.padEnd(25)} ${value}${isDefault ? '' : ' *'}`);
    }
    return lines.join('\n');
  }
}
