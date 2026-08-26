import { describe, expect, it } from 'vitest';
import { EngineeringGraph, EntityRegistry, entityId, parseEntityId, RELATIONSHIP_TYPES } from '../src/index.js';
import type { GraphEntity } from '../src/types.js';

describe('entity ids', () => {
  it('builds and parses universal ids', () => {
    expect(entityId('plan', 'P-24')).toBe('plan://P-24');
    expect(entityId('file', 'packages/runtime/src/index.ts')).toBe('file://packages/runtime/src/index.ts');
    const parsed = parseEntityId('agent://developer');
    expect(parsed.kind).toBe('agent');
    expect(parsed.id).toBe('developer');
  });

  it('rejects malformed ids', () => {
    expect(parseEntityId('not-an-id').kind).toBeNull();
    expect(parseEntityId('mystery://x').kind).toBeNull();
  });

  it('exposes the canonical relationship types', () => {
    expect(RELATIONSHIP_TYPES).toContain('depends-on');
    expect(RELATIONSHIP_TYPES).toContain('verifies');
    expect(RELATIONSHIP_TYPES).toContain('touches-file');
  });
});

describe('EngineeringGraph', () => {
  function makeGraph(): {
    graph: EngineeringGraph;
    plan: GraphEntity;
    taskA: GraphEntity;
    taskB: GraphEntity;
    file: GraphEntity;
  } {
    const graph = new EngineeringGraph();
    const plan: GraphEntity = { id: entityId('plan', 'P-1'), kind: 'plan', label: 'Build auth', status: 'executing' };
    const taskA: GraphEntity = {
      id: entityId('task', 'P-1:A'),
      kind: 'task',
      label: 'Add login',
      status: 'in-progress',
    };
    const taskB: GraphEntity = { id: entityId('task', 'P-1:B'), kind: 'task', label: 'Add users', status: 'completed' };
    const file: GraphEntity = { id: entityId('file', 'src/login.ts'), kind: 'file', label: 'src/login.ts' };
    graph.addEntity(plan);
    graph.addEntity(taskA);
    graph.addEntity(taskB);
    graph.addEntity(file);
    graph.addRelationship({ from: plan.id, to: taskA.id, type: 'contains' });
    graph.addRelationship({ from: plan.id, to: taskB.id, type: 'contains' });
    graph.addRelationship({ from: taskB.id, to: taskA.id, type: 'depends-on' });
    graph.addRelationship({ from: taskA.id, to: file.id, type: 'touches-file' });
    return { graph, plan, taskA, taskB, file };
  }

  it('stores entities and relationships', () => {
    const { graph } = makeGraph();
    expect(graph.count()).toBe(4);
    expect(graph.stats().nodes).toBe(4);
    expect(graph.stats().edges).toBe(4);
  });

  it('dedupes relationships', () => {
    const { graph, plan, taskA } = makeGraph();
    expect(graph.addRelationship({ from: plan.id, to: taskA.id, type: 'contains' })).toBe(false);
    expect(graph.stats().edges).toBe(4);
  });

  it('returns forward and backlink relationships', () => {
    const { graph, plan, taskA, taskB } = makeGraph();
    expect(graph.outRelationships(plan.id).map((r) => r.to)).toContain(taskA.id);
    expect(graph.inRelationships(taskA.id).map((r) => r.type)).toContain('depends-on');
    const backlinks = graph.inRelationships(taskA.id).map((r) => r.from);
    expect(backlinks).toContain(plan.id);
    expect(backlinks).toContain(taskB.id);
  });

  it('computes transitive dependencies and dependents', () => {
    const { graph, taskA, taskB } = makeGraph();
    expect(graph.dependencies(taskB.id)).toContain(taskA.id);
    expect(graph.dependents(taskA.id)).toContain(taskB.id);
  });

  it('finds shortest paths', () => {
    const { graph, taskB, taskA, file } = makeGraph();
    const path = graph.shortestPath(taskB.id, file.id);
    expect(path).toEqual([taskB.id, taskA.id, file.id]);
  });

  it('extracts bounded subgraphs', () => {
    const { graph, plan, taskA } = makeGraph();
    const sub = graph.subgraph(plan.id, 1);
    expect(sub.entities.map((e) => e.id)).toEqual(expect.arrayContaining([plan.id, taskA.id]));
    expect(sub.relationships.length).toBeGreaterThan(0);
  });

  it('searches with ranking', () => {
    const { graph } = makeGraph();
    const results = graph.search('login');
    expect(results.length).toBeGreaterThan(0);
    // The file matches both label and id, so it ranks above the task.
    expect(results[0].entity.label).toBe('src/login.ts');
    expect(results.some((r) => r.entity.label === 'Add login')).toBe(true);
  });

  it('detects circular dependencies', () => {
    const graph = new EngineeringGraph();
    const a = { id: entityId('task', 'X:A'), kind: 'task' as const, label: 'A' };
    const b = { id: entityId('task', 'X:B'), kind: 'task' as const, label: 'B' };
    const c = { id: entityId('task', 'X:C'), kind: 'task' as const, label: 'C' };
    for (const e of [a, b, c]) graph.addEntity(e);
    graph.addRelationship({ from: a.id, to: b.id, type: 'depends-on' });
    graph.addRelationship({ from: b.id, to: c.id, type: 'depends-on' });
    graph.addRelationship({ from: c.id, to: a.id, type: 'depends-on' });
    const insights = graph.insights();
    expect(insights.some((i) => i.id === 'circular-dependency')).toBe(true);
    expect(graph.health().dependencyHealth).toBe(0);
  });

  it('reports orphans and unverified artifacts', () => {
    const graph = new EngineeringGraph();
    const orphan = { id: entityId('doc', 'lost.md'), kind: 'document' as const, label: 'lost.md' };
    const artifact = { id: entityId('artifact', 'changeset/42'), kind: 'artifact' as const, label: 'changeset/42' };
    graph.addEntity(orphan);
    graph.addEntity(artifact);
    const insights = graph.insights();
    expect(insights.some((i) => i.id === 'orphans')).toBe(true);
    expect(insights.some((i) => i.id.startsWith('unverified-'))).toBe(true);
  });
});

describe('EntityRegistry', () => {
  it('hydrates the graph from pluggable sources and drops dangling edges', async () => {
    const registry = new EntityRegistry();
    registry.registerEntitySource({
      kind: 'plan',
      priority: 10,
      collect: () => [{ id: entityId('plan', 'P-1'), kind: 'plan', label: 'Plan' }],
    });
    registry.registerEntitySource({
      kind: 'file',
      collect: () => [{ id: entityId('file', 'a.ts'), kind: 'file', label: 'a.ts' }],
    });
    registry.registerRelationshipSource({
      collect: () => [
        { from: entityId('plan', 'P-1'), to: entityId('file', 'a.ts'), type: 'touches-file' },
        { from: entityId('plan', 'P-1'), to: entityId('task', 'GHOST'), type: 'contains' },
      ],
    });
    const result = await registry.refresh();
    expect(result.entities).toBe(2);
    expect(result.relationships).toBe(1); // ghost edge dropped
    expect(registry.stats().edges).toBe(1);
    expect(registry.search('plan')[0].entity.id).toBe(entityId('plan', 'P-1'));
  });
});
