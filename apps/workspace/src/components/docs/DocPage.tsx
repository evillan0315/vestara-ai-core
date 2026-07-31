/**
 * Documentation module — three-panel workspace page.
 *
 * Layout: explorer (left) · document viewer (center) · context panel (right),
 * with an overlay search dialog. Owns the scroll container so the viewer and
 * the context panel share scroll-spy / reading-progress state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DocExplorer } from './DocExplorer';
import { DocSearch } from './DocSearch';
import { DocsProvider, useDocs } from './DocsContext';
import { DocToc } from './DocToc';
import { DocViewer } from './DocViewer';
import { extractHeadings } from './frontmatter';
import '../../styles/docs.css';

let lastProgressSave = 0;

function DocPageInner() {
  const docs = useDocs();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? (el.scrollTop / max) * 100 : 0;
    setProgress(p);
    const now = Date.now();
    if (now - lastProgressSave > 1500 && docs.selectedPath) {
      lastProgressSave = now;
      docs.recordProgress(docs.selectedPath, p);
    }
    const heads = el.querySelectorAll<HTMLElement>('.doc-heading');
    let current: string | null = null;
    for (const h of heads) {
      if (h.offsetTop <= el.scrollTop + 12) current = h.id;
      else break;
    }
    setActiveSlug(current);
  }, [docs]);

  const jumpTo = useCallback((slug: string) => {
    const el = scrollRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>(`#${CSS.escape(slug)}`);
    if (!target) return;
    el.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
  }, []);

  // '/' opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !isTyping) {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape' && searchOpen) setSearchOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  // Tag clicks funnel into search via a custom event.
  useEffect(() => {
    const onTag = (e: Event) => {
      const tag = (e as CustomEvent<string>).detail;
      setSearchQuery(tag);
      setSearchOpen(true);
    };
    window.addEventListener('vestara-docs-search', onTag);
    return () => window.removeEventListener('vestara-docs-search', onTag);
  }, []);

  const headings = useMemo(() => extractHeadings(docs.content?.content ?? ''), [docs.content?.content]);

  const handleSearchSelect = useCallback(
    (path: string) => {
      docs.selectDoc(path);
      setSearchOpen(false);
      setSearchQuery('');
    },
    [docs],
  );

  const togglePanel = (panel: 'toc' | 'explorer') => {
    if (panel === 'toc') docs.updateSettings('tocOpen', !docs.settings.tocOpen);
    else docs.updateSettings('explorerOpen', !docs.settings.explorerOpen);
  };

  return (
    <div className="doc-page h-[calc(100vh-7rem)]">
      {docs.settings.explorerOpen && (
        <DocExplorer
          onResize={(w) => docs.setWidth('explorer', w)}
          onOpenSearch={() => setSearchOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={(q) => {
            setSearchQuery(q);
            if (q.trim()) setSearchOpen(true);
          }}
        />
      )}

      <div className="doc-viewer-col">
        <DocViewer
          scrollRef={scrollRef}
          progress={progress}
          onScroll={handleScroll}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleToc={() => togglePanel('toc')}
          onToggleExplorer={() => togglePanel('explorer')}
        />
      </div>

      {docs.settings.tocOpen && docs.selectedPath && docs.content && (
        <DocToc
          content={docs.content}
          headings={headings}
          activeSlug={activeSlug}
          progress={progress}
          onJump={jumpTo}
          onNavigate={docs.selectDoc}
        />
      )}

      <DocSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onSelect={handleSearchSelect}
      />
    </div>
  );
}

export default function DocPage() {
  return (
    <DocsProvider>
      <DocPageInner />
    </DocsProvider>
  );
}
