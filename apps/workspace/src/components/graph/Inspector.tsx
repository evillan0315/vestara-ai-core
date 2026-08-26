/**
 * Universal Inspector — the same entity inspector wherever a user clicks.
 *
 * Tabs: Overview · Relationships · Timeline · Documentation · Execution ·
 * Artifacts · History · Actions. Any module can open it via `useGraph().openInspector(id)`.
 */

import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { EntityKind } from '../../lib/graph';
import { parseEntityId } from '../../lib/graph';
import { Drawer } from '../ui/Drawer';
import { useGraph } from './GraphContext';

type Tab =
  | 'overview'
  | 'relationships'
  | 'timeline'
  | 'documentation'
  | 'execution'
  | 'artifacts'
  | 'history'
  | 'actions';

function tone(status?: string): 'pass' | 'warn' | 'fail' | 'unknown' {
  const s = (status ?? '').toLowerCase();
  if (s.includes('fail') || s.includes('error') || s.includes('reject')) return 'fail';
  if (
    s.includes('warn') ||
    s.includes('block') ||
    s.includes('wait') ||
    s.includes('draft') ||
    s.includes('propos') ||
    s.includes('review')
  )
    return 'warn';
  if (s.includes('complete') || s.includes('pass') || s.includes('approved') || s.includes('ok')) return 'pass';
  return 'unknown';
}

function toneClass(t: string): string {
  return t === 'pass'
    ? 'graph-status-pass'
    : t === 'fail'
      ? 'graph-status-fail'
      : t === 'warn'
        ? 'graph-status-warn'
        : 'graph-status-unknown';
}

function KindBadge({ kind }: { kind: EntityKind }) {
  return <span className="graph-kind-badge">{kind}</span>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-zinc-800/60 last:border-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className="text-[11.5px] text-zinc-200 text-right break-all">{value}</span>
    </div>
  );
}

