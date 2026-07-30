import type { AdrDocument, AdrNode } from './types.js';

export function buildGraph(docs: AdrDocument[]): Map<string, AdrNode> {
  const graph = new Map<string, AdrNode>();
  for (const doc of docs) {
    const fm = doc.frontmatter;
    const node: AdrNode = {
      id: fm.id,
      adr: fm.adr,
      title: fm.title,
      category: fm.category,
      status: fm.status,
      dependsOn: fm.depends_on.map((d) => d.id),
      referencedBy: fm.referenced_by,
      influences: fm.influences,
      filePath: doc.filePath,
    };
    graph.set(fm.id, node);
  }
  return graph;
}

export function findNode(graph: Map<string, AdrNode>, id: string): AdrNode | undefined {
  return graph.get(id);
}

export function findNodesByRole(graph: Map<string, AdrNode>, role: string): AdrNode[] {
  const results: AdrNode[] = [];
  for (const node of graph.values()) {
    if (node.influences.some((r) => r.toLowerCase() === role.toLowerCase())) {
      results.push(node);
    }
  }
  return results;
}

export function getDependencies(graph: Map<string, AdrNode>, id: string): AdrNode[] {
  const node = graph.get(id);
  if (!node) return [];
  return node.dependsOn.map((depId) => graph.get(depId)).filter((n): n is AdrNode => !!n);
}

export function getDependents(graph: Map<string, AdrNode>, id: string): AdrNode[] {
  const dependents: AdrNode[] = [];
  for (const node of graph.values()) {
    if (node.dependsOn.includes(id)) {
      dependents.push(node);
    }
  }
  return dependents;
}

export function getDependentChain(graph: Map<string, AdrNode>, id: string): string[][] {
  const chains: string[][] = [];
  const visited = new Set<string>();

  function dfs(currentId: string, path: string[]) {
    if (visited.has(currentId)) {
      chains.push([...path, currentId]);
      return;
    }
    visited.add(currentId);
    const dependents = getDependents(graph, currentId);
    if (dependents.length === 0) {
      chains.push(path);
    } else {
      for (const dep of dependents) {
        dfs(dep.id, [...path, dep.id]);
      }
    }
    visited.delete(currentId);
  }

  dfs(id, [id]);
  return chains;
}
