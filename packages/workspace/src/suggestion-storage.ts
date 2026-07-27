export class SuggestionStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dismissed_suggestions (
        id TEXT PRIMARY KEY,
        dismissed_at TEXT NOT NULL,
        reason TEXT DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS suggestion_feedback (
        id TEXT PRIMARY KEY,
        suggestion_id TEXT,
        action TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  async isDismissed(id: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM dismissed_suggestions WHERE id = ?');
    stmt.bind([id]);
    const r = stmt.step();
    stmt.free();
    return r;
  }

  async dismiss(id: string, reason?: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO dismissed_suggestions (id, dismissed_at, reason) VALUES (?, ?, ?)',
    );
    stmt.bind([id, new Date().toISOString(), reason ?? '']);
    stmt.step();
    stmt.free();
  }

  async trackAction(suggestionId: string, action: string): Promise<void> {
    const stmt = this.db.prepare(
      'INSERT INTO suggestion_feedback (id, suggestion_id, action, created_at) VALUES (?, ?, ?, ?)',
    );
    stmt.bind([`sf-${Date.now()}`, suggestionId, action, new Date().toISOString()]);
    stmt.step();
    stmt.free();
  }

  async clearDismissed(): Promise<void> {
    this.db.exec('DELETE FROM dismissed_suggestions');
  }
}
