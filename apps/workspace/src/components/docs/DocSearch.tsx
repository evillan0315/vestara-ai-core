/**
 * Documentation search.
 *
 * Search over the client-side index (title, tags, aliases, headings,
 * content) with weighted ranking, highlighted snippets, keyboard
 * navigation, and recent-search recall.
 */

import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DocIndexEntry } from '../../lib/docs';
import { useDocs } from './DocsContext';
import { highlightText, snippetAround } from './frontmatter';

interface DocSearchProps {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (path: string) => void;
}

function rank(entry: DocIndexEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return -1;
  const words = q.split(/\s+/).filter(Boolean);
  const title = entry.title.toLowerCase();
  const tags = entry.tags.join(' ').toLowerCase();
  const aliases = entry.aliases.join(' ').toLowerCase();
  const headings = entry.headings.join(' ').toLowerCase();
  const text = entry.text.toLowerCase();

  let score = 0;
  if (title === q) score += 200;
  else if (title.startsWith(q)) score += 150;
  else if (title.includes(q)) score += 100;

  for (const w of words) {
    if (aliases.includes(w)) score += 40;
    if (tags.includes(w)) score += 35;
    if (title.includes(w)) score += 20;
    if (headings.includes(w)) score += 12;
    if (text.includes(w)) score += 5;
  }
  return score;
}

export function DocSearch({ open, onClose, query, onQueryChange, onSelect }: DocSearchProps) {
  const docs = useDocs();
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!docs.indexLoading && docs.index.length === 0) void docs.loadIndex();
  }, [docs, docs.indexLoading, docs.index.length]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return docs.index
      .map((entry) => ({ entry, score: rank(entry, q) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25);
  }, [docs.index, query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && results[cursor]) {
      e.preventDefault();
      onSelect(results[cursor].entry.path);
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const runSearch = (q: string) => {
    docs.addSearch(q);
  };

  if (!open) return null;

  return (
    <div className="doc-search" role="dialog" aria-label="Search documentation">
      <div className="doc-search-input-row">
        <SearchRoundedIcon fontSize="inherit" className="text-zinc-500" />
        <input
          ref={inputRef}
          className="doc-search-input-lg"
          placeholder="Search titles, headings, tags, content…"
          value={query}
          onChange={(e) => {
            setCursor(0);
            onQueryChange(e.target.value);
          }}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={true}
          aria-controls="doc-search-results"
          aria-label="Search documentation"
        />
        <kbd className="doc-kbd">esc</kbd>
      </div>

      <div className="doc-search-results" id="doc-search-results" ref={listRef}>
        {docs.indexLoading && docs.index.length === 0 && (
          <p className="doc-empty-hint animate-pulse">Indexing documentation…</p>
        )}

        {!docs.indexLoading && docs.index.length === 0 && query && (
          <p className="doc-empty-hint">No documents to search. Add markdown to your repository.</p>
        )}

        {results.length === 0 && query && docs.index.length > 0 && (
          <p className="doc-empty-hint">No results for “{query}”.</p>
        )}

        {results.map(({ entry, score }, i) => {
          const snippet = snippetAround(entry.text, query);
          return (
            <button
              key={entry.path}
              type="button"
              data-idx={i}
              aria-current={cursor === i}
              className={`doc-search-result ${cursor === i ? 'doc-search-result-active' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => onSelect(entry.path)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="doc-search-result-title">{entry.title}</span>
                <span className="doc-search-score" title={`Score ${score}`}>
                  {score >= 100 ? 'top' : score >= 30 ? 'good' : 'match'}
                </span>
              </div>
              <div className="doc-search-result-path">{entry.path}</div>
              {snippet && (
                <p className="doc-search-result-snippet">
                  {highlightText(snippet, query)}
                  {entry.tags.length > 0 && (
                    <span className="doc-search-result-tags">
                      {' '}
                      {entry.tags.slice(0, 4).map((t) => (
                        <span key={t} className="doc-tag">
                          {t}
                        </span>
                      ))}
                    </span>
                  )}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {docs.searches.length > 0 && (
        <div className="doc-search-recent">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500">Recent searches</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {docs.searches.slice(0, 6).map((s) => (
              <button
                key={s}
                type="button"
                className="doc-tag"
                onClick={() => {
                  onQueryChange(s);
                  runSearch(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
