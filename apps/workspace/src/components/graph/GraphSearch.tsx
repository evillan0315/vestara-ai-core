/**
 * Global graph search overlay.
 *
 * Searches all graph entities (name, id, tags, status, owner) and opens the
 * Universal Inspector on selection.
 */

import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useEffect, useState } from 'react';
import { VestaraModal } from '../ui/VestaraModal.js';
import type { GraphSearchResult } from '../../lib/graph';
import { graphApi, parseEntityId } from '../../lib/graph';
import { useGraph } from './GraphContext';

export function GraphSearch() {
  const graph = useGraph();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GraphSearchResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void graphApi.search(query, undefined, 40).then((data) => {
        if (cancelled) return;
        setResults(data?.results ?? []);
        setCursor(0);
        setLoading(false);
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!graph.searchOpen) return null;

  const onSelect = (id: string) => {
    graph.closeSearch();
    graph.openInspector(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      onSelect(results[cursor].entity.id);
    }
  };

  return (
    <VestaraModal
      onClose={graph.closeSearch}
      ariaLabel="Graph search"
      className="max-w-3xl"
      accentBar={false}
    >
      <div className="flex items-center gap-2 border-b border-(--vestara-accent-border) px-4 py-3">
        <SearchRoundedIcon fontSize="inherit" className="text-(--vestara-text-muted)" />
        <input
          className="min-w-0 flex-1 border-none bg-transparent p-0 text-base text-(--vestara-text) outline-none"
          placeholder="Search every entity — plans, agents, files, docs, artifacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search the engineering graph"
        />
        <kbd className="rounded border border-(--vestara-accent-border) px-1.5 py-0.5 font-mono text-[10px] text-(--vestara-text-muted)">esc</kbd>
      </div>
      <div className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto p-3">
        {loading && query && <p className="graph-empty animate-pulse">Searching…</p>}
        {!loading && query && results.length === 0 && <p className="graph-empty">No matches for “{query}”.</p>}
        {!query && <p className="graph-empty">Type to search all entities in the engineering graph.</p>}
        {results.map((r, i) => {
          const { kind } = parseEntityId(r.entity.id);
          return (
            <button
              key={r.entity.id}
              type="button"
              className={[
                'flex w-full items-center gap-2 rounded-[var(--vestara-radius)] border px-2.5 py-2 text-left',
                cursor === i
                  ? 'border-(--vestara-accent-border) bg-(--vestara-accent-bg)'
                  : 'border-transparent bg-transparent',
              ].join(' ')}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onSelect(r.entity.id)}
            >
              <span className="graph-kind-badge">{kind ?? '?'}</span>
              <span className="truncate text-sm font-medium text-(--vestara-text)">{r.entity.label}</span>
              <code className="ml-auto max-w-50 truncate font-mono text-[10px] text-(--vestara-text-muted)">{r.entity.id}</code>
              {r.entity.status && <span className="graph-status-chip">{r.entity.status}</span>}
            </button>
          );
        })}
      </div>
    </VestaraModal>
  );
}
