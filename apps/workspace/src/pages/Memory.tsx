import { useCallback, useEffect, useRef, useState } from 'react';

interface GraphNode {
  id: string;
  type: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
}
interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
}
interface GraphStats {
  nodes: number;
  relations: number;
  repositories?: number;
  modules?: number;
  agents?: number;
  artifacts?: number;
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const TYPE_ICONS: Record<string, string> = {
  repository: '◈',
  module: '▸',
  concept: '◎',
  decision: '⚑',
  plan: '△',
  changeset: '◇',
  agent: '☰',
  artifact: '📦',
  pattern: '◆',
  incident: '⚠',
};
const TYPE_COLORS: Record<string, string> = {
  repository: '#60a5fa',
  module: '#22d3ee',
  concept: '#a78bfa',
  decision: '#fbbf24',
  plan: '#f59e0b',
  changeset: '#22d3ee',
  agent: '#f472b6',
  artifact: '#4ade80',
  pattern: '#818cf8',
  incident: '#f87171',
};

const GRAPH_W = 800;
const GRAPH_H = 480;

function initLayout(nodes: GraphNode[]): LayoutNode[] {
  const cx = GRAPH_W / 2,
    cy = GRAPH_H / 2;
  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    return {
      ...n,
      x: cx + Math.cos(angle) * 120,
      y: cy + Math.sin(angle) * 120,
      vx: 0,
      vy: 0,
    };
  });
}

