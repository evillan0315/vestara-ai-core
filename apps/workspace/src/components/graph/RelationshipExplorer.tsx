/**
 * Relationship Explorer — interactive engineering graph visualization.
 *
 * Pure-SVG renderer with pan/zoom (no graph library). Nodes are laid out
 * radially from the center entity by BFS depth. Clicking a node opens the
 * Universal Inspector.
 */

import { useMemo, useRef, useState } from 'react';
import type { GraphEntity, GraphRelationship } from '../../lib/graph';

const KIND_COLORS: Record<string, string> = {
  repository: '#f59e0b',
  project: '#f59e0b',
  plan: '#3b82f6',
  task: '#60a5fa',
  agent: '#a78bfa',
  execution: '#06b6d4',
  session: '#14b8a6',
  artifact: '#ec4899',
  review: '#8b5cf6',
  verification: '#10b981',
  document: '#6366f1',
  file: '#52525b',
  package: '#f97316',
  capability: '#eab308',
  event: '#6b7280',
};

function kindColor(kind: string): string {
  return KIND_COLORS[kind] ?? '#6b7280';
}

interface ExplorerProps {
  centerId: string;
  entities: GraphEntity[];
  relationships: GraphRelationship[];
  onSelect: (id: string) => void;
}

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  r: number;
}

function computeDepths(
  centerId: string,
  entities: GraphEntity[],
  relationships: GraphRelationship[],
): Map<string, number> {
  const ids = new Set(entities.map((e) => e.id));
  const adj = new Map<string, Set<string>>();
  for (const r of relationships) {
    if (!ids.has(r.from) || !ids.has(r.to)) continue;
    const a = adj.get(r.from) ?? new Set();
    a.add(r.to);
    adj.set(r.from, a);
    const b = adj.get(r.to) ?? new Set();
    b.add(r.from);
    adj.set(r.to, b);
  }
  const depth = new Map<string, number>();
  depth.set(centerId, 0);
  const queue = [centerId];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    const d = depth.get(node) ?? 0;
    for (const next of adj.get(node) ?? []) {
      if (!depth.has(next)) {
        depth.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return depth;
}

export function RelationshipExplorer({ centerId, entities, relationships, onSelect }: ExplorerProps) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [drag, setDrag] = useState<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 900;
  const H = 620;

  const layout = useMemo(() => {
    const depth = computeDepths(centerId, entities, relationships);
    const byDepth = new Map<number, string[]>();
    for (const e of entities) {
      const d = depth.get(e.id) ?? 1;
      const list = byDepth.get(d) ?? [];
      list.push(e.id);
      byDepth.set(d, list);
    }
    const nodes = new Map<string, LayoutNode>();
    const maxDepth = Math.max(1, ...[...byDepth.keys()]);
    const cx = W / 2;
    const cy = H / 2;
    nodes.set(centerId, { id: centerId, x: cx, y: cy, r: 14 });
    for (const [d, ids] of byDepth) {
      if (d === 0) continue;
      const radius = (d / maxDepth) * (Math.min(W, H) / 2 - 70);
      const step = (Math.PI * 2) / ids.length;
      const offset = -Math.PI / 2 + (d % 2 === 0 ? 0 : Math.PI / ids.length);
      ids.forEach((id, i) => {
        nodes.set(id, {
          id,
          x: cx + radius * Math.cos(offset + step * i),
          y: cy + radius * Math.sin(offset + step * i),
          r: 9,
        });
      });
    }
    const byId = new Map(entities.map((e) => [e.id, e]));
    const rels = relationships.filter((r) => nodes.has(r.from) && nodes.has(r.to));
    return { nodes, byId, rels };
  }, [centerId, entities, relationships]);

  const onPointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    setDrag({ startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    setTransform((t) => ({ ...t, x: drag.tx + (e.clientX - drag.startX), y: drag.ty + (e.clientY - drag.startY) }));
  };

  const onPointerUp = () => setDrag(null);

  const onWheel = (e: React.WheelEvent) => {
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.min(3, Math.max(0.4, t.scale * factor)) }));
  };

  const { nodes, byId, rels } = layout;

  return (
    <div className="graph-explorer" role="img" aria-label="Engineering graph explorer">
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        className="graph-explorer-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{ cursor: drag ? 'grabbing' : 'grab' }}
      >
        <title>Engineering graph explorer</title>
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {rels.map((r) => {
            const a = nodes.get(r.from);
            const b = nodes.get(r.to);
            if (!a || !b) return null;
            return (
              <line
                key={r.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--color-zinc-600)"
                strokeWidth={1}
                opacity={0.7}
              />
            );
          })}
          {[...nodes.values()].map((n) => {
            const entity = byId.get(n.id);
            const color = kindColor(entity?.kind ?? '');
            const isCenter = n.id === centerId;
            return (
              <g key={n.id} transform={`translate(${n.x}, ${n.y})`}>
                <a
                  href={`#node-${n.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(n.id);
                  }}
                  className="graph-explorer-node"
                  aria-label={entity?.label ?? n.id}
                >
                  <circle
                    r={isCenter ? n.r + 4 : n.r}
                    fill={color}
                    opacity={isCenter ? 1 : 0.85}
                    stroke="var(--color-zinc-950)"
                    strokeWidth={2}
                  />
                  <text
                    y={n.r + 12}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--color-zinc-300)"
                    className="graph-explorer-label"
                  >
                    {(entity?.label ?? n.id).slice(0, 24)}
                  </text>
                </a>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-explorer-legend">
        {Object.entries(KIND_COLORS)
          .slice(0, 14)
          .map(([kind, color]) => (
            <span key={kind} className="flex items-center gap-1 text-[9px] text-zinc-500">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {kind}
            </span>
          ))}
      </div>
    </div>
  );
}
