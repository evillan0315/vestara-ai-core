/**
 * EnterpriseStorage — SQLite-backed persistence for enterprise features.
 *
 * Architecture Traceability:
 *   PCS: PCS-013 — Enterprise Organizations
 */

import { migrate } from '@vestara/sqlite-migrations';
import { ENTERPRISE_MANIFEST } from './scaffold-migrations';
import type { ApprovalPolicy, AuditEvent, EnterpriseProject, Team } from './types';

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

export class EnterpriseStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
    this.seedDefaults();
  }

  private ensureSchema(): void {
    migrate(this.db, ENTERPRISE_MANIFEST);
  }

  private seedDefaults(): void {
    const existing = dbGet(this.db, 'SELECT COUNT(*) as c FROM approval_policies');
    if (existing && existing.c > 0) return;
    const now = new Date().toISOString();
    const defaults: ApprovalPolicy[] = [
      {
        id: 'policy-default-plan',
        name: 'Plan Approval',
        artifactType: 'plan',
        requiredApprovers: 1,
        roles: ['admin', 'engineer'],
        createdAt: now,
      },
      {
        id: 'policy-default-cs',
        name: 'Change Set Approval',
        artifactType: 'changeset',
        requiredApprovers: 1,
        roles: ['admin'],
        createdAt: now,
      },
      {
        id: 'policy-default-verification',
        name: 'Verification Review',
        artifactType: 'verification',
        requiredApprovers: 1,
        roles: ['admin'],
        createdAt: now,
      },
    ];
    for (const p of defaults) {
      dbRun(
        this.db,
        'INSERT INTO approval_policies (id, name, artifact_type, required_approvers, roles, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [p.id, p.name, p.artifactType, p.requiredApprovers, JSON.stringify(p.roles), p.createdAt],
      );
    }
  }

  // --- Teams ---

  async createTeam(name: string, description: string): Promise<Team> {
    const now = new Date().toISOString();
    const id = `team-${Date.now()}`;
    dbRun(this.db, 'INSERT INTO teams (id, name, description, members, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      id,
      name,
      description,
      '[]',
      'engineer',
      now,
    ]);
    return { id, name, description, members: [], role: 'engineer', createdAt: now };
  }

  async listTeams(): Promise<Team[]> {
    return dbAll(this.db, 'SELECT * FROM teams ORDER BY created_at DESC').map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      members: JSON.parse(r.members ?? '[]'),
      role: r.role,
      createdAt: r.created_at,
    }));
  }

  // --- Projects ---

  async createProject(name: string, goal: string): Promise<EnterpriseProject> {
    const now = new Date().toISOString();
    const id = `proj-${Date.now()}`;
    dbRun(
      this.db,
      'INSERT INTO enterprise_projects (id, name, goal, repositories, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, goal, '[]', 'active', now],
    );
    return { id, name, goal, repositories: [], status: 'active', createdAt: now };
  }

  async listProjects(): Promise<EnterpriseProject[]> {
    return dbAll(this.db, 'SELECT * FROM enterprise_projects ORDER BY created_at DESC').map((r: any) => ({
      id: r.id,
      name: r.name,
      goal: r.goal,
      repositories: JSON.parse(r.repositories ?? '[]'),
      status: r.status,
      createdAt: r.created_at,
    }));
  }

  // --- Policies ---

  async listPolicies(): Promise<ApprovalPolicy[]> {
    return dbAll(this.db, 'SELECT * FROM approval_policies ORDER BY created_at ASC').map((r: any) => ({
      id: r.id,
      name: r.name,
      artifactType: r.artifact_type,
      requiredApprovers: r.required_approvers,
      roles: JSON.parse(r.roles ?? '[]'),
      createdAt: r.created_at,
    }));
  }

  // --- Audit ---

  async logAudit(actor: string, action: string, resource: string, details: string): Promise<void> {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dbRun(
      this.db,
      'INSERT INTO audit_events (id, actor, action, resource, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, actor, action, resource, details, new Date().toISOString()],
    );
  }

  async getAuditLog(limit = 50): Promise<AuditEvent[]> {
    return dbAll(this.db, 'SELECT * FROM audit_events ORDER BY timestamp DESC LIMIT ?', [limit]).map((r: any) => ({
      id: r.id,
      actor: r.actor,
      action: r.action,
      resource: r.resource,
      details: r.details,
      timestamp: r.timestamp,
    }));
  }
}