function simulate(layout: LayoutNode[], relations: Relation[], iterations = 80): LayoutNode[] {
  const nodes = layout.map((n) => ({ ...n }));
  for (let iter = 0; iter < iterations; iter++) {
    for (const a of nodes) {
      for (const b of nodes) {
        if (a.id === b.id) continue;
        const dx = b.x - a.x,
          dy = b.y - a.y;
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
      n.vy *= 0.9;
      n.x = Math.max(20, Math.min(GRAPH_W - 20, n.x));
      n.y = Math.max(20, Math.min(GRAPH_H - 20, n.y));
    }
  }
  return nodes;
}

export default function Memory() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [stats, setStats] = useState<GraphStats>({ nodes: 0, relations: 0 });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [layout, setLayout] = useState<LayoutNode[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [queryResult, setQueryResult] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const [semanticQuery, setSemanticQuery] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await (await fetch('/api/memory')).json();
      setNodes(d.nodes ?? []);
      setRelations(d.relations ?? []);
      setStats(d.stats ?? { nodes: 0, relations: 0 });
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const reindex = async () => {
    setIndexing(true);
    try {
      await fetch('/api/memory/index', { method: 'POST' });
      await load();
    } catch {}
    setIndexing(false);
  };

  useEffect(() => {
    if (nodes.length > 0) {
      const initial = initLayout(nodes);
      setLayout(simulate(initial, relations, 100));
    }
  }, [nodes, relations]);

  const filteredNodes = nodes.filter((n) => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    if (
      query.trim() &&
      !n.name.toLowerCase().includes(query.toLowerCase()) &&
      !n.description.toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const typeCounts = nodes.reduce((acc: Record<string, number>, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {});
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const selectNode = async (node: GraphNode) => {
    setSelectedNode(selectedNode?.id === node.id ? null : node);
  };

  const handleMouseDown = (id: string) => setDragging(id);
  const handleMouseUp = () => setDragging(null);
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setLayout((prev) =>
      prev.map((n) => (n.id === dragging ? { ...n, x: e.clientX - rect.left, y: e.clientY - rect.top } : n)),
    );
  };

  const queryMemory = async () => {
    if (!semanticQuery.trim()) return;
    setQuerying(true);
    try {
      // Search knowledge graph nodes by name/description
      const res = await fetch(`/api/memory?q=${encodeURIComponent(semanticQuery)}`);
      if (res.ok) {
        const d = await res.json();
        if (d.results && d.results.length > 0) {
          const lines = d.results.slice(0, 10).map((r: any) => {
            const node = r.node || r;
            return `• ${node.name} (${node.type}): ${(node.description || '').slice(0, 120)}`;
          });
          setQueryResult(lines.join('\n'));
        } else if (d.nodes && d.nodes.length > 0) {
          // Old API shape: filtered node list
          setNodes(d.nodes);
          setRelations(d.relations ?? []);
          setStats(d.stats ?? { nodes: d.nodes.length, relations: d.relations?.length ?? 0 });
          setQueryResult(`Found ${d.nodes.length} matching node${d.nodes.length > 1 ? 's' : ''}`);
        } else {
          setQueryResult('No matching results found.');
        }
      } else {
        setQueryResult(`Search failed (${res.status})`);
      }
    } catch (e: any) {
      setQueryResult(`Error: ${e.message}`);
    }
    setQuerying(false);
  };

  if (loading)
    return <div className="w-full px-4 py-16 text-center text-zinc-600 animate-pulse">Loading knowledge graph...</div>;

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Knowledge Graph</h1>
          <p className="text-[10px] text-zinc-600 mt-1">
            {stats.nodes} nodes · {stats.relations} relations · {typeEntries.length} types
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}
            className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            {viewMode === 'graph' ? '☰ List View' : '◉ Graph View'}
          </button>
          <button
            onClick={reindex}
            disabled={indexing}
            className="text-xs px-3 py-1.5 accent-btn rounded-lg disabled:opacity-30 cursor-pointer font-medium"
          >
            {indexing ? 'Indexing...' : '⟳ Re-index'}
          </button>
          <button
            onClick={load}
            className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-700 transition-colors cursor-pointer"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Nodes', value: stats.nodes, color: 'text-zinc-100' },
          {
            label: 'Relations',
            value: stats.relations,
            color: 'text-zinc-100',
          },
          {
            label: 'Modules',
            value: stats.modules ?? 0,
            color: 'text-cyan-400',
          },
          { label: 'Agents', value: stats.agents ?? 0, color: 'text-pink-400' },
          {
            label: 'Artifacts',
            value: stats.artifacts ?? 0,
            color: 'text-green-400',
          },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
            <div className="text-[9px] text-zinc-600 uppercase tracking-wider">{label}</div>
            <div className={`text-lg font-bold mt-1 ${value > 0 ? color : 'text-zinc-600'}`}>
              {value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Search + filters */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-50 max-w-md">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-700 text-[11px]">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or description..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-7 pr-2 py-2 text-sm text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-2 py-2 text-xs outline-none cursor-pointer"
        >
          <option value="all">All Types ({nodes.length})</option>
          {typeEntries.map(([type, count]) => (
            <option key={type} value={type}>
              {type} ({count})
            </option>
          ))}
        </select>
        <span className="text-[10px] text-zinc-700">
          {filteredNodes.length} of {nodes.length} shown
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ===== Main view ===== */}
        <div className="lg:col-span-2">
          {viewMode === 'graph' ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
              <svg
                ref={svgRef}
                width="100%"
                height={GRAPH_H}
                viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className="select-none"
              >
                {relations
                  .filter(
                    (r) =>
                      filteredNodes.some((n) => n.id === r.sourceId) && filteredNodes.some((n) => n.id === r.targetId),
                  )
                  .map((r) => {
                    const source = layout.find((n) => n.id === r.sourceId);
                    const target = layout.find((n) => n.id === r.targetId);
                    if (!source || !target) return null;
                    return (
                      <line
                        key={r.id}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="#3f3f46"
                        strokeWidth={1}
                        strokeOpacity={0.5}
                      />
                    );
                  })}
                {layout
                  .filter((n) => filteredNodes.some((fn) => fn.id === n.id))
                  .map((n) => {
                    const color = TYPE_COLORS[n.type] || '#6b7280';
                    const isSelected = selectedNode?.id === n.id;
                    return (
                      <g
                        key={n.id}
                        onMouseDown={() => handleMouseDown(n.id)}
                        onClick={() => selectNode(n)}
                        className="cursor-pointer"
                      >
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={isSelected ? 12 : 8}
                          fill={color}
                          fillOpacity={isSelected ? 0.2 : 0.08}
                        />
                        <circle
                          cx={n.x}
                          cy={n.y}
                          r={isSelected ? 8 : 5}
                          fill={color}
                          stroke={isSelected ? '#fff' : 'none'}
                          strokeWidth={isSelected ? 2 : 0}
                        />
                        <text
                          x={n.x}
                          y={n.y + (isSelected ? 15 : 12)}
                          textAnchor="middle"
                          fill="#a1a1aa"
                          fontSize={isSelected ? 9 : 8}
                          className="pointer-events-none"
                        >
                          {n.name.length > 16 ? n.name.slice(0, 14) + '…' : n.name}
                        </text>
                      </g>
                    );
                  })}
                {nodes.length === 0 && (
                  <text x={GRAPH_W / 2} y={GRAPH_H / 2} textAnchor="middle" fill="#52525b" fontSize={12}>
                    No nodes. Click "Re-index" to build the graph.
                  </text>
                )}
              </svg>
              <div className="px-3 py-1.5 border-t border-zinc-800 flex items-center gap-3 text-[9px] text-zinc-700">
                <span>Drag to reposition</span>
                <span>· Click for details</span>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg max-h-135 overflow-y-auto p-2">
              {filteredNodes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="text-2xl mb-2 opacity-30">◎</div>
                  <p className="text-xs text-zinc-700">No matching nodes</p>
                </div>
              )}
              <div className="space-y-1">
                {filteredNodes.map((n) => {
                  const color = TYPE_COLORS[n.type] || '#6b7280';
                  const icon = TYPE_ICONS[n.type] || '·';
                  const connectedCount = relations.filter((r) => r.sourceId === n.id || r.targetId === n.id).length;
                  const isSelected = selectedNode?.id === n.id;
                  return (
                    <div
                      key={n.id}
                      onClick={() => selectNode(n)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-zinc-800 border border-zinc-600'
                          : 'hover:bg-zinc-800/30 border border-transparent'
                      }`}
                    >
                      <span className="text-sm shrink-0" style={{ color }}>
                        {icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-300 truncate font-medium">{n.name}</div>
                        <div className="flex items-center gap-2 text-[9px] text-zinc-600">
                          <span className="uppercase font-medium" style={{ color }}>
                            {n.type}
                          </span>
                          <span>
                            · {connectedCount} connection
                            {connectedCount !== 1 ? 's' : ''}
                          </span>
                          {n.description && <span className="truncate text-zinc-700">{n.description}</span>}
                        </div>
                      </div>
                      {n.createdAt && (
                        <span className="text-[8px] text-zinc-700 shrink-0">
                          {new Date(n.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ===== Sidebar ===== */}
        <div className="space-y-3">
          {/* Node detail */}
          {selectedNode && (
            <div className="bg-zinc-800/80 border border-zinc-700 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg" style={{ color: TYPE_COLORS[selectedNode.type] }}>
                  {TYPE_ICONS[selectedNode.type] || '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-200 font-semibold truncate">{selectedNode.name}</div>
                  <div className="flex items-center gap-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: TYPE_COLORS[selectedNode.type] || '#6b7280',
                      }}
                    />
                    <span className="text-[9px] text-zinc-500 uppercase font-medium">{selectedNode.type}</span>
                  </div>
                </div>
              </div>
              {selectedNode.description && (
                <div className="text-[11px] text-zinc-400 mb-2 leading-relaxed">{selectedNode.description}</div>
              )}
              {(() => {
                const conns = relations.filter((r) => r.sourceId === selectedNode.id || r.targetId === selectedNode.id);
                return conns.length > 0 ? (
                  <div className="pt-2 border-t border-zinc-700">
                    <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Connections ({conns.length})
                    </span>
                    <div className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                      {conns.slice(0, 10).map((r) => {
                        const otherId = r.sourceId === selectedNode.id ? r.targetId : r.sourceId;
                        const other = nodes.find((n) => n.id === otherId);
                        if (!other) return null;
                        return (
                          <div
                            key={r.id}
                            className="flex items-center gap-1.5 text-[10px] py-0.5 cursor-pointer hover:bg-zinc-800/30 rounded px-1 -mx-1 transition-colors"
                            onClick={() => selectNode(other)}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{
                                backgroundColor: TYPE_COLORS[other.type] || '#6b7280',
                              }}
                            />
                            <span className="text-zinc-400 truncate flex-1">{other.name}</span>
                            <span className="text-zinc-700 shrink-0 text-[8px]">({r.type})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null;
              })()}
              {selectedNode.createdAt && (
                <div className="text-[9px] text-zinc-700 mt-2">
                  Created: {new Date(selectedNode.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
          {!selectedNode && (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 text-center">
              <div className="text-lg mb-1 opacity-30">◎</div>
              <p className="text-xs text-zinc-600">Click a node for details</p>
              <p className="text-[9px] text-zinc-700 mt-1">Drag to reposition in graph view</p>
            </div>
          )}

          {/* Type distribution */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
            <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-zinc-500/60" /> Type Distribution
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {typeEntries.map(([type, count]) => {
                const pct = nodes.length > 0 ? Math.round((count / nodes.length) * 100) : 0;
                const isActive = typeFilter === type;
                return (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(isActive ? 'all' : type)}
                    className={`w-full flex items-center gap-2 text-[10px] px-1.5 py-1 rounded-md transition-colors cursor-pointer ${
                      isActive ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: TYPE_COLORS[type] || '#6b7280',
                      }}
                    />
                    <span className="flex-1 text-left capitalize font-medium">{type}</span>
                    <span className="text-zinc-700 w-6 text-right">{count}</span>
                    <div className="w-12 bg-zinc-800 rounded-full h-1 overflow-hidden">
                      <div
                        className="h-1 rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: TYPE_COLORS[type] || '#6b7280',
                        }}
                      />
                    </div>
                  </button>
                );
              })}
              {typeEntries.length === 0 && (
                <p className="text-[10px] text-zinc-700 py-2 text-center italic">No types indexed</p>
              )}
            </div>
          </div>

          {/* Semantic query */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3">
            <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span className="w-1 h-3 rounded-full bg-amber-500/60" /> Query Memory
            </h3>
            <div className="flex gap-2">
              <input
                value={semanticQuery}
                onChange={(e) => setSemanticQuery(e.target.value)}
                placeholder="Ask about the codebase..."
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs px-2 py-1.5 text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
                onKeyDown={(e) => e.key === 'Enter' && queryMemory()}
              />
              <button
                onClick={queryMemory}
                disabled={querying || !semanticQuery.trim()}
                className="text-[10px] px-2.5 py-1.5 accent-btn rounded-lg disabled:opacity-30 cursor-pointer shrink-0 font-medium"
              >
                {querying ? '...' : 'Ask'}
              </button>
            </div>
            {queryResult && (
              <div className="mt-2 p-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-[10px] text-zinc-400 max-h-36 overflow-y-auto leading-relaxed">
                {queryResult}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
