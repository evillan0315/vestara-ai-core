import { describe, expect, it } from 'vitest';
import { diffStates, EngineeringEventStore, entityId, executeGraphQuery, type GraphEvent } from '../src/index.js';

function plan(id: string, status: string) {
  return { id: entityId('plan', id), kind: 'plan' as const, label: `Plan ${id}`, status };
}

function task(id: string, status: string) {
  return { id: entityId('task', id), kind: 'task' as const, label: `Task ${id}`, status };
}

describe('diffStates', () => {
  it('emits created, updated, and deleted entity events', () => {
    const before = { entities: [plan('P-1', 'draft')], relationships: [] };
    const after = {
      entities: [plan('P-1', 'approved'), plan('P-2', 'executing')],
      relationships: [],
    };
    const events = diffStates(before, after, '2026-01-01T00:00:00Z', 'test');
    const types = events.map((e) => e.type);
    expect(types).toContain('entity-updated');
    expect(types).toContain('entity-created');
    const update = events.find((e) => e.type === 'entity-updated');
    expect(update?.patch?.status).toBe('approved');
  });

  it('emits relationship added and removed events', () => {
    const p = entityId('plan', 'P-1');
    const t = entityId('task', 'P-1:T-1');
    const before = { entities: [], relationships: [{ from: p, to: t, type: 'contains' as const }] };
    const after = {
      entities: [],
      relationships: [{ from: p, to: t, type: 'depends-on' as const }],
    };
    const events = diffStates(before, after, '2026-01-01T00:00:00Z');
    expect(events.some((e) => e.type === 'relationship-added' && e.relationshipType === 'depends-on')).toBe(true);
    expect(events.some((e) => e.type === 'relationship-removed' && e.relationshipType === 'contains')).toBe(true);
  });
});

describe('EngineeringEventStore', () => {
  it('assigns monotonic sequence numbers', () => {
    const store = new EngineeringEventStore();
    const appended = store.append([
      {
        at: '2026-01-01T00:00:00Z',
        type: 'entity-created',
        entityId: 'a',
        entity: { id: 'a', kind: 'plan', label: 'A' },
      },
      {
        at: '2026-01-01T00:00:01Z',
        type: 'entity-created',
        entityId: 'b',
        entity: { id: 'b', kind: 'task', label: 'B' },
      },
    ]);
    expect(appended[0].seq).toBe(1);
    expect(appended[1].seq).toBe(2);
    expect(store.eventCount).toBe(2);
  });

  it('reconstructs state at a point in time by replaying events', () => {
    const store = new EngineeringEventStore();
    store.append([
      {
        at: '2026-01-01T09:00:00Z',
        type: 'entity-created',
        entityId: entityId('plan', 'P-1'),
        entity: plan('P-1', 'draft'),
      },
    ]);
    store.append([
      {
        at: '2026-01-01T09:05:00Z',
        type: 'entity-updated',
        entityId: entityId('plan', 'P-1'),
        patch: { status: 'approved' },
      },
    ]);
    store.append([
      {
        at: '2026-01-01T09:12:00Z',
        type: 'entity-updated',
        entityId: entityId('plan', 'P-1'),
        patch: { status: 'running' },
      },
    ]);

    const atDraft = store.stateAt('2026-01-01T09:01:00Z');
    expect(atDraft.getEntity(entityId('plan', 'P-1'))?.status).toBe('draft');

    const atApproved = store.stateAt('2026-01-01T09:06:00Z');
    expect(atApproved.getEntity(entityId('plan', 'P-1'))?.status).toBe('approved');

    const atRunning = store.stateAt('2026-01-01T09:30:00Z');
    expect(atRunning.getEntity(entityId('plan', 'P-1'))?.status).toBe('running');
  });

  it('supports entity deletion in replay', () => {
    const store = new EngineeringEventStore();
    store.append([
      {
        at: '2026-01-01T09:00:00Z',
        type: 'entity-created',
        entityId: 'x',
        entity: { id: 'x', kind: 'plan', label: 'X' },
      },
    ]);
    store.append([{ at: '2026-01-01T09:10:00Z', type: 'entity-deleted', entityId: 'x' }]);
    expect(store.stateAt('2026-01-01T09:05:00Z').hasEntity('x')).toBe(true);
    expect(store.stateAt('2026-01-01T09:20:00Z').hasEntity('x')).toBe(false);
  });

  it('uses checkpoints for faster reconstruction without changing results', () => {
    const store = new EngineeringEventStore({ checkpointEvery: 3 });
    store.append([
      {
        at: '2026-01-01T09:00:00Z',
        type: 'entity-created',
        entityId: 'a',
        entity: { id: 'a', kind: 'plan', label: 'A' },
      },
      {
        at: '2026-01-01T09:01:00Z',
        type: 'entity-created',
        entityId: 'b',
        entity: { id: 'b', kind: 'plan', label: 'B' },
      },
    ]);
    store.append([
      { at: '2026-01-01T09:02:00Z', type: 'entity-updated', entityId: 'a', patch: { status: 'approved' } },
      {
        at: '2026-01-01T09:03:00Z',
        type: 'entity-created',
        entityId: 'c',
        entity: { id: 'c', kind: 'task', label: 'C' },
      },
    ]);
    expect(store.getCheckpoints().length).toBe(1); // 4 events ≥ every=3 → checkpoint
    const graph = store.stateAt('2026-01-01T09:05:00Z');
    expect(graph.hasEntity('a')).toBe(true);
    expect(graph.hasEntity('c')).toBe(true);
    expect(graph.getEntity('a')?.status).toBe('approved');
    // Compare against a fresh store without checkpoints.
    const plain = new EngineeringEventStore();
    plain.append(store.all().map(({ seq: _seq, ...rest }) => rest));
    expect(plain.stateAt('2026-01-01T09:05:00Z').toJSON()).toEqual(graph.toJSON());
  });

  it('filters history to a single entity', () => {
    const store = new EngineeringEventStore();
    store.append([
      {
        at: '2026-01-01T09:00:00Z',
        type: 'entity-created',
        entityId: 'a',
        entity: { id: 'a', kind: 'plan', label: 'A' },
      },
    ]);
    store.append([
      {
        at: '2026-01-01T09:01:00Z',
        type: 'entity-created',
        entityId: 'b',
        entity: { id: 'b', kind: 'plan', label: 'B' },
      },
    ]);
    store.append([
      { at: '2026-01-01T09:02:00Z', type: 'entity-updated', entityId: 'a', patch: { status: 'approved' } },
    ]);
    const hist = store.history('a');
    expect(hist).toHaveLength(2);
    expect(hist.every((e) => e.entityId === 'a')).toBe(true);
  });

  it('computes structural diffs between two points in time', () => {
    const store = new EngineeringEventStore();
    store.append([
      {
        at: '2026-01-01T09:00:00Z',
        type: 'entity-created',
        entityId: entityId('plan', 'P-1'),
        entity: plan('P-1', 'draft'),
      },
    ]);
    store.append([
      {
        at: '2026-01-01T09:05:00Z',
        type: 'entity-created',
        entityId: entityId('plan', 'P-2'),
        entity: plan('P-2', 'approved'),
      },
      {
        at: '2026-01-01T09:05:00Z',
        type: 'entity-updated',
        entityId: entityId('plan', 'P-1'),
        patch: { status: 'approved' },
      },
    ]);
    const diff = store.diff('2026-01-01T09:01:00Z', '2026-01-01T09:10:00Z');
    expect(diff.entitiesAdded.map((e) => e.id)).toContain(entityId('plan', 'P-2'));
    expect(diff.entitiesUpdated.map((u) => u.id)).toContain(entityId('plan', 'P-1'));
    expect(diff.entitiesRemoved).toHaveLength(0);
  });
});

