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

import { useCallback, useState } from 'react';
import { EmptyState } from '@vestara/ui';

interface FileSearchProps {
  onOpenPath: (path: string) => void;
}

export function FileSearch({ onOpenPath }: FileSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly string[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setIsSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Search failed: ${res.status}`);
      setResults((data.results ?? []) as string[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
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
        <input
          id="files-content-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search contents… (glob:*.ts for filenames)"
          className="min-w-0 flex-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--files-inset-bg)] px-3 py-1.5 text-sm text-[var(--vestara-text-primary)]"
        />
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="shrink-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-focus)] bg-[var(--vestara-accent-bg)] px-3 py-1.5 text-sm font-semibold text-[var(--vestara-text-primary)] disabled:opacity-50"
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>
      <div className="min-h-0 flex-1 overflow-auto" aria-live="polite">
        {error && <p className="text-sm text-[var(--vestara-status-error)]" role="alert">{error}</p>}
        {results !== null && !error && results.length === 0 && (
          <EmptyState title="No matches" description={`Nothing matched “${query.trim()}”.`} />
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
                  {path}
                </button>
              </li>
            ))}
          </ul>
        )}
        {results === null && !error && !isSearching && (
          <p className="text-sm text-[var(--vestara-text-muted)]">Results from the governed runtime search appear here.</p>
        )}
      </div>
    </div>
  );
}
