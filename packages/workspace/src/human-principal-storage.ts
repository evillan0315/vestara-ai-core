/**
 * HumanPrincipalStorage — SQLite-backed persistence for canonical human identity.
 *
 * Scope rules (HUMAN-CONTEXT-002):
 * - Every read is principalId-scoped. No latest-row / single-human queries.
 * - Schema is owned by the migration chain (`workspace-migrations.ts`);
 *   this constructor never mutates schema.
 * - Only identity columns persist: id, status, created_at, updated_at.
 *   Presentation (displayName/avatar), profile, membership, roles, authority
 *   grants must never be added here — see `human-principal.ts` invariants.
 * - All SQL is parameterized (prepare + bind, no interpolation).
 */

import * as crypto from 'node:crypto';
import type {
  HumanCredentialBinding,
  HumanExternalIdentity,
  HumanPrincipal,
  HumanPrincipalInput,
  HumanPrincipalStatus,
} from './human-principal';
import { isHumanPrincipalStatus } from './human-principal';

function dbRun(db: any, sql: string, params?: any[]): void {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params?: any[]): any {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function dbAll(db: any, sql: string, params?: any[]): any[] {
  const results: any[] = [];
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function genId(): string {
  return `hp-${crypto.randomBytes(8).toString('hex')}`;
}

export class HumanPrincipalConflictError extends Error {
  readonly code = 'HUMAN_PRINCIPAL_CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'HumanPrincipalConflictError';
  }
}

export class HumanPrincipalNotFoundError extends Error {
  readonly code = 'HUMAN_PRINCIPAL_NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'HumanPrincipalNotFoundError';
  }
}

