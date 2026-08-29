/**
 * KnowledgeGraphStorage — SQLite-backed persistence for the knowledge graph.
 *
 * Manages two tables:
 *   knowledge_nodes       — entities in the graph
 *   knowledge_relations   — edges connecting nodes
 *
 * Architecture Traceability:
 *   PCS: PCS-008 — Memory & Knowledge Graph
 *   Safety: Memory may inform decisions. Memory may not silently change decisions.
 */

import type { KnowledgeNode, KnowledgeRelation } from './types';

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

export class KnowledgeGraphStorage {
  private db: any;

  constructor(db: any) {
    this.db = db;
    // Schema is owned by the migration chain (workspace-migrations.ts),
    // executed by the entrypoint composition root before storages construct.
  }

  async upsertNode(node: KnowledgeNode): Promise<void> {
    dbRun(
      this.db,
      `INSERT OR REPLACE INTO knowledge_nodes
       (id, type, name, description, source_artifacts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.type,
        node.name,
        node.description,
        JSON.stringify(node.sourceArtifacts),
        node.createdAt,
        node.updatedAt,
      ],
    );
  }

  async addRelation(relation: KnowledgeRelation): Promise<void> {
    dbRun(
      this.db,
      'INSERT OR REPLACE INTO knowledge_relations (id, source_id, target_id, type, created_at) VALUES (?, ?, ?, ?, ?)',
      [relation.id, relation.sourceId, relation.targetId, relation.type, relation.createdAt],
    );
  }

  async getNode(id: string): Promise<KnowledgeNode | null> {
    const row = dbGet(this.db, 'SELECT * FROM knowledge_nodes WHERE id = ?', [id]);
    if (!row) return null;
    return this.rowToNode(row);
  }

  async searchNodes(query: string, limit = 10): Promise<KnowledgeNode[]> {
    const term = `%${query}%`;
    const rows = dbAll(
      this.db,
      `SELECT * FROM knowledge_nodes
       WHERE name LIKE ? OR description LIKE ?
       ORDER BY created_at DESC LIMIT ?`,
      [term, term, limit],
    );
    return rows.map((r: any) => this.rowToNode(r));
  }

  async getRelations(nodeId: string): Promise<KnowledgeRelation[]> {
    const rows = dbAll(
      this.db,
      `SELECT * FROM knowledge_relations
       WHERE source_id = ? OR target_id = ?
       ORDER BY created_at ASC`,
      [nodeId, nodeId],
    );
    return rows.map((r: any) => this.rowToRelation(r));
  }

  async getAllNodes(): Promise<KnowledgeNode[]> {
    const rows = dbAll(this.db, 'SELECT * FROM knowledge_nodes ORDER BY created_at DESC');
    return rows.map((r: any) => this.rowToNode(r));
  }

  async getAllRelations(): Promise<KnowledgeRelation[]> {
    const rows = dbAll(this.db, 'SELECT * FROM knowledge_relations ORDER BY created_at ASC');
    return rows.map((r: any) => this.rowToRelation(r));
  }

  async getStats(): Promise<{ nodes: number; relations: number }> {
    const nodes = dbGet(this.db, 'SELECT COUNT(*) as c FROM knowledge_nodes')?.c ?? 0;
    const relations = dbGet(this.db, 'SELECT COUNT(*) as c FROM knowledge_relations')?.c ?? 0;
    return { nodes, relations };
  }

  async deleteNode(id: string): Promise<void> {
    dbRun(this.db, 'DELETE FROM knowledge_relations WHERE source_id = ? OR target_id = ?', [id, id]);
    dbRun(this.db, 'DELETE FROM knowledge_nodes WHERE id = ?', [id]);
  }

  private rowToNode(row: any): KnowledgeNode {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      sourceArtifacts: JSON.parse(row.source_artifacts ?? '[]'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToRelation(row: any): KnowledgeRelation {
    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      type: row.type,
      createdAt: row.created_at,
    };
  }
}
