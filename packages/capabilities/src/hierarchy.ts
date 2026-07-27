import type { CapabilityDefinition } from './model';

export interface CapabilityTreeNode {
  id: string;
  label: string;
  children: CapabilityTreeNode[];
  capability?: CapabilityDefinition;
}

export interface CapabilityHierarchy {
  getRoots(): CapabilityTreeNode[];

  getNode(id: string): CapabilityTreeNode | undefined;

  getChildren(id: string): CapabilityTreeNode[];

  getParent(id: string): CapabilityTreeNode | undefined;

  getAncestors(id: string): string[];

  getDescendants(id: string): string[];

  isChildOf(child: string, parent: string): boolean;

  findLeaves(parentId?: string): CapabilityDefinition[];

  toTree(): CapabilityTreeNode[];
}

export function buildCapabilityTree(definitions: CapabilityDefinition[]): CapabilityTreeNode[] {
  const categoryMap = new Map<string, CapabilityTreeNode>();
  const leafMap = new Map<string, CapabilityDefinition>();

  for (const def of definitions) {
    leafMap.set(def.id, def);
    if (!categoryMap.has(def.category)) {
      categoryMap.set(def.category, {
        id: def.category,
        label: def.category,
        children: [],
      });
    }
  }

  for (const def of definitions) {
    const cat = categoryMap.get(def.category);
    if (cat) {
      cat.children.push({
        id: def.id,
        label: def.name,
        capability: def,
        children: [],
      });
    }
  }

  return [...categoryMap.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export class DefaultCapabilityHierarchy implements CapabilityHierarchy {
  private roots: CapabilityTreeNode[];
  private nodeIndex: Map<string, CapabilityTreeNode> = new Map();
  private parentIndex: Map<string, string> = new Map();

  constructor(definitions: CapabilityDefinition[]) {
    this.roots = buildCapabilityTree(definitions);
    this.indexNodes();
  }

  private indexNodes(): void {
    const walk = (node: CapabilityTreeNode, parentId?: string) => {
      this.nodeIndex.set(node.id, node);
      if (parentId) this.parentIndex.set(node.id, parentId);
      for (const child of node.children) {
        walk(child, node.id);
      }
    };
    for (const root of this.roots) {
      walk(root);
    }
  }

  getRoots(): CapabilityTreeNode[] {
    return [...this.roots];
  }

  getNode(id: string): CapabilityTreeNode | undefined {
    return this.nodeIndex.get(id);
  }

  getChildren(id: string): CapabilityTreeNode[] {
    const node = this.nodeIndex.get(id);
    return node ? [...node.children] : [];
  }

  getParent(id: string): CapabilityTreeNode | undefined {
    const parentId = this.parentIndex.get(id);
    if (!parentId) return undefined;
    return this.nodeIndex.get(parentId);
  }

  getAncestors(id: string): string[] {
    const ancestors: string[] = [];
    let current = this.getParent(id);
    while (current) {
      ancestors.unshift(current.id);
      current = this.getParent(current.id);
    }
    return ancestors;
  }

  getDescendants(id: string): string[] {
    const descendants: string[] = [];
    const walk = (node: CapabilityTreeNode) => {
      for (const child of node.children) {
        descendants.push(child.id);
        walk(child);
      }
    };
    const node = this.nodeIndex.get(id);
    if (node) walk(node);
    return descendants;
  }

  isChildOf(child: string, parent: string): boolean {
    const ancestors = this.getAncestors(child);
    return ancestors.includes(parent);
  }

  findLeaves(parentId?: string): CapabilityDefinition[] {
    const leaves: CapabilityDefinition[] = [];
    const walk = (node: CapabilityTreeNode) => {
      if (node.capability && node.children.length === 0) {
        leaves.push(node.capability);
      }
      for (const child of node.children) {
        walk(child);
      }
    };
    if (parentId) {
      const node = this.nodeIndex.get(parentId);
      if (node) walk(node);
    } else {
      for (const root of this.roots) walk(root);
    }
    return leaves;
  }

  toTree(): CapabilityTreeNode[] {
    return this.getRoots();
  }
}
