/**
 * Engineering Event Store — the temporal source of truth for the graph.
 *
 * Instead of persisting full snapshots on every refresh, each refresh *diffs*
 * the previous state against the new state and appends the resulting domain
 * events to an append-only log. Any state in time is derived by replaying the
 * log (optionally from the nearest checkpoint). This is the event-sourced
 * strategy: events are truth, snapshots are derived and cacheable.
 *
 * Events:
 *   entity-created / entity-updated / entity-deleted
 *   relationship-added / relationship-removed
 */

import { EngineeringGraph } from './graph';
import type { GraphEntity, GraphRelationship, RelationshipType } from './types';

export type GraphEventType =
  | 'entity-created'
  | 'entity-updated'
  | 'entity-deleted'
  | 'relationship-added'
  | 'relationship-removed';

export interface GraphEvent {
  /** Monotonic sequence number (assigned by the store). */
  seq: number;
  at: string;
  type: GraphEventType;
  source?: string;
  entityId?: string;
  /** Full entity snapshot on entity-created. */
  entity?: GraphEntity;
  /** Changed fields on entity-updated. */
  patch?: Partial<GraphEntity>;
  /** Relationship endpoints on relationship events. */
  from?: string;
  to?: string;
  relationshipType?: RelationshipType;
  /** Full relationship on relationship-added. */
  relationship?: GraphRelationship;
}

/** Serializable graph state used for checkpoints and diffs. */
export interface GraphState {
  entities: GraphEntity[];
  relationships: GraphRelationship[];
}

export interface GraphSnapshot extends GraphState {
  at: string;
  seq: number;
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

const STATE_FIELDS: Array<keyof GraphEntity> = ['label', 'status', 'owner', 'tags', 'description', 'updatedAt', 'meta'];

function statesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffEntity(before: GraphEntity, after: GraphEntity): Partial<GraphEntity> | null {
  const patch: Partial<GraphEntity> = {};
  let changed = false;
  for (const field of STATE_FIELDS) {
    if (!statesEqual(before[field], after[field])) {
      (patch as Record<string, unknown>)[field] = after[field];
      changed = true;
    }
  }
  return changed ? patch : null;
}

function relKey(r: { from: string; to: string; type: string }): string {
  return `${r.from}>${r.to}:${r.type}`;
}

/**
 * Compute the domain events that transform `before` into `after`.
 * This is the diff that gets appended to the event log on every refresh.
 */
export function diffStates(
  before: GraphState,
  after: GraphState,
  at: string,
  source?: string,
): Array<Omit<GraphEvent, 'seq'>> {
  const events: Array<Omit<GraphEvent, 'seq'>> = [];
  const beforeEntities = new Map(before.entities.map((e) => [e.id, e]));
  const afterEntities = new Map(after.entities.map((e) => [e.id, e]));

  for (const [id, afterEntity] of afterEntities) {
    const beforeEntity = beforeEntities.get(id);
    if (!beforeEntity) {
      events.push({ at, type: 'entity-created', source, entityId: id, entity: afterEntity });
    } else {
      const patch = diffEntity(beforeEntity, afterEntity);
      if (patch) events.push({ at, type: 'entity-updated', source, entityId: id, patch });
    }
  }
  for (const id of beforeEntities.keys()) {
    if (!afterEntities.has(id)) events.push({ at, type: 'entity-deleted', source, entityId: id });
  }

  const beforeRels = new Map(before.relationships.map((r) => [relKey(r), r]));
  const afterRels = new Map(after.relationships.map((r) => [relKey(r), r]));
  for (const [key, rel] of afterRels) {
    if (!beforeRels.has(key))
      events.push({
        at,
        type: 'relationship-added',
        source,
        from: rel.from,
        to: rel.to,
        relationshipType: rel.type,
        relationship: rel,
      });
  }
  for (const [key, rel] of beforeRels) {
    if (!afterRels.has(key))
      events.push({ at, type: 'relationship-removed', source, from: rel.from, to: rel.to, relationshipType: rel.type });
  }

  return events;
}

/** Apply a single event to a graph (used during replay). */
export function applyEvent(graph: EngineeringGraph, event: GraphEvent): void {
  switch (event.type) {
    case 'entity-created':
      if (event.entity) graph.addEntity(event.entity);
      break;
    case 'entity-updated':
      if (event.entityId) graph.updateEntity(event.entityId, event.patch ?? {});
      break;
    case 'entity-deleted':
      if (event.entityId) graph.removeEntity(event.entityId);
      break;
    case 'relationship-added':
      if (event.relationship) graph.addRelationship(event.relationship);
      else if (event.from && event.to && event.relationshipType) {
        graph.addRelationship({ from: event.from, to: event.to, type: event.relationshipType });
      }
      break;
    case 'relationship-removed':
      if (event.from && event.to && event.relationshipType) {
        graph.removeRelationship(event.from, event.to, event.relationshipType);
      }
      break;
  }
}

export class EngineeringEventStore {
  private events: GraphEvent[] = [];
  private seq = 0;
  private checkpoints: GraphSnapshot[] = [];
  private readonly checkpointEvery: number;
  private readonly maxCheckpoints: number;

