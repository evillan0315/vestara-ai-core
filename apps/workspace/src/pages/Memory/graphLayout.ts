import type { GraphNode, LayoutNode, Relation } from './types';
import { GRAPH_W, GRAPH_H } from './constants';

export function initLayout(nodes: GraphNode[]): LayoutNode[] {
  const cx = GRAPH_W / 2, cy = GRAPH_H / 2;
  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    return { ...n, x: cx + Math.cos(angle) * 120, y: cy + Math.sin(angle) * 120, vx: 0, vy: 0 };
  });
}

export function simulate(layout: LayoutNode[], relations: Relation[], iterations = 80): LayoutNode[] {
  const nodes = layout.map((n) => ({ ...n }));
  for (let iter = 0; iter < iterations; iter++) {
    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id === b.id) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 600 / (dist * dist);
        const connected = relations.some(
          (r) => (r.sourceId === a.id && r.targetId === b.id) || (r.sourceId === b.id && r.targetId === a.id),
        );
        const repulsion = connected ? -force * 2 : force;
        a.vx -= (dx / dist) * repulsion * 0.01;
        a.vy -= (dy / dist) * repulsion * 0.01;
      }
    }
    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 0.9;
      n.x = Math.max(20, Math.min(GRAPH_W - 20, n.x));
      n.y = Math.max(20, Math.min(GRAPH_H - 20, n.y));
    }
  }
  return nodes;
}
