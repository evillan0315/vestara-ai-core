/**
 * FILES-PAGE-001 FP-5: Directory work-area table.
 *
 * Breadcrumbs + Name/Type/Size/Modified table for the current directory,
 * driven by the browse projection. List/grid densities render the same
 * backed data. Toolbar query/facet/sort apply here.
 *
 * Architecture Traceability:
 *   FILES-PAGE-001 FP-5.
 */

import { useMemo } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { ActionIcon, EmptyState } from '@vestara/ui';
import { formatBytes } from '../../../lib/diagnostics';
import type { FileEntry } from '../files.types';
import type { FilesDensity, FilesFacet, FilesSort } from './FilesToolbar';
import { accentFor, tileClass } from './FileTree';

interface DirectoryTableProps {
  readonly workspaceName: string;
  readonly segments: readonly string[];
  readonly entries: readonly FileEntry[];
  readonly query: string;
  readonly facet: FilesFacet;
  readonly sort: FilesSort;
  readonly density: FilesDensity;
  readonly selectedPath: string | null;
  readonly showHidden: boolean;
  readonly dirsFirst: boolean;
  onSegmentsChange: (segments: readonly string[]) => void;
  onSelect: (entry: FileEntry) => void;
  onOpenFile: (entry: FileEntry) => void;
  onMenu: (entry: FileEntry, x: number, y: number) => void;
  onMove: (sourcePath: string, destDir: FileEntry) => void;
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function typeLabel(entry: FileEntry): string {
  if (entry.kind === 'dir') return 'Directory';
  return entry.language ?? 'File';
}

export function DirectoryTable({
  workspaceName,
  segments,
  entries,
  query,
  facet,
  sort,
  density,
  selectedPath,
  showHidden,
  dirsFirst,
  onSegmentsChange,
  onSelect,
  onOpenFile,
  onMenu,
  onMove,
}: DirectoryTableProps) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = entries.filter((e) => {
      if (!showHidden && e.name.startsWith('.')) return false;
      if (facet === 'file' && e.kind !== 'file') return false;
      if (facet === 'dir' && e.kind !== 'dir') return false;
      if (facet === 'code' || facet === 'docs') {
        const { accent } = accentFor(e);
        if (facet === 'code' && accent !== 'var(--vestara-accent)') return false;
        if (facet === 'docs' && accent !== 'var(--vestara-status-warning)') return false;
      }
      if (q && !e.path.toLowerCase().includes(q) && !e.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const group = dirsFirst ? (a: FileEntry, b: FileEntry) => (a.kind !== b.kind ? (a.kind === 'dir' ? -1 : 1) : 0) : () => 0;
    rows.sort((a, b) => {
      const g = group(a, b);
      if (g !== 0) return g;
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'modified') return (b.mtime ?? '').localeCompare(a.mtime ?? '') || a.name.localeCompare(b.name);
      return (b.size ?? 0) - (a.size ?? 0) || a.name.localeCompare(b.name);
    });
    return rows;
  }, [entries, query, facet, sort, showHidden, dirsFirst]);

