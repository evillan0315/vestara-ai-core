import type {
  AgentDefinition,
  AgentExecution,
  AgentExecutionStatus,
  AgentMemoryEntry,
  AgentTeam,
  ExecutionSession,
} from './types';

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

let execCounter = 0;

export class AgentStorage {
  private db: any;

  constructor(db: any) {
    // Schema evolution is owned by the migration chain, executed by each
    // entrypoint's composition root (API workspace-context, CLI openSharedDb)
    // BEFORE any storage constructs. AgentStorage does not mutate schema.
    this.db = db;
    this.seedBuiltIn();
  }

  private seedBuiltIn(): void {
    const existing = dbGet(this.db, 'SELECT COUNT(*) as c FROM agents');
    if (existing && existing.c > 0) return;

    const now = new Date().toISOString();
    const builtIn: AgentDefinition[] = [
      {
        id: 'agent-architect',
        name: 'Architect',
        role: 'architect',
        agentType: 'workspace',
        description: 'Architecture analysis, design review, dependency analysis',
        capabilities: ['architecture-analysis', 'design-review', 'dependency-analysis'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
          { resource: 'plan', action: 'create', approvalRequired: true },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#8b5cf6',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-developer',
        name: 'Developer',
        role: 'developer',
        agentType: 'workspace',
        description: 'Code generation, refactoring, bug fixing',
        capabilities: ['code-generation', 'refactoring', 'bug-fixing'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'repository', action: 'modify', approvalRequired: false },
          { resource: 'plan', action: 'read', approvalRequired: false },
          { resource: 'changeset', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#3b82f6',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-verifier',
        name: 'Verifier',
        role: 'verifier',
        agentType: 'workspace',
        description: 'Testing, diagnostics, quality analysis',
        capabilities: ['testing', 'diagnostics', 'quality-analysis'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'changeset', action: 'read', approvalRequired: false },
          { resource: 'verification', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#10b981',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-documenter',
        name: 'Documenter',
        role: 'documenter',
        agentType: 'workspace',
        description: 'Documentation, summarization, knowledge management',
        capabilities: ['documentation', 'summarization', 'knowledge-management'],
        permissions: [
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#f59e0b',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-dashboard-curator',
        name: 'Dashboard Curator',
        role: 'dashboard-curator',
        agentType: 'workspace',
        description:
          'Monitors workspace development progress, auto-advances milestones, updates the dashboard with feature detection and velocity tracking',
        capabilities: [
          'dashboard-monitoring',
          'progress-tracking',
          'milestone-management',
          'feature-detection',
          'development-velocity',
          'summarization',
          'knowledge-management',
        ],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
          { resource: 'plan', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#06b6d4',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-dashboard-dev',
        name: 'Dashboard Developer',
        role: 'frontend',
        agentType: 'workspace',
        description:
          'Builds and maintains the Workspace Dashboard UI with React, Tailwind CSS, real-time data visualization, and activity stream integration',
        capabilities: [
          'react-development',
          'ui-development',
          'tailwind-css',
          'dashboard-design',
          'data-visualization',
          'code-generation',
          'refactoring',
          'testing',
        ],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'repository', action: 'modify', approvalRequired: false },
          { resource: 'changeset', action: 'create', approvalRequired: false },
          { resource: 'plan', action: 'create', approvalRequired: true },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#ec4899',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-conversation-dev',
        name: 'Conversation Developer',
        role: 'conversation',
        agentType: 'workspace',
        description:
          'Designs and develops conversational onboarding flows, voice interaction pipelines, STT/TTS integration, and user profile enrichment',
        capabilities: [
          'conversation-design',
          'voice-ux',
          'prompt-engineering',
          'stt-integration',
          'tts-integration',
          'vad-integration',
          'audio-pipeline',
          'code-generation',
          'testing',
        ],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'repository', action: 'modify', approvalRequired: false },
          { resource: 'changeset', action: 'create', approvalRequired: false },
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
          { resource: 'plan', action: 'create', approvalRequired: true },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#6366f1',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-planner',
        name: 'Planner',
        role: 'planning',
        agentType: 'workspace',
        description: 'Transforms goals into structured plans with tasks, milestones, and resource estimates',
        capabilities: [
          'planning',
          'dependency-analysis',
          'architecture-analysis',
          'summarization',
          'knowledge-management',
        ],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
          { resource: 'plan', action: 'create', approvalRequired: true },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#eab308',
        status: 'active',
        createdAt: now,
      },
      // ── Specialized Engineering Agents ──
      {
        id: 'agent-analyst',
        name: 'Repository Analyst',
        role: 'analyst',
        agentType: 'workspace',
        description: 'Deep repository understanding, codebase insights, dependency mapping',
        capabilities: ['architecture-analysis', 'dependency-analysis', 'quality-analysis'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#8b5cf6',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-reviewer',
        name: 'Reviewer',
        role: 'reviewer',
        agentType: 'workspace',
        description: 'Code review, change set validation, quality gate enforcement',
        capabilities: ['design-review', 'quality-analysis', 'testing'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'changeset', action: 'read', approvalRequired: false },
          { resource: 'verification', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#10b981',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-tester',
        name: 'Tester',
        role: 'tester',
        agentType: 'workspace',
        description: 'Test generation, test execution, coverage analysis',
        capabilities: ['testing', 'diagnostics', 'quality-analysis'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'changeset', action: 'read', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#06b6d4',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-security',
        name: 'Security Agent',
        role: 'security-agent',
        agentType: 'workspace',
        description: 'Security analysis, vulnerability detection, compliance checking',
        capabilities: ['security-analysis'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#ef4444',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-performance',
        name: 'Performance Agent',
        role: 'performance-agent',
        agentType: 'workspace',
        description: 'Performance optimization, benchmarking, bottleneck detection',
        capabilities: ['performance-optimization'],
        permissions: [{ resource: 'repository', action: 'read', approvalRequired: false }],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#f59e0b',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-documentation',
        name: 'Documentation Agent',
        role: 'documentation-agent',
        agentType: 'workspace',
        description: 'API documentation, guide generation, knowledge base maintenance',
        capabilities: ['documentation', 'summarization', 'knowledge-management'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'read', approvalRequired: false },
          { resource: 'knowledge', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#22c55e',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-refactoring',
        name: 'Refactoring Agent',
        role: 'refactoring-agent',
        agentType: 'workspace',
        description: 'Code quality improvement, technical debt reduction, pattern migration',
        capabilities: ['refactoring', 'architecture-analysis', 'quality-analysis'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'repository', action: 'modify', approvalRequired: false },
          { resource: 'changeset', action: 'create', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#ec4899',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-release',
        name: 'Release Agent',
        role: 'release-agent',
        agentType: 'workspace',
        description: 'Release management, versioning, changelog generation, deployment coordination',
        capabilities: ['release-management', 'summarization', 'knowledge-management'],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'changeset', action: 'read', approvalRequired: false },
          { resource: 'verification', action: 'read', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#a78bfa',
        status: 'active',
        createdAt: now,
      },
      {
        id: 'agent-workspace-ui-tester',
        name: 'Workspace UI Tester',
        role: 'continuous-tester',
        agentType: 'workspace',
        description:
          'Monitors workspace-ui file changes and milestone updates, then runs pnpm test + build automatically',
        capabilities: [
          'testing',
          'diagnostics',
          'quality-analysis',
          'development-velocity',
          'dashboard-monitoring',
          'ci-integration',
        ],
        permissions: [
          { resource: 'repository', action: 'read', approvalRequired: false },
          { resource: 'changeset', action: 'read', approvalRequired: false },
        ],
        provider: 'opencode',
        model: 'deepseek-v4-flash-free',
        color: '#14b8a6',
        status: 'active',
        createdAt: now,
      },
    ];

    for (const agent of builtIn) {
      this.saveAgent(agent).catch(() => {});
    }
  }

  async saveAgent(agent: AgentDefinition): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO agents
       (id, name, role, agent_type, description, capabilities, permissions, provider, model, runtime_agent, team_id, color, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.name,
        agent.role,
        agent.agentType ?? 'workspace',
        agent.description ?? '',
        JSON.stringify(agent.capabilities),
        JSON.stringify(agent.permissions),
        agent.provider ?? '',
        agent.model ?? '',
        agent.runtimeAgent ?? '',
        agent.teamId ?? '',
        agent.color ?? '',
        agent.status,
        agent.createdAt,
      ],
    );
  }

  async listAgents(): Promise<AgentDefinition[]> {
    const rows = dbAll(this.db, 'SELECT * FROM agents ORDER BY created_at ASC');
    return rows.map((r: any) => this.rowToAgent(r));
  }

  async getAgent(id: string): Promise<AgentDefinition | null> {
    const row = dbGet(this.db, 'SELECT * FROM agents WHERE id = ?', [id]);
    return row ? this.rowToAgent(row) : null;
  }

  async deleteAgent(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM agents WHERE id = ?', [id]);
  }

  async updateAgentStatus(id: string, status: 'active' | 'disabled'): Promise<void> {
    dbRun(this.db, 'UPDATE agents SET status = ? WHERE id = ?', [status, id]);
  }

  async updateAgentModel(id: string, provider: string, model: string): Promise<void> {
    dbRun(this.db, 'UPDATE agents SET provider = ?, model = ? WHERE id = ?', [provider, model, id]);
  }

  async createExecution(agentId: string, task: string): Promise<AgentExecution> {
    const now = new Date().toISOString();
    const id = `exec-${Date.now()}-${++execCounter}`;
    const exec: AgentExecution = {
      id,
      agentId,
      task,
      inputArtifacts: [],
      outputArtifacts: [],
      status: 'queued',
      startedAt: now,
    };
    dbRun(
      this.db,
      `INSERT INTO agent_executions (id, agent_id, task, input_artifacts, output_artifacts, status, started_at, result)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [exec.id, exec.agentId, exec.task, '[]', '[]', exec.status, exec.startedAt, null],
    );
    return exec;
  }

  async updateExecutionStatus(id: string, status: AgentExecutionStatus, result?: string): Promise<void> {
    const completedAt = status === 'completed' || status === 'failed' ? new Date().toISOString() : null;
    dbRun(this.db, 'UPDATE agent_executions SET status = ?, completed_at = ?, result = ? WHERE id = ?', [
      status,
      completedAt,
      result ?? null,
      id,
    ]);
  }

  async updateExecutionOutput(id: string, outputArtifacts: string[]): Promise<void> {
    dbRun(this.db, 'UPDATE agent_executions SET output_artifacts = ? WHERE id = ?', [
      JSON.stringify(outputArtifacts),
      id,
    ]);
  }

  async getExecution(id: string): Promise<AgentExecution | null> {
    const row = dbGet(this.db, 'SELECT * FROM agent_executions WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      agentId: row.agent_id,
      task: row.task,
      inputArtifacts: JSON.parse(row.input_artifacts ?? '[]'),
      outputArtifacts: JSON.parse(row.output_artifacts ?? '[]'),
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      result: row.result ?? undefined,
    };
  }

  async listExecutions(agentId?: string): Promise<AgentExecution[]> {
    const rows = agentId
      ? dbAll(this.db, 'SELECT * FROM agent_executions WHERE agent_id = ? ORDER BY started_at DESC', [agentId])
      : dbAll(this.db, 'SELECT * FROM agent_executions ORDER BY started_at DESC');
    return rows.map((r: any) => ({
      id: r.id,
      agentId: r.agent_id,
      task: r.task,
      inputArtifacts: JSON.parse(r.input_artifacts ?? '[]'),
      outputArtifacts: JSON.parse(r.output_artifacts ?? '[]'),
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at ?? undefined,
      result: r.result ?? undefined,
    }));
  }

  // ─── Team Operations ──────────────────────────────────

  async saveTeam(team: AgentTeam): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO agent_teams
       (id, name, description, leader_agent_id, member_ids, shared_context, active_workflow_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        team.id,
        team.name,
        team.description,
        team.leaderAgentId ?? '',
        JSON.stringify(team.memberIds),
        team.sharedContext ?? '',
        team.activeWorkflowId ?? '',
        team.createdAt,
      ],
    );
  }

  async listTeams(): Promise<AgentTeam[]> {
    const rows = dbAll(this.db, 'SELECT * FROM agent_teams ORDER BY created_at ASC');
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      leaderAgentId: r.leader_agent_id || undefined,
      memberIds: JSON.parse(r.member_ids ?? '[]'),
      sharedContext: r.shared_context || undefined,
      activeWorkflowId: r.active_workflow_id || undefined,
      createdAt: r.created_at,
    }));
  }

  async getTeam(id: string): Promise<AgentTeam | null> {
    const row = dbGet(this.db, 'SELECT * FROM agent_teams WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      leaderAgentId: row.leader_agent_id || undefined,
      memberIds: JSON.parse(row.member_ids ?? '[]'),
      sharedContext: row.shared_context || undefined,
      activeWorkflowId: row.active_workflow_id || undefined,
      createdAt: row.created_at,
    };
  }

  async deleteTeam(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM agent_teams WHERE id = ?', [id]);
  }

  // ─── Schedule Operations ─────────────────────────────

  async saveSchedule(s: {
    id: string;
    agentId: string;
    task: string;
    frequency: string;
    cronExpression?: string;
    nextRunAt: string;
    lastRunAt?: string;
    lastStatus?: string;
    enabled: boolean;
    createdAt: string;
  }): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO agent_schedules (id, agent_id, task, frequency, cron_expression, next_run_at, last_run_at, last_status, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.agentId,
        s.task,
        s.frequency,
        s.cronExpression ?? '',
        s.nextRunAt,
        s.lastRunAt ?? null,
        s.lastStatus ?? '',
        s.enabled ? 1 : 0,
        s.createdAt,
      ],
    );
  }

  async listSchedules(agentId?: string): Promise<any[]> {
    if (agentId)
      return dbAll(this.db, 'SELECT * FROM agent_schedules WHERE agent_id = ? ORDER BY next_run_at ASC', [agentId]);
    return dbAll(this.db, 'SELECT * FROM agent_schedules ORDER BY next_run_at ASC');
  }

  async getSchedule(id: string): Promise<any | null> {
    const row = dbGet(this.db, 'SELECT * FROM agent_schedules WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      agentId: row.agent_id,
      task: row.task,
      frequency: row.frequency,
      cronExpression: row.cron_expression || undefined,
      nextRunAt: row.next_run_at,
      lastRunAt: row.last_run_at || undefined,
      lastStatus: row.last_status || undefined,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    };
  }

  async deleteSchedule(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM agent_schedules WHERE id = ?', [id]);
  }

  async getDueSchedules(): Promise<any[]> {
    return dbAll(this.db, 'SELECT * FROM agent_schedules WHERE enabled = 1 AND next_run_at <= ?', [
      new Date().toISOString(),
    ]);
  }

  async updateScheduleRun(id: string, status: string): Promise<void> {
    const now = new Date().toISOString();
    // Calculate next run based on frequency
    const s = await this.getSchedule(id);
    if (!s) return;
    let nextRun = '';
    switch (s.frequency) {
      case 'hourly':
        nextRun = new Date(Date.now() + 3600000).toISOString();
        break;
      case 'daily':
        nextRun = new Date(Date.now() + 86400000).toISOString();
        break;
      case 'weekly':
        nextRun = new Date(Date.now() + 604800000).toISOString();
        break;
      default:
        nextRun = '';
        break; // 'once' — no repeat
    }
    dbRun(this.db, 'UPDATE agent_schedules SET last_run_at = ?, last_status = ?, next_run_at = ? WHERE id = ?', [
      now,
      status,
      nextRun || '',
      id,
    ]);
  }

  private rowToAgent(row: any): AgentDefinition {
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      agentType: row.agent_type || 'workspace',
      description: row.description || undefined,
      capabilities: JSON.parse(row.capabilities ?? '[]'),
      permissions: JSON.parse(row.permissions ?? '[]'),
      provider: row.provider ?? undefined,
      model: row.model ?? undefined,
      runtimeAgent: row.runtime_agent ?? undefined,
      teamId: row.team_id || undefined,
      color: row.color || undefined,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  // ─── Agent Memory Operations ─────────────────────────

  async saveMemory(entry: AgentMemoryEntry): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO agent_memory (id, agent_id, type, summary, detail, tags, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.agentId,
        entry.type,
        entry.summary,
        entry.detail,
        JSON.stringify(entry.tags),
        entry.confidence,
        entry.createdAt,
      ],
    );
  }

  async listMemory(agentId: string, limit = 20): Promise<AgentMemoryEntry[]> {
    const rows = dbAll(this.db, 'SELECT * FROM agent_memory WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?', [
      agentId,
      limit,
    ]);
    return rows.map((r: any) => ({
      id: r.id,
      agentId: r.agent_id,
      type: r.type,
      summary: r.summary,
      detail: r.detail,
      tags: JSON.parse(r.tags ?? '[]'),
      confidence: r.confidence,
      createdAt: r.created_at,
    }));
  }

  async searchMemory(agentId: string, query: string): Promise<AgentMemoryEntry[]> {
    const rows = dbAll(
      this.db,
      `SELECT * FROM agent_memory WHERE agent_id = ? AND (summary LIKE ? OR detail LIKE ?) ORDER BY confidence DESC LIMIT 10`,
      [agentId, `%${query}%`, `%${query}%`],
    );
    return rows.map((r: any) => ({
      id: r.id,
      agentId: r.agent_id,
      type: r.type,
      summary: r.summary,
      detail: r.detail,
      tags: JSON.parse(r.tags ?? '[]'),
      confidence: r.confidence,
      createdAt: r.created_at,
    }));
  }

  async deleteMemory(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM agent_memory WHERE id = ?', [id]);
  }

  // ─── Execution Session Operations ────────────────────

  async saveExecutionSession(session: ExecutionSession): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO execution_sessions
       (id, goal, workflow_id, assigned_agent_ids, plan_ids, change_set_ids, verification_ids, logs, timeline, approvals, metrics, status, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.goal,
        session.workflowId ?? '',
        JSON.stringify(session.assignedAgentIds),
        JSON.stringify(session.planIds),
        JSON.stringify(session.changeSetIds),
        JSON.stringify(session.verificationIds),
        JSON.stringify(session.logs),
        JSON.stringify(session.timeline),
        JSON.stringify(session.approvals),
        JSON.stringify(session.metrics),
        session.status,
        session.createdAt,
        session.completedAt ?? null,
      ],
    );
  }

  async getExecutionSession(id: string): Promise<ExecutionSession | null> {
    const row = dbGet(this.db, 'SELECT * FROM execution_sessions WHERE id = ?', [id]);
    if (!row) return null;
    return {
      id: row.id,
      goal: row.goal,
      workflowId: row.workflow_id || undefined,
      assignedAgentIds: JSON.parse(row.assigned_agent_ids ?? '[]'),
      planIds: JSON.parse(row.plan_ids ?? '[]'),
      changeSetIds: JSON.parse(row.change_set_ids ?? '[]'),
      verificationIds: JSON.parse(row.verification_ids ?? '[]'),
      logs: JSON.parse(row.logs ?? '[]'),
      timeline: JSON.parse(row.timeline ?? '[]'),
      approvals: JSON.parse(row.approvals ?? '[]'),
      metrics: JSON.parse(row.metrics ?? '{}'),
      status: row.status,
      createdAt: row.created_at,
      completedAt: row.completed_at ?? undefined,
    };
  }

  async listExecutionSessions(limit = 20): Promise<ExecutionSession[]> {
    const rows = dbAll(this.db, 'SELECT * FROM execution_sessions ORDER BY created_at DESC LIMIT ?', [limit]);
    return rows.map((r: any) => ({
      id: r.id,
      goal: r.goal,
      workflowId: r.workflow_id || undefined,
      assignedAgentIds: JSON.parse(r.assigned_agent_ids ?? '[]'),
      planIds: JSON.parse(r.plan_ids ?? '[]'),
      changeSetIds: JSON.parse(r.change_set_ids ?? '[]'),
      verificationIds: JSON.parse(r.verification_ids ?? '[]'),
      logs: JSON.parse(r.logs ?? '[]'),
      timeline: JSON.parse(r.timeline ?? '[]'),
      approvals: JSON.parse(r.approvals ?? '[]'),
      metrics: JSON.parse(r.metrics ?? '{}'),
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at ?? undefined,
    }));
  }

  async updateExecutionSessionStatus(id: string, status: ExecutionSession['status']): Promise<void> {
    const completedAt =
      status === 'completed' || status === 'failed' || status === 'cancelled' ? new Date().toISOString() : null;
    dbRun(this.db, 'UPDATE execution_sessions SET status = ?, completed_at = ? WHERE id = ?', [
      status,
      completedAt ?? null,
      id,
    ]);
  }

  async updateExecutionSessionTimeline(id: string, timeline: ExecutionSession['timeline']): Promise<void> {
    dbRun(this.db, 'UPDATE execution_sessions SET timeline = ? WHERE id = ?', [JSON.stringify(timeline), id]);
  }
}
