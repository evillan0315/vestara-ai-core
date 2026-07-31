/**
 * Engineering Graph API client + types.
 *
 * Mirrors apps/api/src/routes/graph.ts and @vestara/engineering-graph DTOs.
 */

export type EntityKind =
  | 'project'
  | 'workspace'
  | 'repository'
  | 'package'
  | 'module'
  | 'folder'
  | 'file'
  | 'document'
  | 'specification'
  | 'blueprint'
  | 'adr'
  | 'plan'
  | 'task'
  | 'execution'
  | 'session'
  | 'timeline'
  | 'event'
  | 'artifact'
  | 'review'
  | 'verification'
  | 'approval'
  | 'agent'
  | 'worker'
  | 'capability'
  | 'filesystem'
  | 'git-commit'
  | 'git-branch'
  | 'docker'
  | 'kubernetes'
  | 'api'
  | 'service'
  | 'runtime'
  | 'diagnostic'
  | 'health'
  | 'metric'
  | 'alert'
  | 'log'
  | 'memory'
  | 'prompt'
  | 'model'
  | 'provider'
  | 'conversation'
  | 'user';

export const ENTITY_KINDS: EntityKind[] = [
  'repository',
  'project',
  'package',
  'module',
  'folder',
  'file',
  'document',
  'specification',
  'blueprint',
  'adr',
  'plan',
  'task',
  'execution',
  'session',
  'event',
  'artifact',
  'review',
  'verification',
  'approval',
  'agent',
  'worker',
  'capability',
  'docker',
  'kubernetes',
  'api',
  'service',
  'runtime',
  'diagnostic',
  'health',
  'metric',
  'alert',
  'log',
  'memory',
  'conversation',
  'user',
];

export type RelationshipType =
  | 'implements'
  | 'references'
  | 'contains'
  | 'depends-on'
  | 'creates'
  | 'updates'
  | 'deletes'
  | 'reviews'
  | 'tests'
  | 'verifies'
  | 'approves'
  | 'owns'
  | 'executes'
  | 'observes'
  | 'diagnoses'
  | 'documents'
  | 'links-to'
  | 'imports'
  | 'exports'
  | 'calls'
  | 'publishes'
  | 'subscribes'
  | 'belongs-to'
  | 'generated-by'
  | 'uses-capability'
  | 'touches-file'
  | 'produced-artifact'
  | 'caused'
  | 'triggered'
  | 'resolved'
  | 'related';

export interface GraphEntity {
  id: string;
  kind: EntityKind;
  label: string;
  status?: string;
  owner?: string;
  tags?: string[];
  description?: string;
  updatedAt?: string;
  meta?: Record<string, unknown>;
}

export interface GraphRelationship {
  id: string;
  from: string;
  to: string;
  type: RelationshipType;
  label?: string;
  weight?: number;
  timestamp?: string;
  fromLabel?: string;
  toLabel?: string;
}

export interface GraphStats {
  nodes: number;
  edges: number;
  kinds: Record<string, number>;
  relationshipTypes: Record<string, number>;
}

export interface GraphInsight {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  entityId?: string;
}

export interface GraphHealth {
  coverage: number;
  orphaned: number;
  relationshipIntegrity: number;
  docsCoverage: number;
  verificationCoverage: number;
  dependencyHealth: number;
  checks: Array<{ id: string; name: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
}

export interface GraphTimelineEntry {
  id: string;
  timestamp: string;
  type: string;
  actor: string;
  message: string;
  reason: 'connected' | 'actor' | 'mentions';
}

export interface GraphTrace {
  entity: GraphEntity;
  origin: string | null;
  history: string[];
  dependencies: string[];
  dependents: string[];
  produced: string[];
}

export interface GraphSearchResult {
  entity: GraphEntity;
  score: number;
}

export type GraphEventType =
  | 'entity-created'
  | 'entity-updated'
  | 'entity-deleted'
  | 'relationship-added'
  | 'relationship-removed';

export interface GraphEvent {
  seq: number;
  at: string;
  type: GraphEventType;
  source?: string;
  entityId?: string;
  entity?: GraphEntity;
  patch?: Partial<GraphEntity>;
  from?: string;
  to?: string;
  relationshipType?: RelationshipType;
  relationship?: GraphRelationship;
}

export interface GraphState {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

export interface GraphDiff {
  from: string;
  to: string;
  entitiesAdded: GraphEntity[];
  entitiesRemoved: GraphEntity[];
  entitiesUpdated: Array<{ id: string; patch: Partial<GraphEntity> }>;
  relationshipsAdded: GraphRelationship[];
  relationshipsRemoved: Array<{ from: string; to: string; type: RelationshipType }>;
}

export interface GraphQuery {
  start: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  relationships?: RelationshipType[];
  depth?: number;
  kind?: string;
  at?: string;
}

export interface GraphQueryResult {
  nodes: Array<{ id: string; label: string; kind: string; status?: string; depth: number }>;
  edges: Array<{ from: string; to: string; type: RelationshipType }>;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function entityId(kind: EntityKind, id: string): string {
  return `${kind}://${id}`;
}

export function parseEntityId(raw: string): { kind: string | null; id: string } {
  const idx = raw.indexOf('://');
  if (idx === -1) return { kind: null, id: raw };
  return { kind: raw.slice(0, idx), id: raw.slice(idx + 3) };
}

export const graphApi = {
  stats: () => fetchJSON<{ stats: GraphStats }>('/api/graph/stats'),

  entities: (opts?: { kind?: string; q?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.kind) params.set('kind', opts.kind);
    if (opts?.q) params.set('q', opts.q);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return fetchJSON<{ entities: GraphEntity[]; total: number }>(`/api/graph/entities?${params.toString()}`);
  },

  entity: (id: string) =>
    fetchJSON<{ entity: GraphEntity; relationships: GraphRelationship[]; backlinks: GraphRelationship[] }>(
      `/api/graph/entity/${encodeURIComponent(id)}`,
    ),

  relationships: (id: string, opts?: { direction?: 'out' | 'in' | 'both'; type?: string; limit?: number }) => {
    const params = new URLSearchParams({ entity: id });
    if (opts?.direction) params.set('direction', opts.direction);
    if (opts?.type) params.set('type', opts.type);
    if (opts?.limit) params.set('limit', String(opts.limit));
    return fetchJSON<{ relationships: GraphRelationship[] }>(`/api/graph/relationships?${params.toString()}`);
  },

  backlinks: (id: string, limit = 100) =>
    fetchJSON<{ backlinks: GraphRelationship[] }>(
      `/api/graph/backlinks?entity=${encodeURIComponent(id)}&limit=${limit}`,
    ),

  search: (q: string, kind?: string, limit = 50) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    if (kind) params.set('kind', kind);
    return fetchJSON<{ results: GraphSearchResult[] }>(`/api/graph/search?${params.toString()}`);
  },