  constructor(opts?: { checkpointEvery?: number; maxCheckpoints?: number }) {
    this.checkpointEvery = opts?.checkpointEvery ?? 2000;
    this.maxCheckpoints = opts?.maxCheckpoints ?? 10;
  }

  get eventCount(): number {
    return this.events.length;
  }

  append(events: Array<Omit<GraphEvent, 'seq'>>): GraphEvent[] {
    if (events.length === 0) return [];
    const stamped = events.map((e) => ({ ...e, seq: ++this.seq }));
    this.events.push(...stamped);
    this.maybeCheckpoint();
    return stamped;
  }

  all(): GraphEvent[] {
    return this.events;
  }

  since(seq: number): GraphEvent[] {
    return this.events.filter((e) => e.seq > seq);
  }

  /** Chronological events involving an entity (as subject or endpoint). */
  history(entityId: string): GraphEvent[] {
    return this.events.filter((e) => e.entityId === entityId || e.from === entityId || e.to === entityId);
  }

  private maybeCheckpoint(): void {
    const lastSeq = this.checkpoints.length > 0 ? this.checkpoints[this.checkpoints.length - 1].seq : 0;
    if (this.seq - lastSeq >= this.checkpointEvery) {
      this.createCheckpoint(this.events[this.events.length - 1].at);
    }
  }

  /** Force a checkpoint snapshot at the current head. */
  createCheckpoint(at?: string): GraphSnapshot {
    const snapshot: GraphSnapshot = {
      at: at ?? this.events[this.events.length - 1]?.at ?? new Date().toISOString(),
      seq: this.seq,
      entities: this.replayGraph(this.events.length).toJSON().entities,
      relationships: this.replayGraph(this.events.length).toJSON().relationships,
    };
    this.checkpoints.push(snapshot);
    if (this.checkpoints.length > this.maxCheckpoints) {
      this.checkpoints = this.checkpoints.slice(-this.maxCheckpoints);
    }
    return snapshot;
  }

  getCheckpoints(): GraphSnapshot[] {
    return this.checkpoints;
  }

  /** Reconstruct the graph by replaying the first `count` events. */
  private replayGraph(count: number): EngineeringGraph {
    const graph = new EngineeringGraph();
    const limit = Math.max(0, Math.min(count, this.events.length));
    for (let i = 0; i < limit; i += 1) applyEvent(graph, this.events[i]);
    return graph;
  }

  /** Reconstruct the graph state exactly as it was at `time`. */
  stateAt(time: string | Date): EngineeringGraph {
    const ts = new Date(time).getTime();
    let checkpoint: GraphSnapshot | null = null;
    for (const c of this.checkpoints) {
      if (new Date(c.at).getTime() <= ts) checkpoint = c;
    }
    if (!checkpoint) {
      // No checkpoint covers this time — replay from the beginning up to `time`.
      let count = this.events.length;
      for (let i = 0; i < this.events.length; i += 1) {
        if (new Date(this.events[i].at).getTime() > ts) {
          count = i;
          break;
        }
      }
      return this.replayGraph(count);
    }
    const graph = EngineeringGraph.fromJSON(checkpoint);
    for (const event of this.events) {
      if (event.seq <= checkpoint.seq) continue;
      if (new Date(event.at).getTime() > ts) break;
      applyEvent(graph, event);
    }
    return graph;
  }

