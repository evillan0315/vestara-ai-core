/**
 * UserStore — SQLite-backed user and API token storage.
 *
 * Each user has an API token used for Bearer auth.
 * A default admin user is seeded on first boot.
 * API keys can also be set via VESTARA_API_KEY env var.
 */

import * as crypto from 'node:crypto';
import { hashPassword, verifyPassword as verifyPasswordHash } from './password-crypto.js';

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'editor' | 'viewer';
  token: string;
  createdAt: string;
  /** True when a password is set (hash presence only — never the hash). */
  hasPassword: boolean;
  /** True when TOTP MFA is enrolled and enforced. */
  mfaEnrolled: boolean;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    username: row.username as string,
    role: row.role as User['role'],
    token: row.token as string,
    createdAt: row.created_at as string,
    hasPassword: (row.has_password as number | null) === 1,
    mfaEnrolled: (row.mfa_enrolled as number | null) === 1,
  };
}

const USER_COLUMNS =
  'id, username, role, token, created_at, (password_hash IS NOT NULL) AS has_password, ' +
  '(totp_secret IS NOT NULL AND mfa_enrolled_at IS NOT NULL) AS mfa_enrolled';

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
      console.log(
        `[UserStore] No VESTARA_API_KEY set. One-time generated admin token (shown once, then only in the database): ${token}`,
      );
    }
  }

  /** Look up a user by API token. Returns undefined if not found. */
  findByToken(token: string): User | undefined {
    const stmt = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE token = ?`);
    stmt.bind([token]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return rowToUser(row);
    }
    stmt.free();
    return undefined;
  }

  /** Look up a user by ID. */
  findById(id: string): User | undefined {
    const stmt = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`);
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return rowToUser(row);
    }
    stmt.free();
    return undefined;
  }

  /** Look up a user by username. */
  findByUsername(username: string): User | undefined {
    const stmt = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`);
    stmt.bind([username]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return rowToUser(row);
    }
    stmt.free();
    return undefined;
  }

  /** List all users. */
  listAll(): User[] {
    const users: User[] = [];
    const stmt = this.db.prepare(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_at ASC`);
    while (stmt.step()) {
      users.push(rowToUser(stmt.getAsObject()));
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

    return { id, username, role, token, createdAt: now, hasPassword: false, mfaEnrolled: false };
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

  /** Change a user's role. Returns the updated user, or undefined if not found. */
  updateRole(id: string, role: User['role']): User | undefined {
    const user = this.findById(id);
    if (!user) return undefined;

    const stmt = this.db.prepare('UPDATE users SET role = ? WHERE id = ?');
    stmt.run([role, id]);
    stmt.free();
    return { ...user, role };
  }

  /** Set a user's password (scrypt hash). Returns false when the user is missing. */
  async setPassword(id: string, password: string): Promise<boolean> {
    if (!this.findById(id)) return false;
    const stmt = this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    stmt.run([await hashPassword(password), id]);
    stmt.free();
    return true;
  }

  /** Verify a user's password. False when missing, unset, or mismatched. */
  async verifyPassword(id: string, password: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT password_hash FROM users WHERE id = ?');
    stmt.bind([id]);
    let hash: unknown;
    if (stmt.step()) hash = stmt.getAsObject().password_hash;
    stmt.free();
    if (typeof hash !== 'string' || !hash) return false;
    return verifyPasswordHash(password, hash);
  }

  /** Remove a user's password. Returns false when the user is missing. */
  clearPassword(id: string): boolean {
    if (!this.findById(id)) return false;
    const stmt = this.db.prepare('UPDATE users SET password_hash = NULL WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    return true;
  }

  /** Stage an encrypted TOTP secret (enrollment starts, not yet enforced). */
  setTotpSecret(id: string, encryptedSecret: string): boolean {
    if (!this.findById(id)) return false;
    const stmt = this.db.prepare('UPDATE users SET totp_secret = ?, mfa_enrolled_at = NULL WHERE id = ?');
    stmt.run([encryptedSecret, id]);
    stmt.free();
    return true;
  }

  /** Read the encrypted TOTP secret staged or enrolled for a user. */
  getTotpSecret(id: string): string | null {
    const stmt = this.db.prepare('SELECT totp_secret FROM users WHERE id = ?');
    stmt.bind([id]);
    let secret: unknown;
    if (stmt.step()) secret = stmt.getAsObject().totp_secret;
    stmt.free();
    return typeof secret === 'string' && secret ? secret : null;
  }

  /** Mark MFA enrolled (enforcement starts). Returns false when nothing staged. */
  confirmTotp(id: string): boolean {
    if (!this.getTotpSecret(id)) return false;
    const stmt = this.db.prepare("UPDATE users SET mfa_enrolled_at = datetime('now') WHERE id = ?");
    stmt.run([id]);
    stmt.free();
    return true;
  }

  /** Store hashed single-use backup codes (replaces any previous set). */
  setBackupCodes(id: string, digests: string[]): boolean {
    if (!this.findById(id)) return false;
    const stmt = this.db.prepare('UPDATE users SET backup_codes = ? WHERE id = ?');
    stmt.run([JSON.stringify(digests), id]);
    stmt.free();
    return true;
  }

  /** Burn one backup code by digest. True when a code was consumed. */
  consumeBackupCode(id: string, digest: string): boolean {
    const stmt = this.db.prepare('SELECT backup_codes FROM users WHERE id = ?');
    stmt.bind([id]);
    let raw: unknown;
    if (stmt.step()) raw = stmt.getAsObject().backup_codes;
    stmt.free();
    if (typeof raw !== 'string' || !raw) return false;
    let digests: unknown;
    try {
      digests = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!Array.isArray(digests)) return false;
    const remaining = digests.filter((entry) => entry !== digest);
    if (remaining.length === digests.length) return false;
    const update = this.db.prepare('UPDATE users SET backup_codes = ? WHERE id = ?');
    update.run([JSON.stringify(remaining), id]);
    update.free();
    return true;
  }

  /** Wipe all MFA state (secret, codes, enrollment). Returns false when missing. */
  resetMfa(id: string): boolean {
    if (!this.findById(id)) return false;
    const stmt = this.db.prepare(
      'UPDATE users SET totp_secret = NULL, backup_codes = NULL, mfa_enrolled_at = NULL WHERE id = ?',
    );
    stmt.run([id]);
    stmt.free();
    return true;
  }

  /** Delete a user (tokens die with the row). Returns true when a row was removed. */
  deleteUser(id: string): boolean {
    if (!this.findById(id)) return false;

    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    stmt.run([id]);
    stmt.free();
    return true;
  }
}
