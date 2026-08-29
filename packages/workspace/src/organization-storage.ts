/**
 * OrganizationStorage — SQLite-backed persistence for multi-repository organizations.
 *
 * Architecture Traceability:
 *   PCS: PCS-012 — Multi-Repository Intelligence
 */

import { migrate } from '@vestara/sqlite-migrations';
import { ORGANIZATION_MANIFEST } from './scaffold-migrations';
import type { Organization, OrganizationRepository } from './types';

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

export class OrganizationStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    migrate(this.db, ORGANIZATION_MANIFEST);
  }

  async create(name: string, description: string): Promise<Organization> {
    const now = new Date().toISOString();
    const id = `org-${Date.now()}`;
    const org: Organization = { id, name, description, repositories: [], createdAt: now, updatedAt: now };
    dbRun(
      this.db,
      'INSERT INTO organizations (id, name, description, repositories, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [org.id, org.name, org.description, JSON.stringify(org.repositories), org.createdAt, org.updatedAt],
    );
    return org;
  }

  async get(id: string): Promise<Organization | null> {
    const row = dbGet(this.db, 'SELECT * FROM organizations WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToOrg(row);
  }

  async list(): Promise<Organization[]> {
    const rows = dbAll(this.db, 'SELECT * FROM organizations ORDER BY created_at DESC');
    return rows.map((r: any) => this.rowToOrg(r));
  }

  async addRepository(orgId: string, repo: OrganizationRepository): Promise<void> {
    const org = await this.get(orgId);
    if (!org) return;
    if (org.repositories.some((r) => r.path === repo.path)) return;
    org.repositories.push(repo);
    org.updatedAt = new Date().toISOString();
    dbRun(this.db, 'UPDATE organizations SET repositories = ?, updated_at = ? WHERE id = ?', [
      JSON.stringify(org.repositories),
      org.updatedAt,
      orgId,
    ]);
  }

  async addRelation(sourceRepo: string, targetRepo: string, type: string, description: string): Promise<void> {
    const id = `rel-${sourceRepo}-${targetRepo}-${type}`;
    dbRun(
      this.db,
      'INSERT OR REPLACE INTO organization_relations (id, source_repo, target_repo, type, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, sourceRepo, targetRepo, type, description, new Date().toISOString()],
    );
  }

  async getRelations(): Promise<Array<{ sourceRepo: string; targetRepo: string; type: string; description: string }>> {
    const rows = dbAll(this.db, 'SELECT * FROM organization_relations');
    return rows.map((r: any) => ({
      sourceRepo: r.source_repo,
      targetRepo: r.target_repo,
      type: r.type,
      description: r.description,
    }));
  }

  async getReposForOrg(orgId: string): Promise<OrganizationRepository[]> {
    const org = await this.get(orgId);
    return org?.repositories ?? [];
  }

  private rowToOrg(row: any): Organization {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      repositories: JSON.parse(row.repositories ?? '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