describe('executeGraphQuery', () => {
  function buildGraph() {
    const events: GraphEvent[] = [];
    const store = new EngineeringEventStore();
    const p = entityId('plan', 'P-1');
    const t1 = entityId('task', 'P-1:T-1');
    const t2 = entityId('task', 'P-1:T-2');
    const file = entityId('file', 'src/a.ts');
    store.append([
      { at: '2026-01-01T09:00:00Z', type: 'entity-created', entityId: p, entity: plan('P-1', 'executing') },
      { at: '2026-01-01T09:00:00Z', type: 'entity-created', entityId: t1, entity: task('P-1:T-1', 'in-progress') },
      { at: '2026-01-01T09:00:00Z', type: 'entity-created', entityId: t2, entity: task('P-1:T-2', 'pending') },
      {
        at: '2026-01-01T09:00:00Z',
        type: 'entity-created',
        entityId: file,
        entity: { id: file, kind: 'file', label: 'src/a.ts' },
      },
    ]);
    store.append([
      { at: '2026-01-01T09:00:01Z', type: 'relationship-added', from: p, to: t1, relationshipType: 'contains' },
      { at: '2026-01-01T09:00:01Z', type: 'relationship-added', from: p, to: t2, relationshipType: 'contains' },
      { at: '2026-01-01T09:00:01Z', type: 'relationship-added', from: t1, to: file, relationshipType: 'touches-file' },
    ]);
    void events;
    return { store, p, t1, t2, file };
  }

  it('walks a bounded neighborhood with a relationship filter', () => {
    const { store, p, t1, file } = buildGraph();
    const result = executeGraphQuery(store.stateAt(new Date()), {
      start: p,
      direction: 'outgoing',
      relationships: ['contains'],
      depth: 2,
    });
    expect(result.nodes.some((n) => n.id === t1)).toBe(true);
    expect(result.nodes.some((n) => n.id === file)).toBe(false); // touches-file filtered out
  });

  it('supports temporal queries by querying a past state', () => {
    const { store, p, t2 } = buildGraph();
    const result = executeGraphQuery(store.stateAt('2026-01-01T09:00:01Z'), {
      start: p,
      direction: 'outgoing',
      depth: 2,
    });
    expect(result.nodes.map((n) => n.id)).toContain(t2);
  });

  it('filters result nodes by kind while keeping the anchor', () => {
    const { store, p, file } = buildGraph();
    const result = executeGraphQuery(store.stateAt(new Date()), {
      start: p,
      direction: 'both',
      depth: 3,
      kind: 'file',
    });
    expect(result.nodes.map((n) => n.id)).toEqual([p, file]);
  });
});
