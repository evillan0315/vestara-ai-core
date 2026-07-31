/**
 * Global graph search overlay.
 *
 * Searches all graph entities (name, id, tags, status, owner) and opens the
 * Universal Inspector on selection.
 */

import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useEffect, useRef, useState } from 'react';
import type { GraphSearchResult } from '../../lib/graph';
import { graphApi, parseEntityId } from '../../lib/graph';
import { useGraph } from './GraphContext';

export function GraphSearch() {
  const graph = useGraph();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GraphSearchResult[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (graph.searchOpen) inputRef.current?.focus();
  }, [graph.searchOpen]);

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
    if (e.key === 'Escape') graph.closeSearch();
    else if (e.key === 'ArrowDown') {
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
    <div className="graph-search" role="dialog" aria-label="Graph search">
      <div className="graph-search-row">
        <SearchRoundedIcon fontSize="inherit" className="text-zinc-500" />
        <input
          ref={inputRef}
          className="graph-search-input"
          placeholder="Search every entity — plans, agents, files, docs, artifacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search the engineering graph"
        />
        <kbd className="graph-kbd">esc</kbd>
      </div>
      <div className="graph-search-results">
        {loading && query && <p className="graph-empty animate-pulse">Searching…</p>}
        {!loading && query && results.length === 0 && <p className="graph-empty">No matches for “{query}”.</p>}
        {!query && <p className="graph-empty">Type to search all entities in the engineering graph.</p>}
        {results.map((r, i) => {
          const { kind } = parseEntityId(r.entity.id);
          return (
            <button
              key={r.entity.id}
              type="button"
              className={`graph-search-result ${cursor === i ? 'graph-search-result-active' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onSelect(r.entity.id)}
            >
              <span className="graph-kind-badge">{kind ?? '?'}</span>
              <span className="graph-search-result-label truncate">{r.entity.label}</span>
              <code className="graph-search-result-id truncate">{r.entity.id}</code>
              {r.entity.status && <span className="graph-status-chip">{r.entity.status}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