export function Inspector() {
  const graph = useGraph();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [relDirection, setRelDirection] = useState<'out' | 'in'>('out');
  const [relType, setRelType] = useState('any');

  const { inspector } = graph;
  const entityId = inspector.entityId;
  const entity = inspector.entity;
  const parsed = parseEntityId(entityId ?? '');
  const kind = parsed.kind;
  const id = parsed.id;

  const relTypes = useMemo(
    () => [...new Set(inspector.relationships.map((r) => r.type))].sort(),
    [inspector.relationships],
  );
  const visibleRels = useMemo(() => {
    const rels = inspector.relationships.filter((r) =>
      relDirection === 'out' ? r.from === entityId : r.to === entityId,
    );
    if (relType !== 'any') return rels.filter((r) => r.type === relType);
    return rels;
  }, [inspector.relationships, entityId, relDirection, relType]);

  const docs = useMemo(
    () =>
      inspector.relationships.filter(
        (r) =>
          r.type === 'documents' ||
          (r.from === entityId && parseEntityId(r.to).kind === 'document') ||
          (r.to === entityId && parseEntityId(r.from).kind === 'document'),
      ),
    [inspector.relationships, entityId],
  );

  const executions = useMemo(
    () =>
      inspector.relationships.filter((r) => {
        const other = r.from === entityId ? r.to : r.from;
        const k = parseEntityId(other).kind;
        return k === 'execution' || k === 'session' || k === 'agent';
      }),
    [inspector.relationships, entityId],
  );

  const artifacts = useMemo(
    () =>
      inspector.relationships.filter((r) => {
        const other = r.from === entityId ? r.to : r.from;
        const k = parseEntityId(other).kind;
        return k === 'artifact' || k === 'verification' || k === 'review';
      }),
    [inspector.relationships, entityId],
  );

  const openEntity = (next: string) => graph.openInspector(next);

  if (!inspector.open || !entityId) return null;

  const moduleLink = (): { label: string; to: string } | null => {
    switch (kind) {
      case 'document':
        return { label: 'Open in Documentation', to: `/docs?path=${encodeURIComponent(id)}` };
      case 'plan':
      case 'task':
      case 'execution':
      case 'session':
      case 'agent':
      case 'artifact':
      case 'review':
      case 'verification':
        return { label: 'Open in Execution Center', to: '/execution' };
      case 'repository':
      case 'health':
      case 'metric':
      case 'alert':
      case 'diagnostic':
        return { label: 'Open in Diagnostic Center', to: '/diagnostics' };
      default:
        return null;
    }
  };

  const link = moduleLink();

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'relationships', label: 'Relationships' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'documentation', label: 'Documentation' },
    { id: 'execution', label: 'Execution' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'history', label: 'History' },
    { id: 'actions', label: 'Actions' },
  ];

  return (
    <Drawer
      open={inspector.open && Boolean(entityId)}
      onClose={graph.closeInspector}
      position="right"
      defaultSize="medium"
      storageKey="graph-inspector"
      title={entity?.label ?? inspector.entityId ?? 'Inspector'}
      header={
        <div className="flex min-w-0 items-center gap-2">
          {kind && <KindBadge kind={kind as EntityKind} />}
          <code className="graph-entity-id">{inspector.entityId}</code>
          {entity?.status && (
            <span className={`graph-status-chip ${toneClass(tone(entity.status))}`}>{entity.status}</span>
          )}
          <button
            type="button"
            className="graph-icon-btn"
            onClick={() => void graph.refreshInspector()}
            title="Refresh"
            aria-label="Refresh inspector"
          >
            <RefreshRoundedIcon fontSize="inherit" />
          </button>
        </div>
      }
    >
      <div className="graph-inspector-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`graph-inspector-tab ${tab === t.id ? 'graph-inspector-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="graph-inspector-body">
        {inspector.loading && !entity && <p className="graph-empty animate-pulse">Loading entity…</p>}
        {!inspector.loading && !entity && <p className="graph-empty">Entity not found in the graph.</p>}

          {entity && tab === 'overview' && (
            <div>
              <Row label="Kind" value={kind ?? '—'} />
              <Row label="Status" value={entity.status ?? '—'} />
              <Row label="Owner" value={entity.owner ?? '—'} />
              <Row label="Updated" value={entity.updatedAt ? new Date(entity.updatedAt).toLocaleString() : '—'} />
              {entity.description && <Row label="Description" value={entity.description} />}
              {entity.tags && entity.tags.length > 0 && <Row label="Tags" value={entity.tags.join(', ')} />}
              {entity.meta && Object.keys(entity.meta).length > 0 && (
                <div className="mt-3">
                  <div className="graph-sub-title">Metadata</div>
                  {Object.entries(entity.meta).map(([k, v]) => (
                    <Row key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v)} />
                  ))}
                </div>
              )}
              {inspector.trace?.origin && (
                <div className="mt-3">
                  <div className="graph-sub-title">Origin</div>
                  <button type="button" className="graph-rel-link" onClick={() => openEntity(inspector.trace!.origin!)}>
                    <span className="graph-rel-type">origin</span> {inspector.trace.origin}
                  </button>
                </div>
              )}
              {inspector.trace && inspector.trace.produced.length > 0 && (
                <div className="mt-3">
                  <div className="graph-sub-title">Produced ({inspector.trace.produced.length})</div>
                  {inspector.trace.produced.slice(0, 10).map((p) => (
                    <button key={p} type="button" className="graph-rel-link" onClick={() => openEntity(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {entity && tab === 'relationships' && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={relDirection}
                  onChange={(e) => setRelDirection(e.target.value as 'out' | 'in')}
                  className="graph-input"
                  aria-label="Direction"
                >
                  <option value="out">Outgoing</option>
                  <option value="in">Incoming</option>
                </select>
                <select
                  value={relType}
                  onChange={(e) => setRelType(e.target.value)}
                  className="graph-input"
                  aria-label="Relationship type"
                >
                  <option value="any">All types</option>
                  {relTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              {visibleRels.length === 0 && <p className="graph-empty">No {relDirection} relationships.</p>}
              <div className="space-y-0.5">
                {visibleRels.slice(0, 80).map((r) => {
                  const other = r.from === inspector.entityId ? r.to : r.from;
                  return (
                    <button key={r.id} type="button" className="graph-rel-row" onClick={() => openEntity(other)}>
                      <span className="graph-rel-type">{r.type}</span>
                      <span className="graph-rel-label truncate">
                        {r.from === inspector.entityId ? (r.toLabel ?? r.to) : (r.fromLabel ?? r.from)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {entity && tab === 'timeline' && (
            <div className="space-y-3">
              <div>
                <div className="graph-sub-title">Correlated events ({inspector.timeline.length})</div>
                {inspector.timeline.length === 0 && (
                  <p className="graph-empty">No correlated runtime events for this entity.</p>
                )}
                <div className="graph-timeline">
                  {inspector.timeline.slice(0, 40).map((t) => (
                    <div key={t.id} className="graph-timeline-row">
                      <span className="graph-timeline-time">{new Date(t.timestamp).toLocaleTimeString()}</span>
                      <span className="graph-rel-type">{t.type}</span>
                      <span className="text-[11px] text-zinc-300 truncate">{t.message}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="graph-sub-title">Entity event log ({inspector.history.length})</div>
                {inspector.history.length === 0 && <p className="graph-empty">No stored events for this entity yet.</p>}
                <div className="graph-timeline">
                  {inspector.history.slice(0, 40).map((e) => (
                    <div key={e.seq} className="graph-timeline-row">
                      <span className="graph-timeline-time">{new Date(e.at).toLocaleString()}</span>
                      <span className="graph-rel-type">{e.type}</span>
                      <span className="text-[11px] text-zinc-300 truncate">
                        #{e.seq}
                        {e.entityId ? ` ${e.entityId}` : ''}
                        {e.relationshipType ? ` ${e.from} ${e.relationshipType} ${e.to}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {entity && tab === 'documentation' && (
            <div>
              {docs.length === 0 && (
                <p className="graph-empty">
                  No linked documentation. Documents are linked when they document plans, files, or the repository.
                </p>
              )}
              {docs.map((r) => {
                const docId = r.from === inspector.entityId ? r.to : r.from;
                const { kind: dk, id: docPath } = parseEntityId(docId);
                if (dk !== 'document') return null;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className="graph-rel-row"
                    onClick={() => navigate(`/docs?path=${encodeURIComponent(docPath)}`)}
                  >
                    <span className="graph-rel-type">{r.type}</span>
                    <span className="graph-rel-label truncate">{docPath}</span>
                  </button>
                );
              })}
            </div>
          )}

          {entity && tab === 'execution' && (
            <div>
              {executions.length === 0 && <p className="graph-empty">No linked executions, sessions, or agents.</p>}
              {executions.map((r) => {
                const other = r.from === inspector.entityId ? r.to : r.from;
                return (
                  <button key={r.id} type="button" className="graph-rel-row" onClick={() => openEntity(other)}>
                    <span className="graph-rel-type">{r.type}</span>
                    <span className="graph-rel-label truncate">
                      {r.from === inspector.entityId ? (r.toLabel ?? r.to) : (r.fromLabel ?? r.from)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {entity && tab === 'artifacts' && (
            <div>
              {artifacts.length === 0 && <p className="graph-empty">No linked artifacts, verifications, or reviews.</p>}
              {artifacts.map((r) => {
                const other = r.from === inspector.entityId ? r.to : r.from;
                return (
                  <button key={r.id} type="button" className="graph-rel-row" onClick={() => openEntity(other)}>
                    <span className="graph-rel-type">{r.type}</span>
                    <span className="graph-rel-label truncate">
                      {r.from === inspector.entityId ? (r.toLabel ?? r.to) : (r.fromLabel ?? r.from)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {entity && tab === 'history' && (
            <div>
              <div className="graph-sub-title">Referenced by ({inspector.backlinks.length})</div>
              {inspector.backlinks.length === 0 && <p className="graph-empty">No backlinks yet.</p>}
              <div className="space-y-0.5">
                {inspector.backlinks.slice(0, 60).map((r) => (
                  <button key={r.id} type="button" className="graph-rel-row" onClick={() => openEntity(r.from)}>
                    <span className="graph-rel-type">{r.type}</span>
                    <span className="graph-rel-label truncate">{r.fromLabel ?? r.from}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {entity && tab === 'actions' && (
            <div className="flex flex-col gap-2">
              {link && (
                <button type="button" className="graph-btn graph-btn-primary" onClick={() => navigate(link.to)}>
                  {link.label}
                </button>
              )}
              <button
                type="button"
                className="graph-btn"
                onClick={() => navigate(`/graph?entity=${encodeURIComponent(inspector.entityId!)}`)}
              >
                Open in Relationship Explorer
              </button>
              <button
                type="button"
                className="graph-btn"
                onClick={() => void navigator.clipboard.writeText(inspector.entityId!)}
              >
                Copy entity id
              </button>
              <button type="button" className="graph-btn" onClick={() => void graph.refreshInspector()}>
                Refresh relationships
              </button>
            </div>
          )}
        </div>
    </Drawer>
  );
}
