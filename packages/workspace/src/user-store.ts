/**
 * UserStore — SQLite-backed user and API token storage.
 *
 * Each user has an API token used for Bearer auth.
 * A default admin user is seeded on first boot.
 * API keys can also be set via VESTARA_API_KEY env var.
 */

import * as crypto from 'node:crypto';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  token: string;
  createdAt: string;
}

export class UserStore {
  private db: any;

  constructor(db: any) {
    this.db = db;
    // Schema is owned by the migration chain (workspace-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
    this.seedDefaultUser();
  }

  private seedDefaultUser(): void {
    const existing = this.db.exec('SELECT COUNT(*) as count FROM users');
    const count = existing?.[0]?.values?.[0]?.[0] ?? 0;
    if (count > 0) return;

    // Check env for configured API key, otherwise generate one
    const envKey = process.env.VESTARA_API_KEY;
    const token = envKey || `vst_${crypto.randomBytes(24).toString('hex')}`;

    const stmt = this.db.prepare('INSERT INTO users (id, username, role, token, created_at) VALUES (?, ?, ?, ?, ?)');
    stmt.run(['user-admin', 'admin', 'admin', token, new Date().toISOString()]);
    stmt.free();

    if (!envKey) {
      console.log(`[UserStore] No VESTARA_API_KEY set. Generated admin token: ${token}`);
    }
  }

  /** Look up a user by API token. Returns undefined if not found. */
  findByToken(token: string): User | undefined {
    const stmt = this.db.prepare('SELECT id, username, role, token, created_at FROM users WHERE token = ?');
    stmt.bind([token]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        id: row.id as string,
        username: row.username as string,
        role: row.role as User['role'],
        token: row.token as string,
        createdAt: row.created_at as string,
      };
    }
    stmt.free();
    return undefined;
  }

  /** Look up a user by ID. */
  findById(id: string): User | undefined {
    const stmt = this.db.prepare('SELECT id, username, role, token, created_at FROM users WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return {
        id: row.id as string,
        username: row.username as string,
        role: row.role as User['role'],
        token: row.token as string,
        createdAt: row.created_at as string,
      };
    }
    stmt.free();
    return undefined;
  }

  /** List all users. */
  listAll(): User[] {
    const users: User[] = [];
    const stmt = this.db.prepare('SELECT id, username, role, token, created_at FROM users ORDER BY created_at ASC');
    while (stmt.step()) {
      const row = stmt.getAsObject();
      users.push({
        id: row.id as string,
        username: row.username as string,
        role: row.role as User['role'],
        token: row.token as string,
        createdAt: row.created_at as string,
      });
    }
    stmt.free();
    return users;
  }

  /** Create a new user with a generated token. */
  createUser(username: string, role: User['role'] = 'editor'): User {
    const id = `user-${crypto.randomBytes(8).toString('hex')}`;
    const token = `vst_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    const stmt = this.db.prepare('INSERT INTO users (id, username, role, token, created_at) VALUES (?, ?, ?, ?, ?)');
    stmt.run([id, username, role, token, now]);
    stmt.free();

    return { id, username, role, token, createdAt: now };
  }

  /** Rotate a user's API token. Returns the new token. */
  rotateToken(id: string): string | undefined {
    const user = this.findById(id);
    if (!user) return undefined;

    const newToken = `vst_${crypto.randomBytes(24).toString('hex')}`;
    const stmt = this.db.prepare('UPDATE users SET token = ? WHERE id = ?');
    stmt.run([newToken, id]);
    stmt.free();
    return newToken;
  }
}
