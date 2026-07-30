export interface AdrFrontmatter {
  id: string;
  adr: string;
  title: string;
  category: string;
  version: number;
  date: string;
  status: string;
  author: string;
  deciders: string[];
  consulted?: string[];
  informed?: string[];
  tags?: string[];
  depends_on: DependencyRef[];
  referenced_by: ReferenceEntry[];
  influences: string[];
}

export interface DependencyRef {
  id: string;
  relationship?: string;
}

export interface ReferenceEntry {
  type: 'blueprint' | 'constitution' | 'runtime';
  target: string;
}

export interface AdrDocument {
  frontmatter: AdrFrontmatter;
  filePath: string;
  raw: string;
}

export interface AdrNode {
  id: string;
  adr: string;
  title: string;
  category: string;
  status: string;
  dependsOn: string[];
  referencedBy: ReferenceEntry[];
  influences: string[];
  filePath: string;
}

export interface ImpactReport {
  target: AdrNode;
  affectedAdrs: AdrNode[];
  affectedBlueprints: string[];
  affectedAgents: string[];
  dependentChain: string[][];
  risk: 'low' | 'medium' | 'high';
}

export interface VerificationReport {
  totalAdrs: number;
  brokenDependencies: { from: string; to: string; error: string }[];
  circularDependencies: string[][];
  missingReferences: { source: string; ref: string }[];
  orphanedAdrs: string[];
  duplicateIds: string[];
  pass: boolean;
}

/**
 * Shared interface for graph-based runtimes.
 * Every important domain in Vestara (architecture, knowledge, conversation, memory)
 * can be modeled as a typed directed graph with query, validate, and reason operations.
 */
export interface GraphRuntime<TNode extends { id: string }> {
  getAllNodes(): TNode[];
  getNode(id: string): TNode | undefined;
  getDependencies(id: string): TNode[];
  getDependents(id: string): TNode[];
  verify(): VerificationReport;
}
