export interface GraphNode {
  id: string;
  type: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}

export interface GraphStats {
  nodes: number;
  relations: number;
  repositories?: number;
  modules?: number;
  agents?: number;
  artifacts?: number;
}

export interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}
