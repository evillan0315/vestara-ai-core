/**
 * Engineering Graph — canonical navigation layer.
 *
 * Relationship Explorer (center entity) · stats · health · insights ·
 * impact analysis · AI graph analysis.
 */

import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphEntity, GraphEvent, GraphRelationship } from '../../lib/graph';
import { entityId, graphApi } from '../../lib/graph';
import { DocMarkdown } from '../docs/DocMarkdown';
import { inspectEntity, useGraph } from './GraphContext';
import { RelationshipExplorer } from './RelationshipExplorer';
import '../../styles/graph.css';

function toneClass(status: string): string {
  if (status === 'pass') return 'graph-status-pass';
  if (status === 'fail') return 'graph-status-fail';
  if (status === 'warn') return 'graph-status-warn';
  return 'graph-status-unknown';
}

export function GraphPage() {
  const graph = useGraph();
  const [centerId, setCenterId] = useState<string | null>(null);
  const [entities, setEntities] = useState<GraphEntity[]>([]);
  const [relationships, setRelationships] = useState<GraphRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [entityInput, setEntityInput] = useState('');
  const [impactId, setImpactId] = useState<string | null>(null);
  const [impact, setImpact] = useState<{
    dependencies: Array<{ id: string; label: string; kind: string }>;
    dependents: Array<{ id: string; label: string; kind: string }>;
  } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Temporal state
  const [atTime, setAtTime] = useState('');
  const [atState, setAtState] = useState<{ entities: number; relationships: number; sample: string[] } | null>(null);
  const [diffFrom, setDiffFrom] = useState('');
  const [diffTo, setDiffTo] = useState('');
  const [diffResult, setDiffResult] = useState<{
    added: number;
    updated: number;
    removed: number;
    relAdded: number;
    relRemoved: number;
  } | null>(null);
  const [eventFeed, setEventFeed] = useState<GraphEvent[]>([]);

  const defaultCenter = useMemo(() => entityId('repository', 'vestara-ai-core'), []);

  useEffect(() => {
    void graph.refreshStats();
    void graph.refreshInsights();
    void graph.refreshHealth();
  }, [graph]);

  const loadCenter = useCallback(async (id: string) => {
    setCenterId(id);
    setLoading(true);
    const data = await graphApi.explore(id, 2);
    setEntities(data?.entities ?? []);
    setRelationships(data?.relationships ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!centerId) void loadCenter(defaultCenter);
  }, [centerId, loadCenter, defaultCenter]);

  const loadImpact = async (id: string) => {
    setImpactId(id);
    const [deps, depsOf] = await Promise.all([graphApi.dependencies(id, 4), graphApi.dependents(id, 4)]);
    setImpact({ dependencies: deps?.dependencies ?? [], dependents: depsOf?.dependents ?? [] });
  };

  const onCenterFromInput = () => {
    const value = entityInput.trim();
    if (!value) return;
    const id = value.includes('://') ? value : `plan://${value}`;
    void loadCenter(id);
  };

  const runAi = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiAnswer('');
    const result = await graphApi.analyze(aiQuestion, impactId ?? centerId ?? undefined);
    setAiLoading(false);
    setAiAnswer(result?.answer ?? result?.error ?? 'No response.');
  };

  const reconstructAt = async () => {
    if (!atTime) return;
    const state = await graphApi.at(new Date(atTime).toISOString());
    if (!state) return;
    setAtState({
      entities: state.entities.length,
      relationships: state.relationships.length,
      sample: state.entities.slice(0, 8).map((e) => `${e.kind}://${e.label}`),
    });
  };

  const computeDiff = async () => {
    if (!diffFrom || !diffTo) return;
    const d = await graphApi.diff(new Date(diffFrom).toISOString(), new Date(diffTo).toISOString());
    if (!d) return;
    setDiffResult({
      added: d.entitiesAdded.length,
      updated: d.entitiesUpdated.length,
      removed: d.entitiesRemoved.length,
      relAdded: d.relationshipsAdded.length,
      relRemoved: d.relationshipsRemoved.length,
    });
  };

  const loadEventFeed = async () => {
    const data = await graphApi.events({ limit: 12 });
    setEventFeed(data?.events ?? []);
  };

  return (
    <div className="graph-page h-[calc(100vh-7rem)]">
      <div className="graph-toolbar">
        <div className="flex items-center gap-2">
          <span className="graph-title">Engineering Graph</span>
          {graph.stats && (
            <span className="graph-subtitle">
              {graph.stats.nodes} entities · {graph.stats.edges} relationships
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="graph-icon-btn"
            onClick={graph.openSearch}
            title="Search the graph"
            aria-label="Search the graph"
          >
            <SearchRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="graph-icon-btn"
            onClick={() => {
              void graph.refreshStats();
              void graph.refreshInsights();
              void graph.refreshHealth();
              if (centerId) void loadCenter(centerId);
            }}
            title="Refresh graph"
            aria-label="Refresh graph"
          >
            <RefreshRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="graph-btn graph-btn-primary"
            onClick={() => setAiOpen((v) => !v)}
            title="AI graph analysis"
          >
            <AutoAwesomeRoundedIcon fontSize="inherit" /> AI
          </button>
        </div>
      </div>

      <div className="graph-scroll">
        <div className="graph-content">
          {/* Stats + health */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
            {(
              [
                ['Entities', graph.stats?.nodes],
                ['Relationships', graph.stats?.edges],
                ['Completeness', graph.health ? `${graph.health.coverage}%` : '—'],
                ['Integrity', graph.health ? `${graph.health.relationshipIntegrity}%` : '—'],
                ['Orphaned', graph.health?.orphaned],
                ['Verification', graph.health ? `${graph.health.verificationCoverage}%` : '—'],
              ] as Array<[string, number | string | undefined]>
            ).map(([label, value]) => (
              <div key={label} className="graph-card">
                <span className="graph-card-label">{label}</span>
                <div className="graph-card-value">{value ?? '…'}</div>
              </div>
            ))}
          </div>

          {/* Center selector */}
          <div className="graph-card graph-card-body">
            <div className="flex flex-wrap items-center gap-2">
              <div className="graph-sub-title mb-0">Center:</div>
              <button type="button" className="graph-chip" onClick={() => void loadCenter(defaultCenter)}>
                repository
              </button>
              <button type="button" className="graph-chip" onClick={() => void loadCenter('plan://P-1')}>
                plan
              </button>
              <button type="button" className="graph-chip" onClick={() => void loadCenter('agent://agent-planner')}>
                agent
              </button>
              <input
                className="graph-input flex-1 min-w-[180px]"
                placeholder="entity id, e.g. plan://P-1"
                value={entityInput}
                onChange={(e) => setEntityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCenterFromInput();
                }}
                aria-label="Entity id to center"
              />
              <button type="button" className="graph-btn" onClick={onCenterFromInput}>
                Center
              </button>
            </div>
          </div>

          {/* Explorer */}
          <div className="graph-card graph-card-body">
            <div className="flex items-center justify-between mb-2">
              <div className="graph-section-title">
                Relationship Explorer {centerId && <span className="text-zinc-500">· {centerId}</span>}
              </div>
              {centerId && (
                <button type="button" className="graph-btn" onClick={() => void loadImpact(centerId)}>
                  Impact analysis
                </button>
              )}
            </div>
            {loading && <p className="graph-empty animate-pulse">Loading subgraph…</p>}
            {!loading && (
              <RelationshipExplorer
                centerId={centerId ?? defaultCenter}
                entities={entities}
                relationships={relationships}
                onSelect={(id) => inspectEntity(id)}
              />
            )}
          </div>

          {/* Impact analysis */}
          {impact && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="graph-card graph-card-body">
                <div className="graph-section-title">
                  Dependencies of {impactId} ({impact.dependencies.length})
                </div>
                <div className="graph-list">
                  {impact.dependencies.slice(0, 40).map((d) => (
                    <button key={d.id} type="button" className="graph-rel-row" onClick={() => inspectEntity(d.id)}>
                      <span className="graph-kind-badge">{d.kind}</span>
                      <span className="graph-rel-label truncate">{d.label}</span>
                    </button>
                  ))}
                  {impact.dependencies.length === 0 && <p className="graph-empty">No dependencies.</p>}
                </div>
              </div>
              <div className="graph-card graph-card-body">
                <div className="graph-section-title">
                  Dependents of {impactId} ({impact.dependents.length})
                </div>
                <div className="graph-list">
                  {impact.dependents.slice(0, 40).map((d) => (
                    <button key={d.id} type="button" className="graph-rel-row" onClick={() => inspectEntity(d.id)}>
                      <span className="graph-kind-badge">{d.kind}</span>
                      <span className="graph-rel-label truncate">{d.label}</span>
                    </button>
                  ))}
                  {impact.dependents.length === 0 && <p className="graph-empty">No dependents.</p>}
                </div>
              </div>
            </div>
          )}

          {/* Health + insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="graph-card graph-card-body">
              <div className="graph-section-title">Workspace Graph Health</div>
              <div className="space-y-1">
                {(graph.health?.checks ?? []).map((c) => (
                  <div key={c.id} className="graph-check">
                    <span className={`graph-status-dot ${toneClass(c.status)}`}>{c.status}</span>
                    <span className="text-[12px] text-zinc-200">{c.name}</span>
                    <span className="text-[10px] text-zinc-500 ml-auto text-right">{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="graph-card graph-card-body">
              <div className="graph-section-title">Engineering Insights</div>
              <div className="space-y-1">
                {graph.insights.length === 0 && <p className="graph-empty">No insights yet.</p>}
                {graph.insights.map((i) => (
                  <div key={i.id} className={`graph-insight graph-insight-${i.severity}`}>
                    <span className="graph-insight-sev">{i.severity}</span>
                    <div className="min-w-0">
                      <div className="text-[12px] text-zinc-100 font-medium">{i.title}</div>
                      <div className="text-[10.5px] text-zinc-500">{i.detail}</div>
                    </div>
                    {i.entityId && (
                      <button type="button" className="graph-btn ml-auto" onClick={() => inspectEntity(i.entityId!)}>
                        Inspect
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Temporal panel */}
          <div className="graph-card graph-card-body">
            <div className="flex items-center justify-between mb-2">
              <div className="graph-section-title">Temporal — Engineering Event Store</div>
              <button type="button" className="graph-btn" onClick={() => void loadEventFeed()}>
                Load event feed
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div>
                <div className="graph-sub-title">Reconstruct at time</div>
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    className="graph-input flex-1"
                    value={atTime}
                    onChange={(e) => setAtTime(e.target.value)}
                    aria-label="Reconstruct time"
                  />
                  <button type="button" className="graph-btn" onClick={() => void reconstructAt()}>
                    Reconstruct
                  </button>
                </div>
                {atState && (
                  <div className="text-[11px] text-zinc-400 mt-2">
                    {atState.entities} entities · {atState.relationships} relationships
                    <ul className="graph-list mt-1">
                      {atState.sample.map((s) => (
                        <li key={s} className="truncate text-[10px] text-zinc-500">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div>
                <div className="graph-sub-title">Diff between</div>
                <div className="flex flex-col gap-2">
                  <input
                    type="datetime-local"
                    className="graph-input"
                    value={diffFrom}
                    onChange={(e) => setDiffFrom(e.target.value)}
                    aria-label="Diff from"
                  />
                  <input
                    type="datetime-local"
                    className="graph-input"
                    value={diffTo}
                    onChange={(e) => setDiffTo(e.target.value)}
                    aria-label="Diff to"
                  />
                  <button type="button" className="graph-btn" onClick={() => void computeDiff()}>
                    Diff
                  </button>
                </div>
                {diffResult && (
                  <div className="text-[11px] text-zinc-400 mt-2">
                    +{diffResult.added} entities · ~{diffResult.updated} updated · −{diffResult.removed} removed
                    <br />+{diffResult.relAdded} relationships · −{diffResult.relRemoved} removed
                  </div>
                )}
              </div>
              <div>
                <div className="graph-sub-title">Latest events</div>
                <div className="graph-timeline max-h-[180px]">
                  {eventFeed.length === 0 && <p className="graph-empty">No events loaded.</p>}
                  {eventFeed.map((e) => (
                    <div key={e.seq} className="graph-timeline-row">
                      <span className="graph-timeline-time">#{e.seq}</span>
                      <span className="graph-rel-type">{e.type}</span>
                      <span className="text-[10.5px] text-zinc-400 truncate">
                        {e.entityId ?? (e.relationshipType ? `${e.from} ${e.relationshipType}` : '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* AI panel */}
          {aiOpen && (
            <div className="graph-card graph-card-body">
              <div className="graph-section-title">AI Graph Analysis</div>
              <div className="flex flex-col gap-2">
                <textarea
                  className="graph-input w-full min-h-[60px] resize-y p-2"
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder="Ask about this graph, e.g. why is this task blocked? what is affected by this plan?"
                  aria-label="Graph analysis question"
                />
                <button
                  type="button"
                  className="graph-btn graph-btn-primary self-end"
                  disabled={aiLoading || !aiQuestion.trim()}
                  onClick={() => void runAi()}
                >
                  {aiLoading ? 'Analyzing…' : 'Analyze graph'}
                </button>
              </div>
              {aiAnswer && !aiLoading && (
                <div className="graph-answer mt-3">
                  <DocMarkdown content={aiAnswer} currentPath="graph" onNavigate={() => {}} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
