import { getDependents } from './graph.js';
import type { AdrDocument, AdrNode, VerificationReport } from './types.js';

export function findCycles(graph: Map<string, AdrNode>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string) {
    if (recStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      if (cycleStart !== -1) {
        cycles.push([...path.slice(cycleStart), nodeId]);
      }
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    recStack.add(nodeId);
    path.push(nodeId);

    const node = graph.get(nodeId);
    if (node) {
      for (const depId of node.dependsOn) {
        if (graph.has(depId)) {
          dfs(depId);
        }
      }
    }

    path.pop();
    recStack.delete(nodeId);
  }

  for (const nodeId of graph.keys()) {
    dfs(nodeId);
  }

  return cycles;
}

export function verifyGraph(
  graph: Map<string, AdrNode>,
  _docs: AdrDocument[],
  _blueprintDir?: string,
): VerificationReport {
  const brokenDependencies: { from: string; to: string; error: string }[] = [];
  const circularDependencies = findCycles(graph);
  const missingReferences: { source: string; ref: string }[] = [];
  const orphanedAdrs: string[] = [];
  const duplicateIds: string[] = [];
  const idCount = new Map<string, number>();

  for (const node of graph.values()) {
    const count = (idCount.get(node.id) ?? 0) + 1;
    idCount.set(node.id, count);
    if (count > 1) duplicateIds.push(node.id);
  }

  for (const node of graph.values()) {
    if (node.dependsOn.length === 0 && getDependents(graph, node.id).length === 0 && graph.size > 1) {
      orphanedAdrs.push(node.id);
    }

    for (const depId of node.dependsOn) {
      if (!graph.has(depId)) {
        brokenDependencies.push({ from: node.id, to: depId, error: `Depends on '${depId}' which does not exist` });
      }
    }

    for (const ref of node.referencedBy) {
      if (ref.type === 'constitution' && !ref.target) {
        missingReferences.push({ source: node.id, ref: ref.target });
      }
      if (ref.type === 'blueprint' && ref.target && !ref.target.startsWith('XX-')) {
      }
    }
  }

  const pass = brokenDependencies.length === 0 && circularDependencies.length === 0 && duplicateIds.length === 0;

  return {
    totalAdrs: graph.size,
    brokenDependencies,
    circularDependencies,
    missingReferences,
    orphanedAdrs,
    duplicateIds,
    pass,
  };
}
