import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { migrate } from '@vestara/sqlite-migrations';
import type { Database, SqlValue } from 'sql.js';
import { WORKTREE_MANIFEST } from './migrations';

export type WorkspaceLeaseStatus = 'active' | 'conflicted' | 'orphaned' | 'released';

export interface AgentWorkspaceLease {
  readonly id: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly repositoryRoot: string;
  readonly worktreePath: string;
  readonly branchName: string;
  readonly baseRevision: string;
  readonly status: WorkspaceLeaseStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly releasedAt?: string;
}

export interface WorktreeRuntimeEvent {
  readonly type: string;
  readonly lease: AgentWorkspaceLease;
  readonly detail?: Readonly<Record<string, unknown>>;
}

export interface WorktreeInspection {
  readonly lease: AgentWorkspaceLease;
  readonly exists: boolean;
  readonly dirty: boolean;
  readonly changedFiles: readonly string[];
  readonly conflicts: readonly string[];
  readonly headRevision?: string;
  readonly aheadBy?: number;
}

export interface AcquireLeaseInput {
  readonly taskId: string;
  readonly agentId: string;
  readonly repositoryRoot: string;
  readonly baseRevision?: string;
  readonly branchName?: string;
}

export class WorktreeLeaseRuntime {
  private constructor(
    private readonly db: Database,
    private readonly dbPath: string,
    private readonly leaseRoot: string,
    private readonly emit?: (event: WorktreeRuntimeEvent) => void,
  ) {}

  static async open(options: {
    readonly dbPath: string;
    readonly leaseRoot: string;
    readonly emit?: (event: WorktreeRuntimeEvent) => void;
  }): Promise<WorktreeLeaseRuntime> {
    const initSqlJs = (await import('sql.js')).default;
    const sqlJsDir = path.dirname(require.resolve('sql.js'));
    const SQL = await initSqlJs({ locateFile: (file: string) => path.join(sqlJsDir, file) });
    const data = fs.existsSync(options.dbPath) ? fs.readFileSync(options.dbPath) : undefined;
    const raw = data ? new SQL.Database(data) : new SQL.Database();
    migrate(raw, WORKTREE_MANIFEST, {
      persist: (migrated) => {
        fs.mkdirSync(path.dirname(path.resolve(options.dbPath)), { recursive: true });
        fs.writeFileSync(path.resolve(options.dbPath), Buffer.from(migrated.export()));
      },
    });
    return new WorktreeLeaseRuntime(raw, path.resolve(options.dbPath), path.resolve(options.leaseRoot), options.emit);
  }