export class HumanPrincipalStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    // Schema is owned by the migration chain (workspace-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  // ─── Principals ──────────────────────────────────────────────

  async create(input: HumanPrincipalInput = {}): Promise<HumanPrincipal> {
    const status: HumanPrincipalStatus = input.status ?? 'active';
    if (!isHumanPrincipalStatus(status)) throw new Error(`Invalid principal status: ${String(status)}`);
    const now = new Date().toISOString();
    const principal: HumanPrincipal = { id: genId(), status, createdAt: now, updatedAt: now };
    dbRun(this.db, 'INSERT INTO human_principals (id, status, created_at, updated_at) VALUES (?, ?, ?, ?)', [
      principal.id,
      principal.status,
      principal.createdAt,
      principal.updatedAt,
    ]);
    return principal;
  }

  async get(principalId: string): Promise<HumanPrincipal | null> {
    const row = dbGet(this.db, 'SELECT id, status, created_at, updated_at FROM human_principals WHERE id = ?', [
      principalId,
    ]);
    return row ? this._rowToPrincipal(row) : null;
  }

  async require(principalId: string): Promise<HumanPrincipal> {
    const principal = await this.get(principalId);
    if (!principal) throw new HumanPrincipalNotFoundError(`HumanPrincipal not found: ${principalId}`);
    return principal;
  }

  async list(): Promise<HumanPrincipal[]> {
    const rows = dbAll(
      this.db,
      'SELECT id, status, created_at, updated_at FROM human_principals ORDER BY created_at ASC',
    );
    return rows.map((row) => this._rowToPrincipal(row));
  }

  async updateStatus(principalId: string, status: HumanPrincipalStatus): Promise<HumanPrincipal> {
    if (!isHumanPrincipalStatus(status)) throw new Error(`Invalid principal status: ${String(status)}`);
    await this.require(principalId);
    const now = new Date().toISOString();
    dbRun(this.db, 'UPDATE human_principals SET status = ?, updated_at = ? WHERE id = ?', [status, now, principalId]);
    return this.require(principalId);
  }

  // ─── External identities ─────────────────────────────────────
  //
  // Deterministic conflict rule: (provider, subject) is globally unique.
  // Re-linking to the SAME principal is idempotent. Re-linking to a
  // DIFFERENT principal throws HumanPrincipalConflictError — linkage is
  // never silently moved (unlink-then-relink is explicit, a future UIM-003
  // concern, not silent reassignment here).

  async linkExternalIdentity(principalId: string, provider: string, subject: string): Promise<HumanExternalIdentity> {
    await this.require(principalId);
    if (!provider || !subject) throw new Error('provider and subject are required');
    const existing = dbGet(
      this.db,
      'SELECT provider, subject, principal_id, linked_at FROM human_external_identities WHERE provider = ? AND subject = ?',
      [provider, subject],
    );
    if (existing) {
      if (existing.principal_id === principalId) {
        return this._rowToExternalIdentity(existing);
      }
      throw new HumanPrincipalConflictError(
        `External identity ${provider}:${subject} is already linked to principal ${existing.principal_id}`,
      );
    }
    const now = new Date().toISOString();
    dbRun(
      this.db,
      'INSERT INTO human_external_identities (provider, subject, principal_id, linked_at) VALUES (?, ?, ?, ?)',
      [provider, subject, principalId, now],
    );
    return { provider, subject, principalId, linkedAt: now };
  }

  async listExternalIdentities(principalId: string): Promise<HumanExternalIdentity[]> {
    await this.require(principalId);
    const rows = dbAll(
      this.db,
      'SELECT provider, subject, principal_id, linked_at FROM human_external_identities WHERE principal_id = ? ORDER BY linked_at ASC',
      [principalId],
    );
    return rows.map((row) => this._rowToExternalIdentity(row));
  }

  async findPrincipalByExternalIdentity(provider: string, subject: string): Promise<HumanPrincipal | null> {
    const row = dbGet(
      this.db,
      'SELECT provider, subject, principal_id, linked_at FROM human_external_identities WHERE provider = ? AND subject = ?',
      [provider, subject],
    );
    if (!row) return null;
    return this.get(row.principal_id as string);
  }

  // ─── Credential bindings ─────────────────────────────────────
  //
  // credentialId is an opaque handle (e.g. users.id). Secrets never land
  // here. One credential binds at most one principal; rebinding is explicit
  // (unbind then bind) so resolution stays deterministic.

  async bindCredential(credentialId: string, principalId: string): Promise<HumanCredentialBinding> {
    await this.require(principalId);
    if (!credentialId) throw new Error('credentialId is required');
    const existing = dbGet(
      this.db,
      'SELECT credential_id, principal_id, created_at FROM human_credential_bindings WHERE credential_id = ?',
      [credentialId],
    );
    if (existing) {
      if (existing.principal_id === principalId) {
        return this._rowToBinding(existing);
      }
      throw new HumanPrincipalConflictError(
        `Credential ${credentialId} is already bound to principal ${existing.principal_id}`,
      );
    }
    const now = new Date().toISOString();
    dbRun(this.db, 'INSERT INTO human_credential_bindings (credential_id, principal_id, created_at) VALUES (?, ?, ?)', [
      credentialId,
      principalId,
      now,
    ]);
    return { credentialId, principalId, createdAt: now };
  }

  async unbindCredential(credentialId: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM human_credential_bindings WHERE credential_id = ?', [credentialId]);
  }

  async resolvePrincipalForCredential(credentialId: string): Promise<HumanPrincipal | null> {
    const row = dbGet(
      this.db,
      'SELECT credential_id, principal_id, created_at FROM human_credential_bindings WHERE credential_id = ?',
      [credentialId],
    );
    if (!row) return null;
    return this.get(row.principal_id as string);
  }

  // ─── Row mapping ─────────────────────────────────────────────

  private _rowToPrincipal(row: Record<string, unknown>): HumanPrincipal {
    const status = row.status as string;
    if (!isHumanPrincipalStatus(status)) throw new Error(`Corrupt principal status in store: ${String(status)}`);
    return {
      id: row.id as string,
      status,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  private _rowToExternalIdentity(row: Record<string, unknown>): HumanExternalIdentity {
    return {
      provider: row.provider as string,
      subject: row.subject as string,
      principalId: row.principal_id as string,
      linkedAt: row.linked_at as string,
    };
  }

  private _rowToBinding(row: Record<string, unknown>): HumanCredentialBinding {
    return {
      credentialId: row.credential_id as string,
      principalId: row.principal_id as string,
      createdAt: row.created_at as string,
    };
  }
}
