import type { Logger } from '@vestara/logger';
import type { UserProfile, UserProfileUpdate } from '@vestara/shared';

let SQL: any = null;

async function getSql(): Promise<any> {
  if (SQL) return SQL;
  const initSqlJs = (await import('sql.js')).default;
  SQL = await initSqlJs();
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

export class SqliteUserProfileStore {
  private db: any;
  private logger?: Logger;
  private initialized = false;
  private dbPath?: string;

  constructor(options?: { dbPath?: string; logger?: Logger }) {
    this.dbPath = options?.dbPath;
    this.logger = options?.logger?.child({ component: 'user-profile-store' });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const sql = await getSql();
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
      CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY,
        name TEXT,
        role TEXT,
        experience TEXT,
        preferred_stack TEXT,
        communication_style TEXT DEFAULT 'balanced',
        goals TEXT,
        preferences TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        conversation_count INTEGER DEFAULT 0,
        last_session_id TEXT
      )
    `);
    this.initialized = true;
    this.logger?.info('UserProfileStore initialized');
  }

  async load(): Promise<UserProfile | null> {
    await this.initialize();
    const row = dbGet(this.db, 'SELECT * FROM user_profiles ORDER BY updated_at DESC LIMIT 1');
    if (!row) return null;
    return this._rowToProfile(row);
  }

  async save(profile: UserProfile): Promise<void> {
    await this.initialize();
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO user_profiles
       (id, name, role, experience, preferred_stack, communication_style, goals, preferences, created_at, updated_at, conversation_count, last_session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        profile.name ?? null,
        profile.role ?? null,
        profile.experience ?? null,
        JSON.stringify(profile.preferredStack ?? []),
        profile.communicationStyle ?? 'balanced',
        JSON.stringify(profile.goals ?? []),
        JSON.stringify(profile.preferences),
        profile.createdAt,
        profile.updatedAt,
        profile.conversationCount,
        profile.lastSessionId ?? null,
      ],
    );
    this._persist();
    this.logger?.debug('Profile saved', { id: profile.id, name: profile.name });
  }

  async update(id: string, update: UserProfileUpdate): Promise<UserProfile> {
    const existing = await this.load();
    if (!existing) throw new Error(`Profile not found: ${id}`);
    const updated: UserProfile = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    await this.save(updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    await this.initialize();
    dbRun(this.db, 'DELETE FROM user_profiles WHERE id = ?', [id]);
    this._persist();
  }

  private _persist(): void {
    if (!this.dbPath) return;
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const data = this.db.export();
      const buffer = Buffer.from(data);
      // Use sync write for simplicity — profile writes are infrequent
      const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.dbPath, buffer);
    } catch {
      // Silent fail — in-memory only
    }
  }

  private _rowToProfile(row: Record<string, unknown>): UserProfile {
    return {
      id: row.id as string,
      name: (row.name as string) ?? undefined,
      role: (row.role as string) ?? undefined,
      experience: (row.experience as string) ?? undefined,
      preferredStack: this._parseJson<string[]>(row.preferred_stack as string, []),
      communicationStyle: (row.communication_style as UserProfile['communicationStyle']) ?? 'balanced',
      goals: this._parseJson<string[]>(row.goals as string, []),
      preferences: this._parseJson<Record<string, unknown>>(row.preferences as string, {}),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      conversationCount: (row.conversation_count as number) ?? 0,
      lastSessionId: (row.last_session_id as string) ?? undefined,
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
