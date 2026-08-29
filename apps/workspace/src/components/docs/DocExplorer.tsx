/**
 * Documentation explorer (left panel).
 *
 * Collapsible doc tree with search, favorites, recently-viewed, and pinned
 * views. Supports expand/collapse all, current-document highlight, and
 * horizontal resize via the drag handle.
 */

import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import FolderRoundedIcon from '@mui/icons-material/FolderRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import { useMemo, useState } from 'react';
import type { DocNode } from '../../lib/docs';
import { findInTree } from '../../lib/docs';
import { useDocs } from './DocsContext';

type View = 'browse' | 'favorites' | 'recents' | 'pinned';

interface DocExplorerProps {
  onResize: (width: number) => void;
  onOpenSearch: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export function DocExplorer({ onResize, onOpenSearch, searchQuery, onSearchChange }: DocExplorerProps) {
  const docs = useDocs();
  const [view, setView] = useState<View>('browse');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const pinnedDocs = useMemo(
    () =>
      docs.pinned
        .map((p) => findInTree(docs.roots, p))
        .filter((x): x is { file: { path: string; title: string; name: string; type: 'file' }; ancestors: string[] } =>
          Boolean(x),
        ),
    [docs.pinned, docs.roots],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragStart(e.clientX);
    setDragWidth(docs.widths.explorer);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (dragStart === null || dragWidth === null) return;
    onResize(dragWidth + (e.clientX - dragStart));
  };

  const onMouseUp = () => {
    setDragStart(null);
    setDragWidth(null);
  };

  return (
    <div className="doc-panel doc-explorer" style={{ width: docs.widths.explorer }}>
      <div className="doc-panel-header">
        <div className="flex items-center gap-1.5">
          <span className="doc-panel-title">Documentation</span>
          {docs.rootsCount > 0 && <span className="doc-panel-count">{docs.rootsCount}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="doc-icon-btn"
            title="Expand all"
            aria-label="Expand all folders"
            onClick={docs.expandAll}
          >
            <FolderOpenRoundedIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            className="doc-icon-btn"
            title="Collapse all"
            aria-label="Collapse all folders"
            onClick={docs.collapseAll}
          >
            <FolderRoundedIcon fontSize="inherit" />
          </button>
        </div>
      </div>

      <div className="doc-panel-search">
        <SearchRoundedIcon fontSize="inherit" className="text-zinc-500" />
        <input
          type="search"
          className="doc-search-input"
          placeholder="Search documentation…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onFocus={() => {
            if (searchQuery) onOpenSearch();
          }}
          aria-label="Search documentation"
        />
      </div>

      <div className="doc-explorer-tabs" role="tablist" aria-label="Documentation views">
        {(
          [
            ['browse', 'Browse'],
            ['favorites', 'Favorites'],
            ['pinned', 'Pinned'],
            ['recents', 'Recents'],
          ] as Array<[View, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={`doc-explorer-tab ${view === id ? 'doc-explorer-tab-active' : ''}`}
            onClick={() => setView(id)}
          >
            {id === 'favorites' && <StarRoundedIcon fontSize="inherit" />}
            {id === 'pinned' && <PushPinRoundedIcon fontSize="inherit" />}
            {id === 'recents' && <HistoryRoundedIcon fontSize="inherit" />}
            {label}
          </button>
        ))}
      </div>

      <div className="doc-explorer-scroll">
        {view === 'browse' && <DocTree />}
        {view === 'favorites' && (
          <DocListView
            entries={docs.favorites
              .map((p) => findInTree(docs.roots, p))
              .filter((x): x is NonNullable<typeof x> => Boolean(x))}
            empty="No favorites yet. Star a document to save it here."
          />
        )}
        {view === 'pinned' && (
          <DocListView entries={pinnedDocs} empty="No pinned documents. Pin one from the document toolbar." />
        )}
        {view === 'recents' && (
          <div>
            {docs.recent.length === 0 && <p className="doc-empty-hint">No recently viewed documents.</p>}
            <ul className="doc-tree-list">
              {docs.recent.map((r) => (
                <li key={r.path}>
                  <button
                    type="button"
                    className={`doc-tree-file ${docs.selectedPath === r.path ? 'doc-tree-active' : ''}`}
                    onClick={() => docs.selectDoc(r.path)}
                  >
                    <InsertDriveFileRoundedIcon fontSize="inherit" className="text-zinc-500" />
                    <span className="truncate">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
            {docs.recent.length > 0 && (
              <button type="button" className="doc-clear-recent" onClick={docs.clearRecent}>
                Clear recents
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className="doc-resize-handle doc-resize-explorer"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        aria-hidden="true"
      />
    </div>
  );
}

function DocTree() {
  const docs = useDocs();

  if (docs.loading) {
    return <p className="doc-empty-hint animate-pulse">Loading documentation…</p>;
  }
  if (docs.error) {
    return <p className="doc-empty-hint text-red-400">{docs.error}</p>;
  }
  if (docs.roots.length === 0) {
    return (
      <p className="doc-empty-hint">
        No documentation found. Add a <code>docs/</code> folder or markdown files to your repository.
      </p>
    );
  }

  return (
    <ul className="doc-tree-list">
      {docs.roots.map((node) => (
        <DocTreeNode key={node.path} node={node} depth={0} />
      ))}
    </ul>
  );
}

function DocTreeNode({ node, depth }: { node: DocNode; depth: number }) {
  const docs = useDocs();
  const isDir = node.type === 'dir';

  if (isDir) {
    const isOpen = !!docs.expanded[node.path];
    return (
      <li>
        <button
          type="button"
          className="doc-tree-dir"
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          aria-expanded={isOpen}
          onClick={() => docs.toggleDir(node.path)}
        >
          {isOpen ? (
            <KeyboardArrowDownRoundedIcon fontSize="inherit" className="text-zinc-500" />
          ) : (
            <KeyboardArrowRightRoundedIcon fontSize="inherit" className="text-zinc-500" />
          )}
          {isOpen ? (
            <FolderOpenRoundedIcon fontSize="inherit" className="text-(--vestara-accent)" />
          ) : (
            <FolderRoundedIcon fontSize="inherit" className="text-(--vestara-accent)" />
          )}
          <span className="truncate">{node.name}</span>
          <span className="doc-tree-count">{node.count}</span>
        </button>
        {isOpen && (
          <ul className="doc-tree-list">
            {node.children.map((child) => (
              <DocTreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const active = docs.selectedPath === node.path;
  const isFav = docs.isFavorite(node.path);
  return (
    <li>
      <button
        type="button"
        className={`doc-tree-file ${active ? 'doc-tree-active' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        aria-current={active ? 'true' : undefined}
        onClick={() => docs.selectDoc(node.path)}
      >
        {isFav ? (
          <StarRoundedIcon fontSize="inherit" className="text-(--vestara-accent)" />
        ) : (
          <InsertDriveFileRoundedIcon fontSize="inherit" className="text-zinc-500" />
        )}
        <span className="truncate">{node.title || node.name}</span>
      </button>
    </li>
  );
}

function DocListView({
  entries,
  empty,
}: {
  entries: Array<{ file: { path: string; title: string; name: string }; ancestors: string[] }>;
  empty: string;
}) {
  const docs = useDocs();
  if (entries.length === 0) return <p className="doc-empty-hint">{empty}</p>;
  return (
    <ul className="doc-tree-list">
      {entries.map(({ file }) => (
        <li key={file.path}>
          <button
            type="button"
            className={`doc-tree-file ${docs.selectedPath === file.path ? 'doc-tree-active' : ''}`}
            onClick={() => docs.selectDoc(file.path)}
          >
            <InsertDriveFileRoundedIcon fontSize="inherit" className="text-zinc-500" />
            <span className="truncate">{file.title || file.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