  acquire(input: AcquireLeaseInput): AgentWorkspaceLease {
    const repositoryRoot = realDirectory(input.repositoryRoot);
    git(repositoryRoot, ['rev-parse', '--show-toplevel']);
    const active = this.list({ activeOnly: true }).find((lease) => lease.taskId === input.taskId);
    if (active) throw new Error(`Active workspace lease already exists: ${active.id}`);
    const baseRevision = git(repositoryRoot, ['rev-parse', input.baseRevision ?? 'HEAD']);
    const id = `lease-${safeSegment(input.taskId)}-${Date.now()}`;
    const branchName = input.branchName ?? `vestara/${safeSegment(input.taskId)}-${safeSegment(input.agentId)}`;
    if (!/^[a-zA-Z0-9._/-]+$/.test(branchName) || branchName.includes('..'))
      throw new Error(`Unsafe worktree branch name: ${branchName}`);
    const worktreePath = path.join(this.leaseRoot, id);
    ensureInside(this.leaseRoot, worktreePath);
    fs.mkdirSync(this.leaseRoot, { recursive: true });
    git(repositoryRoot, ['worktree', 'add', '-b', branchName, worktreePath, baseRevision]);
    const now = new Date().toISOString();
    const lease: AgentWorkspaceLease = {
      id,
      taskId: input.taskId,
      agentId: input.agentId,
      repositoryRoot,
      worktreePath,
      branchName,
      baseRevision,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    try {
      this.db.run(
        `INSERT INTO workspace_leases
         (id, task_id, agent_id, repository_root, worktree_path, branch_name, base_revision, status,
          created_at, updated_at, released_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [
          lease.id,
          lease.taskId,
          lease.agentId,
          lease.repositoryRoot,
          lease.worktreePath,
          lease.branchName,
          lease.baseRevision,
          lease.status,
          lease.createdAt,
          lease.updatedAt,
        ],
      );
      this.persist();
    } catch (error) {
      git(repositoryRoot, ['worktree', 'remove', '--force', worktreePath]);
      throw error;
    }
    this.emit?.({ type: 'worktree.lease-acquired', lease });
    return lease;
  }

  get(id: string): AgentWorkspaceLease | undefined {
    return leaseFromRow(rows(this.db, 'SELECT * FROM workspace_leases WHERE id = ?', [id])[0]);
  }

  list(options: { readonly activeOnly?: boolean } = {}): readonly AgentWorkspaceLease[] {
    const result = options.activeOnly
      ? rows(this.db, "SELECT * FROM workspace_leases WHERE status != 'released' ORDER BY created_at")
      : rows(this.db, 'SELECT * FROM workspace_leases ORDER BY created_at');
    return result.map(leaseFromRow).filter((lease): lease is AgentWorkspaceLease => lease !== undefined);
  }

  inspect(id: string): WorktreeInspection {
    const lease = this.require(id);
    if (!fs.existsSync(lease.worktreePath))
      return { lease, exists: false, dirty: false, changedFiles: [], conflicts: [] };
    const status = git(lease.worktreePath, ['status', '--porcelain=v1']);
    const lines = status ? status.split('\n') : [];
    const changedFiles = lines.map((line) => line.slice(3)).filter(Boolean);
    const conflicts = lines.filter((line) => /^(DD|AU|UD|UA|DU|AA|UU)/.test(line)).map((line) => line.slice(3));
    const headRevision = git(lease.worktreePath, ['rev-parse', 'HEAD']);
    const aheadBy = Number(git(lease.worktreePath, ['rev-list', '--count', `${lease.baseRevision}..HEAD`])) || 0;
    if (conflicts.length && lease.status !== 'conflicted') this.updateStatus(lease.id, 'conflicted');
    return {
      lease: this.get(id) ?? lease,
      exists: true,
      dirty: lines.length > 0,
      changedFiles,
      conflicts,
      headRevision,
      aheadBy,
    };
  }

  claimFiles(id: string, filePaths: readonly string[]): void {
    const lease = this.requireActive(id);
    this.db.run('BEGIN TRANSACTION');
    try {
      for (const filePath of [...new Set(filePaths.map(normalizeRelativePath))]) {
        const owner = rows(
          this.db,
          `SELECT f.lease_id FROM file_leases f JOIN workspace_leases w ON w.id = f.lease_id
           WHERE f.repository_root = ? AND f.file_path = ? AND w.status != 'released' LIMIT 1`,
          [lease.repositoryRoot, filePath],
        )[0]?.[0];
        if (owner && String(owner) !== lease.id)
          throw new Error(`File is already leased by ${String(owner)}: ${filePath}`);
        this.db.run(
          'INSERT OR IGNORE INTO file_leases (lease_id, repository_root, file_path, claimed_at) VALUES (?, ?, ?, ?)',
          [lease.id, lease.repositoryRoot, filePath, new Date().toISOString()],
        );
      }
      this.db.run('COMMIT');
      this.persist();
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
    this.emit?.({ type: 'worktree.files-claimed', lease, detail: { files: filePaths } });
  }

  release(id: string, options: { readonly force?: boolean } = {}): AgentWorkspaceLease {
    const lease = this.requireActive(id);
    const inspection = this.inspect(id);
    if ((inspection.dirty || inspection.conflicts.length > 0) && !options.force)
      throw new Error('Worktree has uncommitted or conflicted changes; force is required to release it');
    if (inspection.exists)
      git(lease.repositoryRoot, ['worktree', 'remove', ...(options.force ? ['--force'] : []), lease.worktreePath]);
    const releasedAt = new Date().toISOString();
    this.db.run("UPDATE workspace_leases SET status = 'released', updated_at = ?, released_at = ? WHERE id = ?", [
      releasedAt,
      releasedAt,
      id,
    ]);
    this.db.run('DELETE FROM file_leases WHERE lease_id = ?', [id]);
    this.persist();
    const released = this.require(id);
    this.emit?.({ type: 'worktree.lease-released', lease: released, detail: { forced: options.force === true } });
    return released;
  }

  recover(): readonly AgentWorkspaceLease[] {
    const changed: AgentWorkspaceLease[] = [];
    for (const lease of this.list({ activeOnly: true })) {
      if (!fs.existsSync(lease.worktreePath)) {
        changed.push(this.updateStatus(lease.id, 'orphaned'));
        continue;
      }
      const inspection = this.inspect(lease.id);
      if (inspection.conflicts.length) changed.push(this.get(lease.id) ?? lease);
    }
    for (const lease of changed) this.emit?.({ type: 'worktree.lease-reconciled', lease });
    return changed;
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  private updateStatus(id: string, status: WorkspaceLeaseStatus): AgentWorkspaceLease {
    this.db.run('UPDATE workspace_leases SET status = ?, updated_at = ? WHERE id = ?', [
      status,
      new Date().toISOString(),
      id,
    ]);
    this.persist();
    return this.require(id);
  }

  private require(id: string): AgentWorkspaceLease {
    const lease = this.get(id);
    if (!lease) throw new Error(`Workspace lease not found: ${id}`);
    return lease;
  }

  private requireActive(id: string): AgentWorkspaceLease {
    const lease = this.require(id);
    if (lease.status === 'released' || lease.status === 'orphaned')
      throw new Error(`Workspace lease is not active: ${id}`);
    return lease;
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    const temporary = `${this.dbPath}.tmp`;
    fs.writeFileSync(temporary, Buffer.from(this.db.export()));
    fs.renameSync(temporary, this.dbPath);
  }
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function realDirectory(value: string): string {
  const resolved = fs.realpathSync(path.resolve(value));
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`Not a directory: ${value}`);
  return resolved;
}

function safeSegment(value: string): string {
  const result = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!result) throw new Error(`Identifier has no safe worktree segment: ${value}`);
  return result.slice(0, 48);
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../'))
    throw new Error(`File lease path must be repository-relative: ${value}`);
  return path.posix.normalize(normalized);
}

function ensureInside(root: string, target: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Unsafe worktree path');
}

function rows(db: Database, sql: string, params: readonly SqlValue[] = []): readonly unknown[][] {
  const statement = db.prepare(sql);
  try {
    statement.bind([...params]);
    const result: unknown[][] = [];
    while (statement.step()) result.push(statement.get());
    return result;
  } finally {
    statement.free();
  }
}

function leaseFromRow(row: readonly unknown[] | undefined): AgentWorkspaceLease | undefined {
  if (!row) return undefined;
  return {
    id: String(row[0]),
    taskId: String(row[1]),
    agentId: String(row[2]),
    repositoryRoot: String(row[3]),
    worktreePath: String(row[4]),
    branchName: String(row[5]),
    baseRevision: String(row[6]),
    status: String(row[7]) as WorkspaceLeaseStatus,
    createdAt: String(row[8]),
    updatedAt: String(row[9]),
    releasedAt: row[10] ? String(row[10]) : undefined,
  };
}

export { WORKTREE_MANIFEST } from './migrations';
