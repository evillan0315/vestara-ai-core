/**
 * FileLockRegistry — path-level coordination between concurrent tasks.
 *
 * A task declares its target files; locks are acquired before a task runs and
 * released when it finishes. A task that needs a held lock is blocked by the
 * orchestrator. Persisted so conflicts survive restarts.
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, now, str } from '../db';
import type { FileLock } from '../types';

export interface AcquireLockResult {
  readonly acquired: boolean;
  readonly lock?: FileLock;
  readonly holderAgentId?: string;
  readonly holderTaskId?: string;
}

export class FileLockRegistry {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    // Schema is owned by the migration chain (orchestration-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  async acquire(input: { path: string; holderAgentId: string; taskId: string }): Promise<AcquireLockResult> {
    const existing = dbGet(this.db, 'SELECT * FROM orchestrated_file_locks WHERE path = ? AND released_at IS NULL', [
      input.path,
    ]);
    if (existing) {
      return {
        acquired: false,
        holderAgentId: str(existing.holder_agent_id),
        holderTaskId: str(existing.task_id),
      };
    }
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO orchestrated_file_locks (path, holder_agent_id, task_id, acquired_at, released_at)
       VALUES (?, ?, ?, ?, NULL)`,
      [input.path, input.holderAgentId, input.taskId, now()],
    );
    const lock: FileLock = {
      path: input.path,
      holderAgentId: input.holderAgentId,
      taskId: input.taskId,
      acquiredAt: now(),
    };
    return { acquired: true, lock };
  }

  async release(path: string, taskId: string): Promise<void> {
    dbRun(
      this.db,
      'UPDATE orchestrated_file_locks SET released_at = ? WHERE path = ? AND task_id = ? AND released_at IS NULL',
      [now(), path, taskId],
    );
  }

  async isLocked(path: string): Promise<boolean> {
    const row = dbGet(this.db, 'SELECT path FROM orchestrated_file_locks WHERE path = ? AND released_at IS NULL', [
      path,
    ]);
    return row !== null;
  }

  async listActive(): Promise<FileLock[]> {
    const rows = dbAll(
      this.db,
      'SELECT * FROM orchestrated_file_locks WHERE released_at IS NULL ORDER BY acquired_at ASC',
    );
    return rows.map((row) => this.rowToLock(row));
  }

  async listAll(): Promise<FileLock[]> {
    const rows = dbAll(this.db, 'SELECT * FROM orchestrated_file_locks ORDER BY acquired_at ASC');
    return rows.map((row) => this.rowToLock(row));
  }

  private rowToLock(row: Record<string, unknown>): FileLock {
    return {
      path: str(row.path),
      holderAgentId: str(row.holder_agent_id),
      taskId: str(row.task_id),
      acquiredAt: str(row.acquired_at),
      releasedAt: row.released_at ? str(row.released_at) : undefined,
    };
  }
}
