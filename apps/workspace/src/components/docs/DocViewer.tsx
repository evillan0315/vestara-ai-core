/**
 * Document viewer (center panel).
 *
 * Toolbar (back/forward, prev/next, breadcrumbs, actions), reading progress,
 * scroll-spy on headings, selection capture for Ask AI, and the rich
 * markdown body with metadata header and raw-markdown overlay.
 */

import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import VerticalSplitRoundedIcon from '@mui/icons-material/VerticalSplitRounded';
import type { RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findInTree } from '../../lib/docs';
import { AskAi } from './AskAi';
import { DocActions } from './DocActions';
import { DocMarkdown } from './DocMarkdown';
import { DocMetadata } from './DocMetadata';
import { useDocs } from './DocsContext';
import { parseFrontmatter } from './frontmatter';

interface DocViewerProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  progress: number;
  onScroll: () => void;
  onOpenSearch: () => void;
  onToggleToc: () => void;
  onToggleExplorer: () => void;
}

export function DocViewer({
  scrollRef,
  progress,
  onScroll,
  onOpenSearch,
  onToggleToc,
  onToggleExplorer,
}: DocViewerProps) {
  const docs = useDocs();
  const navigate = useNavigate();
  const restoredRef = useRef<string | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  const { selectedPath, content, getProgress } = docs;

  const flat = docs.flat;
  const idx = useMemo(
    () => (selectedPath ? flat.findIndex((f) => f.node.path === selectedPath) : -1),
    [flat, selectedPath],
  );
  const prevDoc = idx > 0 ? flat[idx - 1] : null;
  const nextDoc = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  const location = useMemo(
    () => (selectedPath ? findInTree(docs.roots, selectedPath) : null),
    [docs.roots, selectedPath],
  );
  const breadcrumb = location?.ancestors ?? [];
  const title = useMemo(() => {
    if (content) {
      const fm = parseFrontmatter(content.content);
      return fm.meta.title || content.name.replace(/\.(md|mdx|markdown)$/i, '');
    }
    return location?.file.title ?? '';
  }, [content, location]);

  // Restore scroll position once a document's content has rendered.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !selectedPath || !content) return;
    if (restoredRef.current === selectedPath) return;
    restoredRef.current = selectedPath;
    const p = getProgress(selectedPath);
    el.scrollTop = (p / 100) * (el.scrollHeight - el.clientHeight);
    onScroll();
  }, [selectedPath, content, getProgress, onScroll, scrollRef]);

  // Capture text selection anywhere in the viewer for "Ask AI about selection".
  const captureSelection = useCallback(() => {
    const sel = window.getSelection()?.toString().trim();
    setSelection(sel && sel.length > 0 ? sel.slice(0, 6000) : null);
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', captureSelection);
    return () => window.removeEventListener('mouseup', captureSelection);
  }, [captureSelection]);

  const go = useCallback(
    (path: string) => {
      setSelection(null);
      docs.selectDoc(path);
    },
    [docs],
  );

  const isFav = selectedPath ? docs.isFavorite(selectedPath) : false;
  const isPin = selectedPath ? docs.isPinned(selectedPath) : false;

  // ── No document selected ──────────────────────────────────
  if (!selectedPath) {
    return (
      <div className="doc-viewer doc-viewer-empty">
        <div className="doc-welcome">
          <div className="doc-welcome-icon">◈</div>
          <h1 className="doc-title">Documentation</h1>
          <p className="doc-description">
            {docs.meta?.repoName ?? 'Workspace'} · {docs.flat.length} documents
            {docs.rootsCount > 0 ? ` across ${docs.rootsCount} sections` : ''}
          </p>
          <button type="button" className="doc-welcome-cta" onClick={onOpenSearch}>
            Search documentation
          </button>
          {docs.flat.length > 0 && (
            <div className="doc-welcome-list">
              <div className="doc-toc-section-title">Jump to</div>
              {docs.flat.slice(0, 12).map((f) => (
                <button key={f.node.path} type="button" className="doc-welcome-link" onClick={() => go(f.node.path)}>
                  <span className="text-zinc-500">▸</span> {f.node.title || f.node.name}
                </button>
              ))}
            </div>
          )}
          {docs.error && <p className="doc-empty-hint text-red-400">{docs.error}</p>}
        </div>
      </div>
    );
  }

  // ── Missing / error state ─────────────────────────────────
  if (docs.contentError || (!docs.contentLoading && !content)) {
    return (
      <div className="doc-viewer doc-viewer-empty">
        <div className="doc-welcome">
          <h1 className="doc-title">Document not found</h1>
          <p className="doc-description">{docs.contentError ?? 'The document could not be loaded.'}</p>
          <p className="doc-path">{selectedPath}</p>
          <div className="flex gap-2 mt-4">
            <button type="button" className="doc-welcome-cta" onClick={() => docs.selectDoc(null)}>
              <HomeRoundedIcon fontSize="inherit" /> Back to documentation home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="doc-viewer">
      {/* Progress bar */}
      <div className="doc-progress-top" aria-hidden="true">
        <div className="doc-progress-top-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>

      {/* Toolbar */}
      <div className="doc-viewer-toolbar">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="doc-icon-btn"
            onClick={onToggleExplorer}
            aria-label="Toggle explorer"
            title="Toggle explorer"
          >
            <MenuRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="doc-icon-btn"
            onClick={onToggleToc}
            aria-label="Toggle table of contents"
            title="Toggle table of contents"
          >
            <VerticalSplitRoundedIcon fontSize="inherit" />
          </button>
          <span className="doc-toolbar-sep" />
          <button type="button" className="doc-icon-btn" onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <ArrowBackRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="doc-icon-btn"
            onClick={() => navigate(1)}
            aria-label="Forward"
            title="Forward"
          >
            <ArrowForwardRoundedIcon fontSize="inherit" />
          </button>
          <span className="doc-toolbar-sep" />
          <button
            type="button"
            className="doc-icon-btn"
            disabled={!prevDoc}
            onClick={() => prevDoc && go(prevDoc.node.path)}
            aria-label="Previous document"
            title={`Previous: ${prevDoc?.node.title ?? ''}`}
          >
            <ChevronLeftRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="doc-icon-btn"
            disabled={!nextDoc}
            onClick={() => nextDoc && go(nextDoc.node.path)}
            aria-label="Next document"
            title={`Next: ${nextDoc?.node.title ?? ''}`}
          >
            <ChevronRightRoundedIcon fontSize="inherit" />
          </button>
        </div>

        <div className="doc-breadcrumbs" title={selectedPath}>
          <button type="button" className="doc-breadcrumb" onClick={() => docs.selectDoc(null)}>
            Docs
          </button>
          {breadcrumb.map((part) => (
            <span key={part} className="doc-breadcrumb-seg">
              <span className="doc-breadcrumb-sep">/</span>
              <span className="doc-breadcrumb">{part}</span>
            </span>
          ))}
          <span className="doc-breadcrumb-sep">/</span>
          <span className="doc-breadcrumb-current">{title}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`doc-icon-btn ${docs.settings.focusMode ? 'doc-action-btn-active' : ''}`}
            onClick={() => docs.updateSettings('focusMode', !docs.settings.focusMode)}
            aria-label="Toggle focus mode"
            title="Focus mode"
          >
            <MenuOpenRoundedIcon fontSize="inherit" />
          </button>
          <DocActions
            docPath={selectedPath}
            hasContent={!!content}
            rawContent={content?.content ?? ''}
            isFavorite={isFav}
            isPinned={isPin}
            remoteUrl={docs.meta?.remoteUrl ?? null}
            onToggleFavorite={() => docs.toggleFavorite(selectedPath)}
            onTogglePin={() => docs.togglePin(selectedPath)}
            onViewRaw={() => setShowRaw(true)}
            onAskAi={() => setAskOpen((v) => !v)}
          />
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} className="doc-viewer-scroll" onScroll={onScroll}>
        <article className={docs.settings.focusMode ? 'doc-article doc-article-focus' : 'doc-article'}>
          {content && (
            <>
              <DocMetadata
                fileName={content.name}
                path={content.path}
                fm={parseFrontmatter(content.content)}
                onTagClick={(tag) => {
                  onOpenSearch();
                  window.dispatchEvent(new CustomEvent('vestara-docs-search', { detail: tag }));
                }}
              />
              <DocMarkdown
                content={content.content}
                currentPath={content.path}
                onNavigate={go}
                showLineNumbers={docs.settings.lineNumbers}
              />
            </>
          )}

          {!content && docs.contentLoading && <p className="doc-empty-hint animate-pulse">Loading document…</p>}

          {/* Prev / next footer */}
          <nav className="doc-prevnext" aria-label="Document navigation">
            {prevDoc ? (
              <button type="button" className="doc-prevnext-card" onClick={() => go(prevDoc.node.path)}>
                <span className="doc-prevnext-label">← Previous</span>
                <span className="doc-prevnext-title">{prevDoc.node.title}</span>
              </button>
            ) : (
              <span />
            )}
            {nextDoc ? (
              <button
                type="button"
                className="doc-prevnext-card doc-prevnext-next"
                onClick={() => go(nextDoc.node.path)}
              >
                <span className="doc-prevnext-label">Next →</span>
                <span className="doc-prevnext-title">{nextDoc.node.title}</span>
              </button>
            ) : (
              <span />
            )}
          </nav>
        </article>
      </div>

      {/* Selection → Ask AI */}
      {selection && (
        <div className="doc-selection-pop">
          <span className="text-[10px] text-zinc-500 truncate max-w-[260px]">“{selection.slice(0, 80)}…”</span>
          <button type="button" className="doc-welcome-cta" onClick={() => setAskOpen(true)}>
            Ask AI about selection
          </button>
        </div>
      )}

      {/* Raw markdown overlay */}
      {showRaw && content && (
        <div className="doc-raw-overlay" role="dialog" aria-modal="true" aria-label="Raw markdown">
          <div className="doc-raw-panel">
            <div className="doc-raw-header">
              <span className="doc-codeblock-filename">{content.path}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="doc-codeblock-copy"
                  onClick={() => navigator.clipboard.writeText(content.content)}
                >
                  Copy markdown
                </button>
                <button
                  type="button"
                  className="doc-icon-btn"
                  onClick={() => setShowRaw(false)}
                  aria-label="Close raw view"
                >
                  <ChevronRightRoundedIcon fontSize="inherit" />
                </button>
              </div>
            </div>
            <pre className="doc-raw-body">{content.content}</pre>
          </div>
        </div>
      )}

      <AskAi
        open={askOpen}
        onClose={() => {
          setAskOpen(false);
          setSelection(null);
        }}
        doc={content}
        selection={selection}
        onNavigate={go}
      />
    </div>
  );
}
