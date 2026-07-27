/**
 * EnterpriseService — Enterprise organizational features.
 *
 * Teams, projects, RBAC, approval policies, and audit compliance.
 *
 * Architecture Traceability:
 *   PCS: PCS-013 — Enterprise Organizations
 */

import type { EnterpriseStorage } from './enterprise-storage';
import type { ApprovalPolicy, AuditEvent, EnterpriseProject, Team } from './types';

export class EnterpriseService {
  private storage: EnterpriseStorage;

  constructor(opts: { storage: EnterpriseStorage }) {
    this.storage = opts.storage;
  }

  // --- Teams ---

  async createTeam(name: string, description: string): Promise<Team> {
    const team = await this.storage.createTeam(name, description);
    await this.storage.logAudit('system', 'team.created', team.id, `Team created: ${name}`);
    return team;
  }

  async listTeams(): Promise<Team[]> {
    return this.storage.listTeams();
  }

  // --- Projects ---

  async createProject(name: string, goal: string): Promise<EnterpriseProject> {
    const project = await this.storage.createProject(name, goal);
    await this.storage.logAudit('system', 'project.created', project.id, `Project created: ${name}`);
    return project;
  }

  async listProjects(): Promise<EnterpriseProject[]> {
    return this.storage.listProjects();
  }

  // --- Policies ---

  async listPolicies(): Promise<ApprovalPolicy[]> {
    return this.storage.listPolicies();
  }

  // --- Audit ---

  async getAuditLog(limit = 50): Promise<AuditEvent[]> {
    return this.storage.getAuditLog(limit);
  }

  async logAudit(actor: string, action: string, resource: string, details: string): Promise<void> {
    await this.storage.logAudit(actor, action, resource, details);
  }

  // --- Overview ---

  async getOverview(): Promise<{ teams: number; projects: number; policies: number; audits: number }> {
    const teams = (await this.storage.listTeams()).length;
    const projects = (await this.storage.listProjects()).length;
    const policies = (await this.storage.listPolicies()).length;
    const audits = (await this.storage.getAuditLog(1000)).length;
    return { teams, projects, policies, audits };
  }

  // --- Rendering ---

  renderOverview(overview: { teams: number; projects: number; policies: number; audits: number }): string {
    const lines: string[] = [];
    lines.push('Enterprise Overview');
    lines.push(`  Teams:    ${overview.teams}`);
    lines.push(`  Projects: ${overview.projects}`);
    lines.push(`  Policies: ${overview.policies}`);
    lines.push(`  Audit Events: ${overview.audits}`);
    return lines.join('\n');
  }

  renderTeams(teams: Team[]): string {
    if (teams.length === 0) return 'No teams.';
    const lines: string[] = ['Teams:'];
    for (const t of teams) {
      lines.push(`  • ${t.name} (${t.role}) — ${t.members.length} members`);
    }
    return lines.join('\n');
  }

  renderProjects(projects: EnterpriseProject[]): string {
    if (projects.length === 0) return 'No projects.';
    const lines: string[] = ['Projects:'];
    for (const p of projects) {
      lines.push(`  • ${p.name} [${p.status}] — ${p.repositories.length} repos`);
    }
    return lines.join('\n');
  }

  renderPolicies(policies: ApprovalPolicy[]): string {
    if (policies.length === 0) return 'No policies.';
    const lines: string[] = ['Approval Policies:'];
    for (const p of policies) {
      lines.push(`  • ${p.name} — ${p.artifactType}, ${p.requiredApprovers} approver(s), roles: ${p.roles.join(', ')}`);
    }
    return lines.join('\n');
  }

  renderAuditLog(events: AuditEvent[]): string {
    if (events.length === 0) return 'No audit events.';
    const lines: string[] = ['Audit Log (most recent):'];
    for (const e of events.slice(0, 20)) {
      lines.push(`  [${e.timestamp}] ${e.actor} — ${e.action} — ${e.resource}`);
    }
    return lines.join('\n');
  }
}