  explore: (center: string, depth = 2) =>
    fetchJSON<{ entities: GraphEntity[]; relationships: GraphRelationship[] }>(
      `/api/graph/explore?center=${encodeURIComponent(center)}&depth=${depth}`,
    ),

  dependencies: (id: string, depth = 6) =>
    fetchJSON<{ dependencies: Array<{ id: string; label: string; kind: string }> }>(
      `/api/graph/dependencies?entity=${encodeURIComponent(id)}&depth=${depth}`,
    ),

  dependents: (id: string, depth = 6) =>
    fetchJSON<{ dependents: Array<{ id: string; label: string; kind: string }> }>(
      `/api/graph/dependents?entity=${encodeURIComponent(id)}&depth=${depth}`,
    ),

  trace: (id: string) => fetchJSON<GraphTrace>(`/api/graph/trace?entity=${encodeURIComponent(id)}`),

  timeline: (id: string) =>
    fetchJSON<{ timeline: GraphTimelineEntry[] }>(`/api/graph/timeline?entity=${encodeURIComponent(id)}`),

  insights: () => fetchJSON<{ insights: GraphInsight[] }>('/api/graph/insights'),

  health: () => fetchJSON<{ health: GraphHealth }>('/api/graph/health'),

  events: (opts?: { limit?: number; after?: number }) => {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.after) params.set('after', String(opts.after));
    return fetchJSON<{ events: GraphEvent[] }>(`/api/graph/events?${params.toString()}`);
  },

  history: (entity: string) =>
    fetchJSON<{ history: GraphEvent[] }>(`/api/graph/history?entity=${encodeURIComponent(entity)}`),

  at: (time: string) => fetchJSON<GraphState & { stats: GraphStats }>(`/api/graph/at?time=${encodeURIComponent(time)}`),

  diff: (from: string, to: string) =>
    fetchJSON<GraphDiff>(`/api/graph/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),

  replay: (entity?: string) =>
    fetchJSON<{ events: GraphEvent[] }>(`/api/graph/replay${entity ? `?entity=${encodeURIComponent(entity)}` : ''}`),

  store: () => fetchJSON<{ events: number; checkpoints: Array<{ at: string; seq: number }> }>('/api/graph/store'),

  query: async (query: GraphQuery): Promise<GraphQueryResult | { error: string } | null> => {
    try {
      const res = await fetch('/api/graph/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return { error: err.error || res.statusText };
      }
      return (await res.json()) as GraphQueryResult;
    } catch (err: any) {
      return { error: err.message };
    }
  },

  analyze: async (question: string, entity?: string): Promise<{ answer?: string; error?: string } | null> => {
    try {
      const res = await fetch('/api/graph/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, entity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return { error: err.error || res.statusText };
      }
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  },
};

// ─── Graph layout helpers (pure, testable) ────────────────────

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

/** Simple radial/level layout used by the Relationship Explorer. */
export function layoutSubgraph(
  centerId: string,
  neighbors: Array<{ id: string; depth: number }>,
  width = 900,
  height = 600,
): LayoutNode[] {
  const nodes: LayoutNode[] = [{ id: centerId, x: width / 2, y: height / 2 }];
  const byDepth = new Map<number, Array<{ id: string; depth: number }>>();
  for (const n of neighbors) {
    const list = byDepth.get(n.depth) ?? [];
    list.push(n);
    byDepth.set(n.depth, list);
  }
  const maxDepth = Math.max(
    1,
    [...byDepth.keys()].reduce((a, b) => Math.max(a, b), 1),
  );
  const cx = width / 2;
  const cy = height / 2;
  for (const [depth, items] of byDepth) {
    const radius = (depth / maxDepth) * (Math.min(width, height) / 2 - 60);
    const angleStep = (Math.PI * 2) / items.length;
    const offset = -Math.PI / 2;
    items.forEach((item, i) => {
      nodes.push({
        id: item.id,
        x: cx + radius * Math.cos(offset + angleStep * i),
        y: cy + radius * Math.sin(offset + angleStep * i),
      });
    });
  }
  return nodes;
}