  /** Structural diff between two points in time. */
  diff(from: string | Date, to: string | Date): GraphDiff {
    const fromState = this.stateAt(from).toJSON();
    const toState = this.stateAt(to).toJSON();
    const beforeEntities = new Map(fromState.entities.map((e) => [e.id, e]));
    const afterEntities = new Map(toState.entities.map((e) => [e.id, e]));
    const entitiesAdded: GraphEntity[] = [];
    const entitiesRemoved: GraphEntity[] = [];
    const entitiesUpdated: Array<{ id: string; patch: Partial<GraphEntity> }> = [];
    for (const [id, afterEntity] of afterEntities) {
      const beforeEntity = beforeEntities.get(id);
      if (!beforeEntity) entitiesAdded.push(afterEntity);
      else {
        const patch = diffEntity(beforeEntity, afterEntity);
        if (patch) entitiesUpdated.push({ id, patch });
      }
    }
    for (const id of beforeEntities.keys())
      if (!afterEntities.has(id)) entitiesRemoved.push(beforeEntities.get(id) as GraphEntity);

    const beforeRels = new Map(fromState.relationships.map((r) => [relKey(r), r]));
    const afterRels = new Map(toState.relationships.map((r) => [relKey(r), r]));
    const relationshipsAdded = [...afterRels.values()].filter((r) => !beforeRels.has(relKey(r)));
    const relationshipsRemoved = [...beforeRels.values()]
      .filter((r) => !afterRels.has(relKey(r)))
      .map((r) => ({ from: r.from, to: r.to, type: r.type }));

    return {
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      entitiesAdded,
      entitiesRemoved,
      entitiesUpdated,
      relationshipsAdded,
      relationshipsRemoved,
    };
  }

  /** The full event stream, optionally filtered to one entity (replay). */
  replay(entityId?: string): GraphEvent[] {
    return entityId ? this.history(entityId) : this.events;
  }
}

// ─── General graph query ───────────────────────────────────────

export interface GraphQuery {
  start: string;
  direction?: 'outgoing' | 'incoming' | 'both';
  relationships?: RelationshipType[];
  depth?: number;
  kind?: string;
  /** When present, execute against the state at this time (handled by the caller). */
  at?: string;
}

export interface GraphQueryResult {
  nodes: Array<{ id: string; label: string; kind: string; status?: string; depth: number }>;
  edges: Array<{ from: string; to: string; type: RelationshipType }>;
}

/**
 * Execute a bounded walk over a graph. Optionally run against a temporal
 * state by passing `stateAt(time)` first.
 */
export function executeGraphQuery(graph: EngineeringGraph, query: GraphQuery): GraphQueryResult {
  const maxDepth = Math.max(1, query.depth ?? 2);
  const relFilter = query.relationships && query.relationships.length > 0 ? new Set(query.relationships) : null;
  const direction: 'out' | 'in' | 'both' =
    query.direction === 'incoming' ? 'in' : query.direction === 'both' ? 'both' : 'out';

  const nodes = new Map<string, number>([[query.start, 0]]);
  const edges: Array<{ from: string; to: string; type: RelationshipType }> = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: query.start, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift() as { id: string; depth: number };
    if (depth >= maxDepth) continue;
    for (const rel of graph.relationships(id, { direction })) {
      if (relFilter && !relFilter.has(rel.type)) continue;
      const other = rel.from === id ? rel.to : rel.from;
      edges.push({ from: rel.from, to: rel.to, type: rel.type });
      if (!nodes.has(other)) {
        nodes.set(other, depth + 1);
        queue.push({ id: other, depth: depth + 1 });
      }
    }
  }

  let ids = [...nodes.keys()];
  if (query.kind && query.kind !== 'any') {
    ids = ids.filter((id) => graph.getEntity(id)?.kind === query.kind);
    // Keep the anchor so edges between it and the filtered neighbors render.
    if (!ids.includes(query.start)) ids.unshift(query.start);
  }
  const keep = new Set(ids);
  return {
    nodes: ids.map((id) => {
      const entity = graph.getEntity(id);
      return {
        id,
        label: entity?.label ?? id,
        kind: entity?.kind ?? 'unknown',
        status: entity?.status,
        depth: nodes.get(id) ?? 0,
      };
    }),
    edges: edges.filter((e) => keep.has(e.from) && keep.has(e.to)),
  };
}