  const openDir = (entry: FileEntry) => onSegmentsChange([...segments, entry.name]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="Directory breadcrumb" className="mb-2 flex min-w-0 flex-wrap items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => onSegmentsChange([])}
          className="shrink-0 font-mono text-[var(--vestara-status-success)] hover:underline"
        >
          {workspaceName}
        </button>
        {segments.map((seg, i) => (
          <span key={`${seg}-${i}`} className="flex shrink-0 items-center gap-1">
            <span aria-hidden="true" className="text-[var(--files-crumb-fg)]">
              /
            </span>
            <button
              type="button"
              onClick={() => onSegmentsChange(segments.slice(0, i + 1))}
              className="font-mono text-[var(--vestara-text-secondary)] hover:underline"
            >
              {seg}
            </button>
          </span>
        ))}
        <span className="mpg-tag-pill ml-auto shrink-0">
          {visible.length} item{visible.length === 1 ? '' : 's'}
        </span>
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          title={query.trim() ? `Nothing matches “${query.trim()}”` : 'Empty directory'}
          description={query.trim() ? 'Try a different path, extension, or language.' : 'This directory has no entries.'}
        />
      ) : density === 'grid' ? (
        <ul aria-label="Directory contents grid" className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-auto sm:grid-cols-3">
          {visible.map((entry) => {
            const isDir = entry.kind === 'dir';
            const { accent, glyph } = accentFor(entry);
            return (
              <li key={entry.path}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(entry);
                    if (isDir) openDir(entry);
                    else onOpenFile(entry);
                  }}
                  onDoubleClick={() => {
                    if (isDir) openDir(entry);
                    else onOpenFile(entry);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onMenu(entry, e.clientX, e.clientY);
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', entry.path);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={
                    isDir
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                        }
                      : undefined
                  }
                  onDrop={
                    isDir
                      ? (e) => {
                          e.preventDefault();
                          const source = e.dataTransfer.getData('text/plain');
                          if (source && source !== entry.path) onMove(source, entry);
                        }
                      : undefined
                  }
                  title={entry.path}
                  aria-current={entry.path === selectedPath ? 'true' : undefined}
                  className={`flex w-full flex-col items-center gap-1.5 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] p-3 text-center hover:bg-[var(--files-row-hover-bg)] ${
                    entry.path === selectedPath ? 'border-[var(--vestara-border-focus)] bg-[var(--files-selected-bg)]' : ''
                  }`}
                >
                  <span aria-hidden="true" className={`mpg-icon-box h-9 w-9 text-base ${tileClass(accent)}`}>
                    {glyph}
                  </span>
                  <span className="w-full truncate font-mono text-xs text-[var(--vestara-text-primary)]">{entry.name}</span>
                  <span className="text-[11px] tabular-nums text-[var(--vestara-text-muted)]">
                    {isDir ? 'Directory' : formatBytes(entry.size ?? 0)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-[color-mix(in_srgb,var(--vestara-accent)_14%,transparent)]">
              <tr className="border-b border-[var(--vestara-border-subtle)] text-xs uppercase tracking-wider text-[var(--vestara-text-muted)]">
                <th scope="col" className="px-3 py-2 font-semibold">Name</th>
                <th scope="col" className="hidden px-3 py-2 font-semibold sm:table-cell">Type</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-semibold md:table-cell">Size</th>
                <th scope="col" className="hidden px-3 py-2 text-right font-semibold lg:table-cell">Modified</th>
                <th scope="col" className="w-10 px-1 py-2"><span className="sr-only">Row actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--vestara-border-subtle)]">
              {visible.map((entry) => {
                const isDir = entry.kind === 'dir';
                const { accent, glyph } = accentFor(entry);
                return (
                  <tr key={entry.path} className={entry.path === selectedPath ? 'bg-[var(--files-selected-bg)]' : undefined}>
                    <td className="px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(entry);
                          if (isDir) openDir(entry);
                          else onOpenFile(entry);
                        }}
                        onDoubleClick={() => {
                          if (isDir) openDir(entry);
                          else onOpenFile(entry);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          onMenu(entry, e.clientX, e.clientY);
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', entry.path);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={
                          isDir
                            ? (e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = 'move';
                              }
                            : undefined
                        }
                        onDrop={
                          isDir
                            ? (e) => {
                                e.preventDefault();
                                const source = e.dataTransfer.getData('text/plain');
                                if (source && source !== entry.path) onMove(source, entry);
                              }
                            : undefined
                        }
                        title={entry.path}
                        aria-current={entry.path === selectedPath ? 'true' : undefined}
                        className="flex w-full items-center gap-2.5 rounded-[var(--vestara-radius)] px-2 py-1.5 text-left hover:bg-[var(--files-row-hover-bg)]"
                      >
                        <span aria-hidden="true" className={`mpg-icon-box h-7 w-7 shrink-0 text-xs ${tileClass(accent)}`}>
                          {glyph}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono text-[var(--vestara-text-primary)]">{entry.name}</span>
                      </button>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-[var(--vestara-text-muted)] sm:table-cell">
                      {typeLabel(entry)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-[var(--vestara-text-muted)] md:table-cell">
                      {isDir ? '—' : formatBytes(entry.size ?? 0)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right text-xs text-[var(--vestara-text-muted)] lg:table-cell">
                      {formatTime(entry.mtime)}
                    </td>
                    <td className="whitespace-nowrap px-1 py-2">
                      <ActionIcon
                        label={`Actions for ${entry.name}`}
                        tone="muted"
                        icon={<MoreVertIcon sx={{ fontSize: 16 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          onMenu(entry, e.clientX, e.clientY);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
