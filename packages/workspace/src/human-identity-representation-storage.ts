import type {
  HumanIdentityRepresentation,
  HumanIdentityRepresentationInput,
  HumanIdentityRepresentationStatus,
} from './human-identity-representation';
import type { HumanPrincipalStorage } from './human-principal-storage';

function dbRun(db: any, sql: string, params: any[]): void {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function dbGet(db: any, sql: string, params: any[]): any {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function validStatus(value: unknown): value is HumanIdentityRepresentationStatus {
  return value === 'active' || value === 'unavailable';
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('preferredName is required');
  const name = value.trim();
  if (!name) throw new Error('preferredName is required');
  if (name.length > 200) throw new Error('preferredName is too long');
  return name;
}

/** API/workspace-owned persistence for one governed representation per principal. */
export class HumanIdentityRepresentationStorage {
  private readonly db: any;
  private readonly principals: HumanPrincipalStorage;

  constructor(db: any, principals: HumanPrincipalStorage) {
    this.db = db;
    this.principals = principals;
  }

  async get(principalId: string): Promise<HumanIdentityRepresentation | null> {
    const principal = await this.principals.get(principalId);
    if (!principal) return null;
    const row = dbGet(
      this.db,
      'SELECT principal_id, preferred_name, status, source, created_at, updated_at FROM human_identity_representations WHERE principal_id = ?',
      [principalId],
    );
    return row ? this.toRepresentation(row) : null;
  }

  async create(principalId: string, input: HumanIdentityRepresentationInput): Promise<HumanIdentityRepresentation> {
    const principal = await this.principals.require(principalId);
    if (principal.status !== 'active') throw new Error(`HumanPrincipal is not active: ${principalId}`);
    const preferredName = normalizeName(input.preferredName);
    const status = input.status ?? 'active';
    if (!validStatus(status)) throw new Error(`Invalid representation status: ${String(status)}`);
    const existing = dbGet(this.db, 'SELECT principal_id FROM human_identity_representations WHERE principal_id = ?', [
      principalId,
    ]);
    if (existing) throw new Error(`Human identity representation already exists: ${principalId}`);
    const now = new Date().toISOString();
    dbRun(
      this.db,
      `INSERT INTO human_identity_representations
       (principal_id, preferred_name, status, source, created_at, updated_at)
       VALUES (?, ?, ?, 'explicit', ?, ?)`,
      [principalId, preferredName, status, now, now],
    );
    return { principalId, preferredName, status, source: 'explicit', createdAt: now, updatedAt: now };
  }

  async update(principalId: string, input: HumanIdentityRepresentationInput): Promise<HumanIdentityRepresentation> {
    const principal = await this.principals.require(principalId);
    if (principal.status !== 'active') throw new Error(`HumanPrincipal is not active: ${principalId}`);
    const preferredName = normalizeName(input.preferredName);
    const status = input.status ?? 'active';
    if (!validStatus(status)) throw new Error(`Invalid representation status: ${String(status)}`);
    const existing = dbGet(this.db, 'SELECT created_at FROM human_identity_representations WHERE principal_id = ?', [
      principalId,
    ]);
    if (!existing) throw new Error(`Human identity representation not found: ${principalId}`);
    const now = new Date().toISOString();
    dbRun(
      this.db,
      'UPDATE human_identity_representations SET preferred_name = ?, status = ?, updated_at = ? WHERE principal_id = ?',
      [preferredName, status, now, principalId],
    );
    return {
      principalId,
      preferredName,
      status,
      source: 'explicit',
      createdAt: existing.created_at as string,
      updatedAt: now,
    };
  }

  private toRepresentation(row: Record<string, unknown>): HumanIdentityRepresentation {
    return {
      principalId: row.principal_id as string,
      preferredName: row.preferred_name as string,
      status: row.status as HumanIdentityRepresentationStatus,
      source: 'explicit',
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
