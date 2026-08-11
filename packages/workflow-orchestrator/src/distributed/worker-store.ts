/**
 * WorkerStore — sql.js persistence for worker nodes and task leases
 * (PCS-027 §4, §7).
 */

import type { Database } from 'sql.js';
import { dbAll, dbGet, dbRun, jsonParse, now, num, str } from '../db';
import type { TaskLease, WorkerNode, WorkerNodeStatus } from './types';

export class WorkerStore {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
    // Schema is owned by the migration chain (orchestration-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  // ─── Nodes ──────────────────────────────────────────────────

  async registerNode(input: {
    readonly id: string;
    readonly hostname: string;
    readonly executors?: readonly string[];
    readonly capabilities?: readonly string[];
  }): Promise<WorkerNode> {
    const existing = await this.getNode(input.id);
    if (existing) {
      dbRun(
        this.db,
        'UPDATE orchestrated_worker_nodes SET hostname = ?, status = ?, executors = ?, capabilities = ? WHERE id = ?',
        [
          input.hostname,
          'online',
          JSON.stringify(input.executors ?? existing.executors),
          JSON.stringify(input.capabilities ?? existing.capabilities),
          input.id,
        ],
      );
      return (await this.getNode(input.id))!;
    }
    const node: WorkerNode = {
      id: input.id,
      hostname: input.hostname,
      status: 'online',
      executors: input.executors ?? [],
      capabilities: input.capabilities ?? [],
      load: 0,
      lastHeartbeatAt: now(),
      registeredAt: now(),
    };
    dbRun(
      this.db,
      `INSERT INTO orchestrated_worker_nodes (id, hostname, status, executors, capabilities, load, last_heartbeat_at, registered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.hostname,
        node.status,
        JSON.stringify(node.executors),
        JSON.stringify(node.capabilities),
        node.load,
        node.lastHeartbeatAt,
        node.registeredAt,
      ],
    );
    return node;
  }

  async getNode(id: string): Promise<WorkerNode | undefined> {
    const row = dbGet(this.db, 'SELECT * FROM orchestrated_worker_nodes WHERE id = ?', [id]);
    return row ? this.rowToNode(row) : undefined;
  }

  async listNodes(): Promise<WorkerNode[]> {
    const rows = dbAll(this.db, 'SELECT * FROM orchestrated_worker_nodes ORDER BY registered_at ASC');
    return rows.map((row) => this.rowToNode(row));
  }

  async updateHeartbeat(nodeId: string, load: number, status: WorkerNodeStatus): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_worker_nodes SET load = ?, status = ?, last_heartbeat_at = ? WHERE id = ?', [
      load,
      status,
      now(),
      nodeId,
    ]);
  }

  async markStatus(nodeId: string, status: WorkerNodeStatus): Promise<void> {
    dbRun(this.db, 'UPDATE orchestrated_worker_nodes SET status = ? WHERE id = ?', [status, nodeId]);
  }

  // ─── Leases ─────────────────────────────────────────────────

  async acquireLease(input: {
    readonly leaseId: string;
    readonly executionId: string;
    readonly nodeId: string;
    readonly task: import('../types').WorkflowTask;
    readonly expiresAt: string;
  }): Promise<TaskLease> {
    const lease: TaskLease = {
      leaseId: input.leaseId,
      executionId: input.executionId,
      nodeId: input.nodeId,
      task: input.task,
      expiresAt: input.expiresAt,
    };
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO orchestrated_task_leases (lease_id, execution_id, node_id, task, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [lease.leaseId, lease.executionId, lease.nodeId, JSON.stringify(lease.task), lease.expiresAt],
    );
    return lease;
  }

  async releaseLease(leaseId: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM orchestrated_task_leases WHERE lease_id = ?', [leaseId]);
  }

  async listActiveLeases(nodeId?: string): Promise<TaskLease[]> {
    const sql = nodeId
      ? 'SELECT * FROM orchestrated_task_leases WHERE node_id = ?'
      : 'SELECT * FROM orchestrated_task_leases';
    const params = nodeId ? [nodeId] : undefined;
    return dbAll(this.db, sql, params).map((row) => ({
      leaseId: str(row.lease_id),
      executionId: str(row.execution_id),
      nodeId: str(row.node_id),
      task: jsonParse(row.task) as import('../types').WorkflowTask,
      expiresAt: str(row.expires_at),
    }));
  }

  /** Delete leases whose expiry has passed; returns the removed lease ids. */
  async reapExpiredLeases(): Promise<string[]> {
    const nowIso = now();
    const expired = dbAll(this.db, 'SELECT lease_id FROM orchestrated_task_leases WHERE expires_at <= ?', [nowIso]);
    const ids = expired.map((row) => str(row.lease_id));
    for (const leaseId of ids) await this.releaseLease(leaseId);
    return ids;
  }

  private rowToNode(row: Record<string, unknown>): WorkerNode {
    return {
      id: str(row.id),
      hostname: str(row.hostname),
      status: str(row.status) as WorkerNodeStatus,
      executors: (jsonParse(row.executors) as string[]) ?? [],
      capabilities: (jsonParse(row.capabilities) as string[]) ?? [],
      load: num(row.load),
      lastHeartbeatAt: row.last_heartbeat_at ? str(row.last_heartbeat_at) : now(),
      registeredAt: str(row.registered_at),
    };
  }
}
