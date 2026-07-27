import type { Project, ProjectStatus, ProjectTask, ProjectTaskStatus, Sprint, SprintStatus } from './project-types';

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

export class ProjectStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT, description TEXT DEFAULT '',
        status TEXT DEFAULT 'planning', priority TEXT DEFAULT 'medium',
        lead_agent_id TEXT DEFAULT '', tags TEXT DEFAULT '[]',
        created_at TEXT, updated_at TEXT, completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, project_id TEXT, sprint_id TEXT DEFAULT '',
        title TEXT, description TEXT DEFAULT '',
        status TEXT DEFAULT 'backlog', priority TEXT DEFAULT 'medium',
        assignee_agent_id TEXT DEFAULT '', depends_on TEXT DEFAULT '[]',
        labels TEXT DEFAULT '[]', estimated_hours REAL DEFAULT 0,
        actual_hours REAL DEFAULT 0,
        created_at TEXT, updated_at TEXT, completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY, project_id TEXT, name TEXT, goal TEXT DEFAULT '',
        status TEXT DEFAULT 'planning',
        start_date TEXT, end_date TEXT,
        created_at TEXT, completed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, status);
      CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
    `);
  }

  // ─── Projects ────────────────────────────────────────

  async saveProject(p: Project): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO projects (id, name, description, status, priority, lead_agent_id, tags, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.name,
        p.description,
        p.status,
        p.priority,
        p.leadAgentId ?? '',
        JSON.stringify(p.tags),
        p.createdAt,
        p.updatedAt,
        p.completedAt ?? null,
      ],
    );
  }

  async listProjects(): Promise<Project[]> {
    return dbAll(this.db, 'SELECT * FROM projects ORDER BY updated_at DESC').map(this._rowToProject);
  }

  async getProject(id: string): Promise<Project | null> {
    const row = dbGet(this.db, 'SELECT * FROM projects WHERE id = ?', [id]);
    return row ? this._rowToProject(row) : null;
  }

  async deleteProject(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM tasks WHERE project_id = ?', [id]);
    dbRun(this.db, 'DELETE FROM sprints WHERE project_id = ?', [id]);
    dbRun(this.db, 'DELETE FROM projects WHERE id = ?', [id]);
  }

  async updateProjectStatus(id: string, status: ProjectStatus): Promise<void> {
    const now = status === 'completed' || status === 'cancelled' ? new Date().toISOString() : null;
    dbRun(
      this.db,
      'UPDATE projects SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?',
      [status, new Date().toISOString(), now, id],
    );
  }

  // ─── Tasks ───────────────────────────────────────────

  async saveTask(t: ProjectTask): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO tasks (id, project_id, sprint_id, title, description, status, priority, assignee_agent_id, depends_on, labels, estimated_hours, actual_hours, created_at, updated_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        t.id,
        t.projectId,
        t.sprintId ?? '',
        t.title,
        t.description,
        t.status,
        t.priority,
        t.assigneeAgentId ?? '',
        JSON.stringify(t.dependsOn),
        JSON.stringify(t.labels),
        t.estimatedHours ?? 0,
        t.actualHours ?? 0,
        t.createdAt,
        t.updatedAt,
        t.completedAt ?? null,
      ],
    );
  }

  async listTasks(projectId?: string, sprintId?: string): Promise<ProjectTask[]> {
    let sql = 'SELECT * FROM tasks';
    const params: any[] = [];
    const wheres: string[] = [];
    if (projectId) {
      wheres.push('project_id = ?');
      params.push(projectId);
    }
    if (sprintId) {
      wheres.push('sprint_id = ?');
      params.push(sprintId);
    }
    if (wheres.length > 0) sql += ` WHERE ${wheres.join(' AND ')}`;
    sql += ' ORDER BY created_at DESC';
    return dbAll(this.db, sql, params).map(this._rowToTask);
  }

  async getTask(id: string): Promise<ProjectTask | null> {
    const row = dbGet(this.db, 'SELECT * FROM tasks WHERE id = ?', [id]);
    return row ? this._rowToTask(row) : null;
  }

  async updateTaskStatus(id: string, status: ProjectTaskStatus): Promise<void> {
    const now = status === 'done' || status === 'cancelled' ? new Date().toISOString() : null;
    dbRun(
      this.db,
      'UPDATE tasks SET status = ?, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?',
      [status, new Date().toISOString(), now, id],
    );
  }

  async deleteTask(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM tasks WHERE id = ?', [id]);
  }

  // ─── Sprints ─────────────────────────────────────────

  async saveSprint(s: Sprint): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO sprints (id, project_id, name, goal, status, start_date, end_date, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.projectId, s.name, s.goal, s.status, s.startDate, s.endDate, s.createdAt, s.completedAt ?? null],
    );
  }

  async listSprints(projectId?: string): Promise<Sprint[]> {
    if (projectId)
      return dbAll(this.db, 'SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC', [projectId]).map(
        this._rowToSprint,
      );
    return dbAll(this.db, 'SELECT * FROM sprints ORDER BY start_date DESC').map(this._rowToSprint);
  }

  async getSprint(id: string): Promise<Sprint | null> {
    const row = dbGet(this.db, 'SELECT * FROM sprints WHERE id = ?', [id]);
    return row ? this._rowToSprint(row) : null;
  }

  async updateSprintStatus(id: string, status: SprintStatus): Promise<void> {
    const now = status === 'completed' ? new Date().toISOString() : null;
    dbRun(this.db, 'UPDATE sprints SET status = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?', [
      status,
      now,
      id,
    ]);
  }

  async deleteSprint(id: string): Promise<void> {
    dbRun(this.db, "UPDATE tasks SET sprint_id = '' WHERE sprint_id = ?", [id]);
    dbRun(this.db, 'DELETE FROM sprints WHERE id = ?', [id]);
  }

  // ─── Stats ───────────────────────────────────────────

  async getProjectStats(
    projectId: string,
  ): Promise<{ total: number; done: number; inProgress: number; backlog: number }> {
    const tasks = await this.listTasks(projectId);
    return {
      total: tasks.length,
      done: tasks.filter((t) => t.status === 'done').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').length,
      backlog: tasks.filter((t) => t.status === 'backlog' || t.status === 'ready').length,
    };
  }

  // ─── Rows ────────────────────────────────────────────

  private _rowToProject(r: any): Project {
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      priority: r.priority,
      leadAgentId: r.lead_agent_id || undefined,
      tags: JSON.parse(r.tags ?? '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completedAt: r.completed_at || undefined,
    };
  }
  private _rowToTask(r: any): ProjectTask {
    return {
      id: r.id,
      projectId: r.project_id,
      sprintId: r.sprint_id || undefined,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      assigneeAgentId: r.assignee_agent_id || undefined,
      dependsOn: JSON.parse(r.depends_on ?? '[]'),
      labels: JSON.parse(r.labels ?? '[]'),
      estimatedHours: r.estimated_hours || undefined,
      actualHours: r.actual_hours || undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      completedAt: r.completed_at || undefined,
    };
  }
  private _rowToSprint(r: any): Sprint {
    return {
      id: r.id,
      projectId: r.project_id,
      name: r.name,
      goal: r.goal,
      status: r.status,
      startDate: r.start_date,
      endDate: r.end_date,
      createdAt: r.created_at,
      completedAt: r.completed_at || undefined,
    };
  }
}
