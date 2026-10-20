/**
 * FILES-PAGE-001 FP-5: Runtime-backed file search.
 *
 * Content/glob search delegating to GET /api/files/search (→
 * FilesystemRuntime.search, bounded). Results open as tabs. Empty query
 * performs no search; errors are truthful, never fixture-filled.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-5.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState } from '@vestara/ui';

interface FileSearchProps {
  onOpenPath: (path: string) => void;
}

function HighlightedPath({ path, query }: { path: string; query: string }) {
  const q = query.trim().replace(/^glob:/i, '').trim();
  if (!q) return <>{path}</>;
  const token = q.replaceAll('*', '').split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0];
  if (!token) return <>{path}</>;
  const idx = path.toLowerCase().indexOf(token.toLowerCase());
  if (idx < 0) return <>{path}</>;
  return (
    <>
      {path.slice(0, idx)}
      <mark className="files-mark">{path.slice(idx, idx + token.length)}</mark>
      {path.slice(idx + token.length)}
    </>
  );
}

export function FileSearch({ onOpenPath }: FileSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly string[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedQuery, setSearchedQuery] = useState('');
  const requestId = useRef(0);

  const runSearch = useCallback(async (raw: string) => {
    const q = raw.trim();
    if (!q) return;
    const id = requestId.current + 1;
    requestId.current = id;
    setIsSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Search failed: ${res.status}`);
      if (requestId.current !== id) return;
      setResults((data.results ?? []) as string[]);
      setSearchedQuery(q);
    } catch (err) {
      if (requestId.current !== id) return;
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      if (requestId.current === id) setIsSearching(false);
    }
  }, []);

  const search = useCallback(async () => {
    await runSearch(query);
  }, [query, runSearch]);

  // Debounced live search — type and results follow without submitting.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearchedQuery('');
      setError(null);
      return;
    }
    const timer = window.setTimeout(() => void runSearch(q), 300);
    return () => window.clearTimeout(timer);
  }, [query, runSearch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="flex shrink-0 gap-2"
        role="search"
        aria-label="File content search"
      >
        <label className="sr-only" htmlFor="files-content-search">
          Search file contents (prefix glob: for filename patterns)
        </label>
        <div className="relative min-w-0 flex-1">
          <input
            id="files-content-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contents… (glob:*.ts for filenames)"
            className="w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--files-inset-bg)] px-3 py-1.5 pr-8 text-sm text-[var(--vestara-text-primary)]"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults(null);
                setSearchedQuery('');
                setError(null);
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--vestara-radius)] px-1 text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="shrink-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-focus)] bg-[var(--vestara-accent-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--vestara-text-primary)] disabled:opacity-50"
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>
      {(results !== null || isSearching) && searchedQuery && (
        <p className="shrink-0 font-mono text-[length:var(--vestara-font-size-xs)] tracking-widest text-[var(--vestara-text-muted)]" aria-live="polite">
          {isSearching ? `SEARCHING — “${searchedQuery || query.trim()}”…` : `${results?.length ?? 0} RESULT${(results?.length ?? 0) === 1 ? '' : 'S'} — “${searchedQuery}”`}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">
        {error && <p className="text-sm text-[var(--vestara-status-error)]" role="alert">{error}</p>}
        {results !== null && !error && results.length === 0 && (
          <EmptyState title="No matches" description={`Nothing matched “${searchedQuery || query.trim()}”. Try ⌘K for filename search.`} />
        )}
        {results !== null && !error && results.length > 0 && (
          <ul aria-label="Search results" className="divide-y divide-[var(--vestara-border-subtle)] rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)]">
            {results.map((path) => (
              <li key={path}>
                <button
                  type="button"
                  onClick={() => onOpenPath(path)}
                  title={path}
                  className="block w-full truncate px-3 py-2 text-left font-mono text-sm text-[var(--vestara-text-secondary)] hover:bg-[var(--files-row-hover-bg)] hover:text-[var(--vestara-text-primary)]"
                >
                  <HighlightedPath path={path} query={searchedQuery} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {results === null && !error && !isSearching && (
          <p className="text-sm text-[var(--vestara-text-muted)]">Type to search — results appear live. Use ⌘K for filename quick-open.</p>
        )}
      </div>
    </div>
  );
}
