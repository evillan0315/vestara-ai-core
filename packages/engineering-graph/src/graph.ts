/**
 * EngineeringGraph — in-memory relationship engine.
 *
 * Pure, zero-dependency adjacency store. Directed edges keep forward links
 * and backlinks indexable, so dependency / dependents / impact analysis and
 * the Universal Inspector's "referenced by" lists are O(k) lookups.
 */

import type { EntityKind } from './ids';
import { parseEntityId } from './ids';
import type {
  GraphEntity,
  GraphHealth,
  GraphInsight,
  GraphRelationship,
  GraphStats,
  RelationshipDirection,
  RelationshipType,
  SearchOptions,
  SearchResult,
} from './types';

function relId(from: string, to: string, type: string): string {
  return `${from}>${to}:${type}`;
}

export class EngineeringGraph {
  private entities = new Map<string, GraphEntity>();
  private rels = new Map<string, GraphRelationship>();
  private out = new Map<string, Set<string>>();
  private inc = new Map<string, Set<string>>();

  // ─── Entities ───────────────────────────────────────────────

  addEntity(entity: GraphEntity): boolean {
    if (this.entities.has(entity.id)) return false;
    this.entities.set(entity.id, entity);
    return true;
  }

  getEntity(id: string): GraphEntity | null {
    return this.entities.get(id) ?? null;
  }

  hasEntity(id: string): boolean {
    return this.entities.has(id);
  }

  allEntities(): GraphEntity[] {
    return [...this.entities.values()];
  }

  /** All relationship objects (for diffing / serialization). */
  allRelationships(): GraphRelationship[] {
    return [...this.rels.values()];
  }

