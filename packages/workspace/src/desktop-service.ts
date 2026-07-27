/**
 * DesktopService — Native workspace desktop lifecycle.
 *
 * Manages the desktop session state: open panels, last workspace,
 * pinned repositories, and layout persistence. On boot, restores
 * the previous engineering session automatically.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Boot Sequence, Workspace Lifecycle
 */

import type { DesktopPanel, DesktopSession } from './types';

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

const DEFAULT_PANELS: DesktopPanel[] = [
  { id: 'dashboard', type: 'dashboard', visible: true, order: 0 },
  { id: 'repository', type: 'repository', visible: true, order: 1 },
  { id: 'plans', type: 'plans', visible: false, order: 2 },
  { id: 'agents', type: 'agents', visible: false, order: 3 },
  { id: 'memory', type: 'memory', visible: false, order: 4 },
  { id: 'terminal', type: 'terminal', visible: false, order: 5 },
];

export class DesktopService {
  private db: any;

  constructor(db: any) {
    this.db = db;
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS desktop_sessions (
        id TEXT PRIMARY KEY,
        last_workspace_path TEXT,
        open_panels TEXT DEFAULT '[]',
        active_plan_id TEXT,
        pinned_repositories TEXT DEFAULT '[]',
        created_at TEXT,
        updated_at TEXT
      );
    `);
  }

  /**
   * Get or create the current desktop session.
   */
  async getSession(): Promise<DesktopSession> {
    const row = dbGet(this.db, 'SELECT * FROM desktop_sessions ORDER BY updated_at DESC LIMIT 1');
    if (row) return this.rowToSession(row);
    return this.createSession();
  }

  /**
   * Create a new desktop session with default panels.
   */
  async createSession(): Promise<DesktopSession> {
    const now = new Date().toISOString();
    const id = `desktop-${Date.now()}`;
    const session: DesktopSession = {
      id,
      lastWorkspacePath: null,
      openPanels: DEFAULT_PANELS,
      activePlanId: null,
      pinnedRepositories: [],
      createdAt: now,
      updatedAt: now,
    };
    this.save(session);
    return session;
  }

  /**
   * Save desktop session state.
   */
  save(session: DesktopSession): void {
    session.updatedAt = new Date().toISOString();
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO desktop_sessions
       (id, last_workspace_path, open_panels, active_plan_id, pinned_repositories, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        session.lastWorkspacePath,
        JSON.stringify(session.openPanels),
        session.activePlanId,
        JSON.stringify(session.pinnedRepositories),
        session.createdAt,
        session.updatedAt,
      ],
    );
  }

  /**
   * Set the last opened workspace path.
   */
  async setLastWorkspace(path: string): Promise<void> {
    const session = await this.getSession();
    session.lastWorkspacePath = path;
    this.save(session);
  }

  /**
   * Pin a repository path.
   */
  async pinRepository(path: string): Promise<void> {
    const session = await this.getSession();
    if (!session.pinnedRepositories.includes(path)) {
      session.pinnedRepositories.push(path);
      this.save(session);
    }
  }

  /**
   * Toggle a panel's visibility.
   */
  async togglePanel(panelId: string): Promise<void> {
    const session = await this.getSession();
    const panel = session.openPanels.find((p) => p.id === panelId);
    if (panel) {
      panel.visible = !panel.visible;
      this.save(session);
    }
  }

  /**
   * Get the last workspace path for restoration on boot.
   */
  async getLastWorkspace(): Promise<string | null> {
    const session = await this.getSession();
    return session.lastWorkspacePath;
  }

  /**
   * Reorder panels.
   */
  async reorderPanels(panelIds: string[]): Promise<void> {
    const session = await this.getSession();
    const reordered = panelIds
      .map((id, i) => {
        const existing = session.openPanels.find((p) => p.id === id);
        return existing ? { ...existing, order: i } : null;
      })
      .filter(Boolean) as DesktopPanel[];
    if (reordered.length === session.openPanels.length) {
      session.openPanels = reordered;
      this.save(session);
    }
  }

  /**
   * Render desktop state for terminal display.
   */
  renderDesktop(session: DesktopSession): string {
    const lines: string[] = [];
    lines.push('Workspace Desktop');
    lines.push('──────────────────────────────────────');
    lines.push(`Session: ${session.id}`);
    lines.push(`Last workspace: ${session.lastWorkspacePath ?? '(none)'}`);
    lines.push(`Pinned repos: ${session.pinnedRepositories.length}`);
    lines.push('');

    lines.push('Panels:');
    for (const panel of session.openPanels) {
      const icon = panel.visible ? '●' : '○';
      lines.push(`  ${icon} ${panel.type.padEnd(15)} ${panel.visible ? 'visible' : 'hidden'}`);
    }

    if (session.activePlanId) {
      lines.push(`\nActive plan: ${session.activePlanId}`);
    }

    return lines.join('\n');
  }

  private rowToSession(row: any): DesktopSession {
    return {
      id: row.id,
      lastWorkspacePath: row.last_workspace_path ?? null,
      openPanels: JSON.parse(row.open_panels ?? '[]'),
      activePlanId: row.active_plan_id ?? null,
      pinnedRepositories: JSON.parse(row.pinned_repositories ?? '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
