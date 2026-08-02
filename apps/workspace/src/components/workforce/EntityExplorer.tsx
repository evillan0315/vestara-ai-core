/**
 * Shared entity-list explorer shell (search · runtime filter · status filter ·
 * provenance · last observed · Inspector link).
 *
 * Reused by every runtime-intelligence explorer (commands, MCP servers,
 * plugins, providers, models, permissions, instructions) so each kind gets a
 * consistent surface instead of a bespoke page.
 */

import { useMemo, useState } from 'react';
import { openInspector } from './inspector';

export interface EntityExplorerItem {
  id: string;
  name: string;
  description?: string;
  status?: string;
  scope?: string;
  provenance?: string;
  lastObserved?: string;
  runtimeType: string;
  runtimeName: string;
  entityId?: string;
  badges?: string[];
}

const STATUS_COLOR: Record<string, string> = {
  connected: 'text-(--vestara-green)',
  loaded: 'text-(--vestara-green)',
  configured: 'text-(--vestara-blue)',
  failed: 'text-(--vestara-red)',
  disconnected: 'text-(--vestara-amber)',
  unknown: 'text-(--vestara-text-muted)',
  available: 'text-(--vestara-green)',
  advertised: 'text-(--vestara-amber)',
  loaded2: 'text-(--vestara-green)',
};

const RUNTIME_COLOR: Record<string, string> = {
  opencode: 'text-(--vestara-amber)',
  'claude-code': 'text-(--vestara-purple)',
  'openai-codex': 'text-(--vestara-green)',
  vestara: 'text-(--vestara-blue)',
};

export function EntityExplorer({ items, title }: { items: EntityExplorerItem[]; title: string }) {
  const [query, setQuery] = useState('');
  const [runtimeFilter, setRuntimeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const runtimes = useMemo(() => [...new Set(items.map((item) => item.runtimeType))], [items]);
  const statuses = useMemo(() => [...new Set(items.map((item) => item.status ?? '').filter(Boolean))], [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (runtimeFilter && item.runtimeType !== runtimeFilter) return false;
      if (statusFilter && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description ?? '').toLowerCase().includes(q) ||
        (item.provenance ?? '').toLowerCase().includes(q) ||
        (item.badges ?? []).some((badge) => badge.toLowerCase().includes(q))
      );
    });
  }, [items, query, runtimeFilter, statusFilter]);

  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">{title} ({filtered.length})</div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search…"
          className="text-[10px] px-2 py-1 rounded-md bg-black/30 border border-zinc-700 text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) focus:outline-none focus:border-(--vestara-accent-border-active)"
        />
      </div>

      <div className="flex items-center gap-1 flex-wrap mb-2">
        <button
          type="button"
          onClick={() => setRuntimeFilter(null)}
          className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${runtimeFilter === null ? 'bg-(--vestara-accent-border-active)/20 text-(--vestara-text)' : 'bg-zinc-800 text-(--vestara-text-muted)'}`}
        >
          all runtimes
        </button>
        {runtimes.map((runtime) => (
          <button
            key={runtime}
            type="button"
            onClick={() => setRuntimeFilter(runtimeFilter === runtime ? null : runtime)}
            className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${runtimeFilter === runtime ? 'bg-(--vestara-accent-border-active)/20 text-(--vestara-text)' : 'bg-zinc-800 text-(--vestara-text-muted)'}`}
          >
            {runtime}
          </button>
        ))}
        {statuses.length > 1 && (
          <>
            <span className="text-[9px] text-(--vestara-text-dim) mx-1">|</span>
            {statuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(statusFilter === status ? null : status)}
                className={`text-[9px] px-1.5 py-0.5 rounded cursor-pointer ${statusFilter === status ? 'bg-(--vestara-accent-border-active)/20 text-(--vestara-text)' : 'bg-zinc-800 text-(--vestara-text-muted)'}`}
              >
                {status}
              </button>
            ))}
          </>
        )}
      </div>

      {filtered.length === 0 && <p className="text-[11px] text-(--vestara-text-muted)">Nothing matches the current filters.</p>}
      <div className="space-y-1 max-h-96 overflow-auto">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="p-2 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors"
            onDoubleClick={() => item.entityId && openInspector(item.entityId)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[12px] font-medium ${RUNTIME_COLOR[item.runtimeType] ?? 'text-(--vestara-text)'}`}>{item.name}</span>
              <span className="text-[9px] text-(--vestara-text-muted)">{item.runtimeName}</span>
              {item.status && <span className={`text-[9px] px-1 py-0.5 rounded bg-zinc-800 ${STATUS_COLOR[item.status] ?? 'text-(--vestara-text-muted)'}`}>{item.status}</span>}
              {item.scope && <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted)">{item.scope}</span>}
              {item.provenance && <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted)">{item.provenance}</span>}
              {(item.badges ?? []).slice(0, 3).map((badge) => (
                <span key={badge} className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted)">{badge}</span>
              ))}
              {item.entityId && (
                <button
                  type="button"
                  onClick={() => openInspector(item.entityId!)}
                  className="text-[9px] text-(--vestara-text-2) underline decoration-dotted hover:text-(--vestara-text) ml-auto cursor-pointer"
                  title="Open in Inspector"
                >
                  inspect
                </button>
              )}
            </div>
            {item.description && <div className="text-[10px] text-(--vestara-text-muted) mt-0.5 line-clamp-2">{item.description}</div>}
            {item.lastObserved && <div className="text-[9px] text-(--vestara-text-dim) mt-0.5">last observed {item.lastObserved}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
