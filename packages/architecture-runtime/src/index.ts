import type { AdrNode, ImpactReport, GraphRuntime, VerificationReport } from './types.js';
import type { AdrDocument } from './types.js';
import { buildGraph, findNode, getDependencies, getDependents, findNodesByRole, getDependentChain } from './graph.js';
import { verifyGraph } from './validator.js';
import { loadAllAdrs } from './parser.js';

export type { GraphRuntime, VerificationReport, ImpactReport, AdrNode };

export class ArchitectureRuntime implements GraphRuntime<AdrNode> {
  private graph: Map<string, AdrNode>;
  private docs: AdrDocument[];
  private adrDir: string;

  constructor(adrDir: string) {
    this.adrDir = adrDir;
    this.docs = loadAllAdrs(adrDir);
    this.graph = buildGraph(this.docs);
  }

  getNode(id: string): AdrNode | undefined {
    return findNode(this.graph, id);
  }

  getAllNodes(): AdrNode[] {
    return Array.from(this.graph.values());
  }

  getDependencies(id: string): AdrNode[] {
    return getDependencies(this.graph, id);
  }

  getDependents(id: string): AdrNode[] {
    return getDependents(this.graph, id);
  }

  getInfluencedRoles(id: string): string[] {
    const node = this.graph.get(id);
    return node?.influences ?? [];
  }

  findDecisionsByRole(role: string): AdrNode[] {
    return findNodesByRole(this.graph, role);
  }

  analyzeImpact(id: string): ImpactReport | null {
    const target = this.graph.get(id);
    if (!target) return null;

    const affectedAdrs = getDependents(this.graph, id);
    const chains = getDependentChain(this.graph, id);

    const affectedBlueprints = new Set<string>();
    const affectedAgents = new Set<string>();

    for (const adr of [target, ...affectedAdrs]) {
      for (const ref of adr.referencedBy) {
        affectedBlueprints.add(`${ref.type}: ${ref.target}`);
      }
      for (const role of adr.influences) {
        affectedAgents.add(role);
      }
    }

    for (const adr of affectedAdrs) {
      for (const depId of adr.dependsOn) {
        const depNode = this.graph.get(depId);
        if (depNode && depNode !== target && !affectedAdrs.includes(depNode)) {
        }
      }
    }

    const depth = chains.reduce((max, c) => Math.max(max, c.length), 0);
    let risk: 'low' | 'medium' | 'high' = 'low';
    if (depth >= 4 || affectedAdrs.length >= 3) risk = 'high';
    else if (depth >= 2 || affectedAdrs.length >= 1) risk = 'medium';

    return {
      target,
      affectedAdrs,
      affectedBlueprints: Array.from(affectedBlueprints).sort(),
      affectedAgents: Array.from(affectedAgents).sort(),
      dependentChain: chains,
      risk,
    };
  }

  verify() {
    return verifyGraph(this.graph, this.docs);
  }

  reload(): void {
    this.docs = loadAllAdrs(this.adrDir);
    this.graph = buildGraph(this.docs);
  }
}