  /** Merge a patch into an existing entity. Returns false when unknown. */
  updateEntity(id: string, patch: Partial<GraphEntity>): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;
    this.entities.set(id, { ...entity, ...patch, id });
    return true;
  }

  /** Remove the directed relationship identified by from/to/type. */
  removeRelationship(from: string, to: string, type: string): boolean {
    const id = relId(from, to, type);
    if (!this.rels.has(id)) return false;
    this.rels.delete(id);
    this.out.get(from)?.delete(id);
    this.inc.get(to)?.delete(id);
    return true;
  }

  /** Serializable snapshot for checkpoints. */
  toJSON(): { entities: GraphEntity[]; relationships: GraphRelationship[] } {
    return { entities: this.allEntities(), relationships: this.allRelationships() };
  }

  /** Rebuild a graph from a serialized snapshot. */
  static fromJSON(snapshot: { entities: GraphEntity[]; relationships: GraphRelationship[] }): EngineeringGraph {
    const graph = new EngineeringGraph();
    for (const e of snapshot.entities) graph.addEntity(e);
    for (const r of snapshot.relationships) graph.addRelationship(r);
    return graph;
  }

  entitiesByKind(kind: EntityKind): GraphEntity[] {
    return [...this.entities.values()].filter((e) => e.kind === kind);
  }

  count(): number {
    return this.entities.size;
  }

  removeEntity(id: string): void {
    this.entities.delete(id);
    for (const rel of [...(this.out.get(id) ?? [])]) this.rels.delete(rel);
    for (const rel of [...(this.inc.get(id) ?? [])]) this.rels.delete(rel);
    this.out.delete(id);
    this.inc.delete(id);
  }

  clear(): void {
    this.entities.clear();
    this.rels.clear();
    this.out.clear();
    this.inc.clear();
  }

  // ─── Relationships ──────────────────────────────────────────

  /** Add a directed edge; dedupes by from/to/type. */
  addRelationship(rel: GraphRelationship): boolean {
    const id = rel.id ?? relId(rel.from, rel.to, rel.type);
    if (this.rels.has(id)) return false;
    const stored: GraphRelationship = { ...rel, id };
    this.rels.set(id, stored);
    this.index(stored);
    return true;
  }

  getRelationship(id: string): GraphRelationship | null {
    return this.rels.get(id) ?? null;
  }

  private index(rel: GraphRelationship): void {
    let o = this.out.get(rel.from);
    if (!o) {
      o = new Set();
      this.out.set(rel.from, o);
    }
    o.add(rel.id as string);
    let i = this.inc.get(rel.to);
    if (!i) {
      i = new Set();
      this.inc.set(rel.to, i);
    }
    i.add(rel.id as string);
  }

  relationships(id: string, opts: RelationshipDirection = {}): GraphRelationship[] {
    const { direction = 'both', type = 'any', limit } = opts;
    const ids = new Set<string>();
    if (direction === 'out' || direction === 'both') for (const r of this.out.get(id) ?? []) ids.add(r);
    if (direction === 'in' || direction === 'both') for (const r of this.inc.get(id) ?? []) ids.add(r);
    let rels = [...ids].map((r) => this.rels.get(r)).filter((r): r is GraphRelationship => Boolean(r));
    if (type && type !== 'any') rels = rels.filter((r) => r.type === type);
    rels.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
    return limit ? rels.slice(0, limit) : rels;
  }

  /** Outgoing (forward) relationships. */
  outRelationships(id: string, opts: Omit<RelationshipDirection, 'direction'> = {}): GraphRelationship[] {
    return this.relationships(id, { ...opts, direction: 'out' });
  }

  /** Incoming (backlink) relationships. */
  inRelationships(id: string, opts: Omit<RelationshipDirection, 'direction'> = {}): GraphRelationship[] {
    return this.relationships(id, { ...opts, direction: 'in' });
  }

  /** Direct neighbors with the relationship that connects them. */
  neighbors(
    id: string,
    direction: 'out' | 'in' | 'both' = 'both',
  ): Array<{ neighbor: string; type: RelationshipType }> {
    const out: Array<{ neighbor: string; type: RelationshipType }> = [];
    for (const rel of this.relationships(id, { direction })) {
      if (rel.from === id) out.push({ neighbor: rel.to, type: rel.type });
      else out.push({ neighbor: rel.from, type: rel.type });
    }
    return out;
  }

  // ─── Traversal ──────────────────────────────────────────────

  /** Transitive closure following `type` edges forward (default depends-on/any). */
  dependencies(id: string, types: RelationshipType[] | 'any' = 'any', maxDepth = 6): string[] {
    const seen = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [{ node: id, depth: 0 }];
    while (queue.length > 0) {
      const { node, depth } = queue.shift() as { node: string; depth: number };
      if (depth >= maxDepth) continue;
      for (const rel of this.outRelationships(node)) {
        if (types !== 'any' && !types.includes(rel.type)) continue;
        if (!seen.has(rel.to)) {
          seen.add(rel.to);
          queue.push({ node: rel.to, depth: depth + 1 });
        }
      }
    }
    seen.delete(id);
    return [...seen];
  }

  /** Transitive closure following `type` edges backward. */
  dependents(id: string, types: RelationshipType[] | 'any' = 'any', maxDepth = 6): string[] {
    const seen = new Set<string>();
    const queue: Array<{ node: string; depth: number }> = [{ node: id, depth: 0 }];
    while (queue.length > 0) {
      const { node, depth } = queue.shift() as { node: string; depth: number };
      if (depth >= maxDepth) continue;
      for (const rel of this.inRelationships(node)) {
        if (types !== 'any' && !types.includes(rel.type)) continue;
        if (!seen.has(rel.from)) {
          seen.add(rel.from);
          queue.push({ node: rel.from, depth: depth + 1 });
        }
      }
    }
    seen.delete(id);
    return [...seen];
  }

  /** Breadth-first shortest path between two entities (forward + backward edges). */
  shortestPath(from: string, to: string): string[] | null {
    if (from === to) return [from];
    const prev = new Map<string, string | null>([[from, null]]);
    const queue = [from];
    while (queue.length > 0) {
      const node = queue.shift() as string;
      for (const { neighbor } of this.neighbors(node)) {
        if (!prev.has(neighbor)) {
          prev.set(neighbor, node);
          if (neighbor === to) {
            const path: string[] = [];
            let cursor: string | null = neighbor;
            while (cursor !== null) {
              path.unshift(cursor);
              cursor = prev.get(cursor) ?? null;
            }
            return path;
          }
          queue.push(neighbor);
        }
      }
    }
    return null;
  }

  /** Bounded subgraph around a center entity for graph exploration. */
  subgraph(center: string, depth = 2): { entities: GraphEntity[]; relationships: GraphRelationship[] } {
    const reachable = new Set<string>([center]);
    const frontier = new Set<string>([center]);
    for (let d = 0; d < depth; d += 1) {
      const next = new Set<string>();
      for (const node of frontier) {
        for (const rel of this.relationships(node, { direction: 'both' })) {
          for (const other of [rel.from, rel.to]) {
            if (this.hasEntity(other) && !reachable.has(other)) {
              reachable.add(other);
              next.add(other);
            }
          }
        }
      }
      frontier.clear();
      for (const n of next) frontier.add(n);
      if (frontier.size === 0) break;
    }
    const relationships = new Map<string, GraphRelationship>();
    for (const id of reachable) {
      for (const rel of this.relationships(id, { direction: 'both' })) {
        if (reachable.has(rel.from) && reachable.has(rel.to)) relationships.set(rel.id as string, rel);
      }
    }
    const entities = [...reachable].map((id) => this.entities.get(id)).filter((e): e is GraphEntity => Boolean(e));
    return { entities, relationships: [...relationships.values()] };
  }

  // ─── Stats ──────────────────────────────────────────────────

  stats(): GraphStats {
    const kinds: Record<string, number> = {};
    for (const e of this.entities.values()) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    const relationshipTypes: Record<string, number> = {};
    for (const r of this.rels.values()) relationshipTypes[r.type] = (relationshipTypes[r.type] ?? 0) + 1;
    return {
      nodes: this.entities.size,
      edges: this.rels.size,
      kinds,
      relationshipTypes,
    };
  }

  // ─── Search ─────────────────────────────────────────────────

  search(query: string, opts: SearchOptions = {}): SearchResult[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const { kind = 'any', limit = 50, fields = ['label', 'id', 'tags', 'description', 'status', 'owner'] } = opts;
    const results: SearchResult[] = [];
    for (const entity of this.entities.values()) {
      if (kind !== 'any' && entity.kind !== kind) continue;
      let score = 0;
      const label = String(entity.label ?? '').toLowerCase();
      const id = String(entity.id ?? '').toLowerCase();
      if (label === q) score += 100;
      else if (label.startsWith(q)) score += 80;
      else if (label.includes(q)) score += 50;
      if (id.includes(q)) score += 40;
      if (fields.includes('tags')) for (const t of entity.tags ?? []) if (t.toLowerCase().includes(q)) score += 25;
      if (fields.includes('status') && entity.status?.toLowerCase().includes(q)) score += 15;
      if (fields.includes('owner') && entity.owner?.toLowerCase().includes(q)) score += 15;
      if (fields.includes('description') && entity.description?.toLowerCase().includes(q)) score += 10;
      if (fields.includes('meta')) {
        for (const v of Object.values(entity.meta ?? {})) {
          if (typeof v === 'string' && v.toLowerCase().includes(q)) {
            score += 8;
            break;
          }
        }
      }
      if (score > 0) results.push({ entity, score });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  // ─── Insights ───────────────────────────────────────────────

  insights(): GraphInsight[] {
    const out: GraphInsight[] = [];
    const _stats = this.stats();

    // Orphaned entities (no relationships at all).
    const orphans: string[] = [];
    for (const e of this.entities.values()) {
      if (!this.out.has(e.id) && !this.inc.has(e.id)) orphans.push(e.id);
    }
    if (orphans.length > 0) {
      out.push({
        id: 'orphans',
        severity: orphans.length > 10 ? 'warning' : 'info',
        title: `${orphans.length} orphaned entities`,
        detail: 'Entities with no relationships are disconnected from the rest of the graph.',
        entityId: orphans[0],
      });
    }

    // Dead plans: not completed/cancelled and with no referencing session.
    for (const p of this.entitiesByKind('plan')) {
      const incoming = this.inRelationships(p.id);
      const referenced = incoming.some(
        (r) => r.type === 'references' || r.type === 'executes' || r.type === 'produced-artifact',
      );
      const done = p.status === 'completed' || p.status === 'cancelled';
      if (!done && !referenced) {
        out.push({
          id: `dead-plan-${p.id}`,
          severity: 'warning',
          title: `Dead plan: ${p.label}`,
          detail: 'No execution session references this plan.',
          entityId: p.id,
        });
      }
    }

    // Unverified artifacts: changeSet artifacts with no verification edge.
    const verified = new Set<string>();
    for (const r of this.rels.values()) if (r.type === 'verifies') verified.add(r.from);
    for (const a of this.entitiesByKind('artifact')) {
      if (a.id.startsWith('artifact://changeset') && !verified.has(a.id)) {
        out.push({
          id: `unverified-${a.id}`,
          severity: 'warning',
          title: `Unverified artifact: ${a.label}`,
          detail: 'This change set has not been linked to a verification report.',
          entityId: a.id,
        });
      }
    }

    // Hot files: most touched by capabilities/change sets.
    const touched = new Map<string, number>();
    for (const r of this.rels.values()) {
      if (r.type === 'touches-file') touched.set(r.to, (touched.get(r.to) ?? 0) + (r.weight ?? 1));
    }
    const hot = [...touched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (hot.length > 0 && hot[0][1] >= 3) {
      out.push({
        id: 'hot-files',
        severity: 'info',
        title: `${hot[0][1]} filesystem operations on ${hot[0][0]}`,
        detail: 'Frequently changing files are a churn risk.',
        entityId: hot[0][0],
      });
    }

    // Circular dependencies among task depends-on edges.
    const cycle = this.findCycle();
    if (cycle) {
      out.push({
        id: 'circular-dependency',
        severity: 'critical',
        title: 'Circular task dependency',
        detail: cycle.map((id) => this.entities.get(id)?.label ?? id).join(' → '),
        entityId: cycle[0],
      });
    }

    if (out.length === 0) {
      out.push({ id: 'clean', severity: 'info', title: 'No insights', detail: 'The graph looks healthy.' });
    }
    return out.slice(0, 20);
  }

  private findCycle(): string[] | null {
    const edges = new Map<string, string[]>();
    for (const r of this.rels.values()) {
      if (r.type !== 'depends-on') continue;
      const list = edges.get(r.from) ?? [];
      list.push(r.to);
      edges.set(r.from, list);
    }
    const color = new Map<string, number>();
    const stack: string[] = [];
    const visit = (node: string): string[] | null => {
      color.set(node, 1);
      stack.push(node);
      for (const next of edges.get(node) ?? []) {
        const c = color.get(next);
        if (c === 1) {
          const idx = stack.indexOf(next);
          return [...stack.slice(idx), next];
        }
        if (c === undefined) {
          const found = visit(next);
          if (found) return found;
        }
      }
      stack.pop();
      color.set(node, 2);
      return null;
    };
    for (const node of edges.keys()) {
      if (!color.has(node)) {
        const found = visit(node);
        if (found) return found;
      }
    }
    return null;
  }

  // ─── Health ─────────────────────────────────────────────────

  health(): GraphHealth {
    const stats = this.stats();
    let orphans = 0;
    for (const e of this.entities.values()) {
      if (!this.out.has(e.id) && !this.inc.has(e.id)) orphans += 1;
    }

    const orphanPct = stats.nodes > 0 ? (orphans / stats.nodes) * 100 : 0;
    const docs = stats.kinds.document ?? 0;
    const plans = stats.kinds.plan ?? 0;
    const tasks = stats.kinds.task ?? 0;
    const artifacts = stats.kinds.artifact ?? 0;
    const verifications = stats.kinds.verification ?? 0;
    const docsCoverage = plans > 0 ? Math.min(100, Math.round((docs / Math.max(1, plans)) * 50)) : 0;
    const verificationCoverage = artifacts > 0 ? Math.min(100, Math.round((verifications / artifacts) * 100)) : 0;

    const checks: GraphHealth['checks'] = [
      {
        id: 'coverage',
        name: 'Graph completeness',
        status: stats.nodes > 0 ? 'pass' : 'warn',
        detail: `${stats.nodes} nodes · ${stats.edges} edges`,
      },
      {
        id: 'orphans',
        name: 'Orphan detection',
        status: orphanPct < 15 ? 'pass' : orphanPct < 35 ? 'warn' : 'fail',
        detail: `${orphans} orphaned entities (${Math.round(orphanPct)}%)`,
      },
      {
        id: 'docs',
        name: 'Documentation coverage',
        status: docs > 0 ? 'pass' : 'warn',
        detail: `${docs} documents indexed`,
      },
      {
        id: 'verification',
        name: 'Verification coverage',
        status: verificationCoverage >= 50 ? 'pass' : verificationCoverage > 0 ? 'warn' : 'fail',
        detail: `${verificationCoverage}% of artifacts verified`,
      },
      {
        id: 'tasks',
        name: 'Task health',
        status: tasks > 0 ? 'pass' : 'warn',
        detail: `${tasks} tasks · ${plans} plans`,
      },
    ];

    const passCount = checks.filter((c) => c.status === 'pass').length;
    const integrity = stats.nodes > 0 ? (passCount / checks.length) * 100 : 0;

    return {
      coverage: stats.nodes > 0 ? Math.round((stats.edges / Math.max(1, stats.nodes * 3)) * 100) : 0,
      orphaned: orphans,
      relationshipIntegrity: Math.round(integrity),
      docsCoverage,
      verificationCoverage,
      dependencyHealth: this.findCycle() ? 0 : 100,
      checks,
    };
  }
}

export function kindOf(id: string): string | null {
  return parseEntityId(id).kind;
}
