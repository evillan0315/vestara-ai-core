/**
 * @vestara/ui-components — File workspace primitives.
 *
 * Extracted from the VESTARA / EXTRACTOR reference artifact. Every visual
 * value resolves through a `var(--vestara-*)` token (VES-DESIGN-006) —
 * no raw hex, no arbitrary utilities.
 */

import { type ComponentType, createElement, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Link2,
  PenLine,
  Pin,
  Search,
  Trash2,
  X,
} from './icons.js';
import { cn } from './utils.js';

// ─── Types ─────────────────────────────────────────────────────

export type FileCategory = 'code' | 'docs' | 'config' | 'data' | 'ui' | 'folder' | 'other';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  category?: FileCategory;
  size?: string;
  modified?: string;
  fileCount?: number;
  children?: FileNode[];
}

export interface FileIndexEntry {
  path: string;
  name: string;
  category?: FileCategory;
}

export interface TabEntry {
  name: string;
  path: string;
  category?: FileCategory;
}

// ─── FileIcon ──────────────────────────────────────────────────

export interface FileIconProps {
  category?: FileCategory;
  /** Open state (folder variant only). */
  open?: boolean;
  className?: string;
}

export function FileIcon({ category = 'other', open, className }: FileIconProps) {
  const size = className ?? 'h-[14px] w-[14px]';
  if (category === 'folder') {
    return open ? (
      <FolderOpen className={cn(size, 'text-[var(--vestara-accent-os-teal)]')} />
    ) : (
      <Folder className={cn(size, 'text-[var(--vestara-accent-os-teal)]/70')} />
    );
  }
  if (category === 'code') return <FileCode2 className={cn(size, 'text-[var(--vestara-status-os-info)]')} />;
  if (category === 'docs') return <FileText className={cn(size, 'text-[var(--vestara-accent-os-amber)]')} />;
  if (category === 'config') return <FileJson className={cn(size, 'text-[var(--vestara-text-os-secondary)]')} />;
  if (category === 'data') return <Database className={cn(size, 'text-[var(--vestara-text-os-secondary)]')} />;
  return <FileText className={cn(size, 'text-[var(--vestara-text-os-muted)]')} />;
}

// ─── TreeNode ──────────────────────────────────────────────────

export interface TreeNodeProps {
  node: FileNode;
  depth?: number;
  activePath?: string;
  expandedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}

export function TreeNode({ node, depth = 0, activePath, expandedPaths, onToggle, onSelect }: TreeNodeProps) {
  const isFolder = node.type === 'folder';
  const isOpen = expandedPaths.has(node.path);
  const isActive = activePath === node.path;
  return (
    <div>
      <button
        type="button"
        role="treeitem"
        aria-expanded={isFolder ? isOpen : undefined}
        onClick={() => (isFolder ? onToggle(node.path) : onSelect(node.path))}
        className={cn(
          'w-full',
          'group flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2 py-[4px] transition-all',
          isActive
            ? 'bg-[var(--vestara-accent-os-teal)]/12 text-[var(--vestara-accent-os-teal)]'
            : 'text-[var(--vestara-text-os-secondary)] hover:bg-[var(--vestara-surface-os-hover)] hover:text-[var(--vestara-text-os-primary)]',
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {isFolder ? (
          <span className="flex h-3 w-3 shrink-0 items-center justify-center">
            {isOpen ? <ChevronDown className="h-3 w-3 opacity-60" /> : <ChevronRight className="h-3 w-3 opacity-60" />}
          </span>
        ) : (
          <span className="w-3" />
        )}
        <FileIcon category={isFolder ? 'folder' : node.category} open={isFolder ? isOpen : undefined} />
        <span className="truncate text-[12.5px] tracking-[-0.01em]">{node.name}</span>
        {isFolder && node.fileCount !== undefined && (
          <span className="ml-auto rounded bg-[var(--vestara-surface-os-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vestara-text-os-muted)] group-hover:text-[var(--vestara-text-os-secondary)]">
            {node.fileCount}
          </span>
        )}
      </button>
      {isFolder && isOpen && node.children && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── FilterChips ───────────────────────────────────────────────

export interface FilterChipsProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

export function FilterChips({ value, options, onChange }: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-all',
            value === option
              ? 'border-[var(--vestara-accent-os-teal)] bg-[var(--vestara-accent-os-teal)] text-[var(--vestara-color-os-on-accent)]'
              : 'border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-secondary)] hover:border-[var(--vestara-border-os-strong)] hover:text-[var(--vestara-text-os-primary)]',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

// ─── SearchInput ───────────────────────────────────────────────

export interface SearchInputProps {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  ariaLabel?: string;
}

export function SearchInput({
  value,
  placeholder = 'Search…',
  onChange,
  onFocus,
  ariaLabel = 'Search',
}: SearchInputProps) {
  return (
    <div className="group relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[var(--vestara-text-os-faint)] transition-colors group-focus-within:text-[var(--vestara-accent-os-teal)]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 w-full rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] pl-8 pr-8 font-mono text-[13px] text-[var(--vestara-text-os-primary)] transition-all placeholder:text-[var(--vestara-text-os-muted)] focus:border-[var(--vestara-accent-os-teal)]/40 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] hover:text-[var(--vestara-text-os-primary)]"
        >
          <X className="h-[10px] w-[10px]" />
        </button>
      )}
    </div>
  );
}

// ─── CommandPalette ────────────────────────────────────────────

export interface CommandPaletteProps {
  open: boolean;
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
  results: readonly FileIndexEntry[];
  onSelect: (path: string) => void;
  label?: string;
}

export function CommandPalette({
  open,
  query,
  onQuery,
  onClose,
  results,
  onSelect,
  label = 'VESTARA CMD',
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-start bg-[var(--vestara-surface-os-canvas)]/70 p-4 pt-[18vh] backdrop-blur-[8px]">
      <button type="button" aria-label="Close command palette" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative mx-auto w-full max-w-[640px] overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] shadow-[var(--vestara-elevation-xl)]"
      >
        <div className="flex h-[52px] items-center gap-3 border-b border-[var(--vestara-border-os-subtle)] px-4">
          <Search className="h-4 w-4 text-[var(--vestara-text-os-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Type a command or search…"
            aria-label="Command search"
            className="flex-1 bg-transparent text-[14px] text-[var(--vestara-text-os-primary)] outline-none placeholder:text-[var(--vestara-text-os-muted)]"
          />
          <span className="rounded border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)] px-1.5 py-1 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
            ESC
          </span>
        </div>
        <div className="max-h-[360px] overflow-auto p-2">
          {results.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() => {
                onSelect(entry.path);
                onClose();
              }}
              className="group flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--vestara-surface-os-hover)]"
            >
              <span className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] group-hover:text-[var(--vestara-accent-os-teal)]">
                <FileIcon category={entry.category} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-[var(--vestara-text-os-primary)]">{entry.name}</span>
                <span className="block truncate font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
                  {entry.path}
                </span>
              </span>
              <span className="font-mono text-[10px] text-[var(--vestara-text-os-faint)]">↵</span>
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-3 py-4 text-center text-[12px] text-[var(--vestara-text-os-muted)]">No matches.</p>
          )}
        </div>
        <div className="flex h-10 items-center justify-between border-t border-[var(--vestara-border-os-subtle)] px-4 font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vestara-accent-os-teal)]" />
            {label}
          </span>
          <span>↑↓ navigate • ⏎ select • ESC close</span>
        </div>
      </div>
    </div>
  );
}

// ─── TabBar ────────────────────────────────────────────────────

export interface TabBarProps {
  tabs: readonly TabEntry[];
  active: string;
  onActive: (path: string) => void;
  onClose: (path: string) => void;
}

export function TabBar({ tabs, active, onActive, onClose }: TabBarProps) {
  return (
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-2">
      {tabs.map((tab) => {
        const isActive = active === tab.path;
        return (
          <div
            key={tab.path}
            className={cn(
              'group flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-[8px] border px-2.5 pr-1 text-[12px] transition-all',
              isActive
                ? 'border-[var(--vestara-accent-os-teal)]/30 bg-[var(--vestara-surface-os-elevated)] text-[var(--vestara-text-os-primary)]'
                : 'border-transparent text-[var(--vestara-text-os-secondary)] hover:bg-[var(--vestara-surface-os-raised)] hover:text-[var(--vestara-text-os-primary)]',
            )}
          >
            <button type="button" onClick={() => onActive(tab.path)} className="flex items-center gap-2 truncate">
              <FileCode2 className={cn('h-3 w-3', isActive && 'text-[var(--vestara-accent-os-teal)]')} />
              <span className="truncate">{tab.name}</span>
              {isActive && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[var(--vestara-accent-os-teal)]" />}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onClose(tab.path);
              }}
              className="grid h-4 w-4 place-items-center rounded-[5px] text-[var(--vestara-text-os-muted)] hover:bg-[var(--vestara-border-os-subtle)] hover:text-[var(--vestara-text-os-primary)]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Breadcrumb ────────────────────────────────────────────────

export interface BreadcrumbProps {
  path: string;
  onFocusFolder?: (path: string) => void;
}

export function Breadcrumb({ path, onFocusFolder }: BreadcrumbProps) {
  const parts = useMemo(() => path.split('/').filter(Boolean), [path]);
  const segments = useMemo(
    () => parts.map((segment, index) => ({ key: `${index}-${segment}`, segment, last: index === parts.length - 1 })),
    [parts],
  );
  return (
    <div className="flex h-8 items-center gap-1 border-b border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-inset)] px-3 text-[12px] text-[var(--vestara-text-os-muted)]">
      <Folder className="h-3 w-3" />
      {segments.map(({ key, segment, last }) => (
        <span key={key} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-40" />
          <span
            className={cn(
              'font-mono',
              last
                ? 'font-medium text-[var(--vestara-text-os-primary)]'
                : 'cursor-pointer hover:text-[var(--vestara-text-os-secondary)]',
            )}
          >
            {segment}
          </span>
        </span>
      ))}
      {onFocusFolder && parts.length > 1 && (
        <button
          type="button"
          onClick={() => onFocusFolder(parts.slice(0, -1).join('/'))}
          className="ml-auto flex items-center gap-1 font-mono text-[11px] text-[var(--vestara-text-os-faint)] hover:text-[var(--vestara-accent-os-teal)]"
        >
          <ExternalLink className="h-3 w-3" /> Open folder
        </button>
      )}
    </div>
  );
}

// ─── CodeViewer ────────────────────────────────────────────────

export interface CodeViewerProps {
  code: string;
  className?: string;
  showMinimap?: boolean;
}

export function CodeViewer({ code, className, showMinimap = true }: CodeViewerProps) {
  const gutter = useMemo(
    () =>
      code.split('\n').map((text, index) => ({
        key: `ln-${index}`,
        number: index + 1,
        muted: index % 5 === 0,
        text,
      })),
    [code],
  );
  const bars = useMemo(
    () =>
      gutter.slice(0, 80).map((_, index) => ({
        key: `bar-${index}`,
        width: 28 + (Math.round(Math.sin(index * 1.7) * 20 + 20) + (((index % 3) * 12) % 60)),
        tone:
          index % 7 === 0
            ? 'var(--vestara-accent-os-teal)'
            : index % 5 === 0
              ? 'var(--vestara-border-os-strong)'
              : 'var(--vestara-border-os-subtle)',
        opacity: 0.25 + (index % 4) * 0.18,
      })),
    [gutter],
  );
  return (
    <div
      className={cn(
        'flex min-h-[320px] flex-1 overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-canvas)]',
        className,
      )}
    >
      <div className="hidden w-[52px] shrink-0 select-none border-r border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] py-3 pr-3 text-right font-mono text-[11px] leading-[20px] sm:block">
        {gutter.map((line) => (
          <div
            key={line.key}
            className={line.muted ? 'text-[var(--vestara-text-os-muted)]' : 'text-[var(--vestara-text-os-faint)]'}
          >
            {line.number}
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4">
        <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[20px] text-[var(--vestara-text-os-secondary)]">
          <code>{code}</code>
        </pre>
      </div>
      {showMinimap && (
        <div className="hidden w-[68px] shrink-0 overflow-hidden border-l border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-2 lg:block">
          <div className="space-y-[2px]">
            {bars.map((bar) => (
              <div
                key={bar.key}
                className="h-[3px] rounded-full"
                style={{ width: `${bar.width}%`, background: bar.tone, opacity: bar.opacity }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DetailCard ────────────────────────────────────────────────

export interface DetailCardProps {
  node: FileNode;
  onCopyPath?: () => void;
  onPin?: () => void;
}

export function DetailCard({ node, onCopyPath, onPin }: DetailCardProps) {
  return (
    <div className="rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)] text-[var(--vestara-accent-os-teal)]">
          <FileCode2 className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[var(--vestara-text-os-primary)]">
              {node.name}
            </div>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--vestara-accent-os-teal)]" />
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
            {node.category ?? 'file'} · {node.size ?? '—'}
          </div>
          <div className="group mt-2.5 flex items-center gap-2 rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-2 py-1.5 font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">
            <span className="truncate">{node.path}</span>
            {onCopyPath && (
              <button
                type="button"
                aria-label="Copy path"
                onClick={onCopyPath}
                className="ml-auto grid h-5 w-5 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] transition-colors hover:text-[var(--vestara-accent-os-teal)]"
              >
                <Copy className="h-[10px] w-[10px]" />
              </button>
            )}
          </div>
        </div>
        {onPin && (
          <button
            type="button"
            aria-label="Pin"
            onClick={onPin}
            className="grid h-6 w-6 place-items-center rounded-[6px] text-[var(--vestara-text-os-muted)] hover:bg-[var(--vestara-surface-os-hover)]"
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ActionGrid ────────────────────────────────────────────────

export interface ActionGridProps {
  onAction: (label: string) => void;
  labels?: readonly string[];
}

const DEFAULT_ACTIONS: readonly {
  label: string;
  icon: ComponentType<{ className?: string }>;
  danger?: boolean;
}[] = [
  { label: 'Open', icon: (p) => <ExternalLink {...p} /> },
  { label: 'Download', icon: (p) => <Download {...p} /> },
  { label: 'Copy Path', icon: (p) => <Link2 {...p} /> },
  { label: 'Rename', icon: (p) => <PenLine {...p} /> },
  { label: 'Duplicate', icon: (p) => <FileCode2 {...p} /> },
  { label: 'Delete', icon: (p) => <Trash2 {...p} />, danger: true },
];

export function ActionGrid({ onAction }: ActionGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DEFAULT_ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => onAction(action.label)}
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-[8px] border text-[12px] font-medium transition-all',
            action.danger
              ? 'border-[var(--vestara-status-os-danger)]/20 bg-[var(--vestara-status-os-danger)]/10 text-[var(--vestara-status-os-danger)] hover:bg-[var(--vestara-status-os-danger)]/15'
              : 'border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-secondary)] hover:border-[var(--vestara-border-os-strong)] hover:bg-[var(--vestara-surface-os-elevated)] hover:text-[var(--vestara-text-os-primary)]',
          )}
        >
          {createElement(action.icon, { className: 'h-[14px] w-[14px]' })}
          {action.label}
        </button>
      ))}
    </div>
  );
}

// ─── GitStatusCard ─────────────────────────────────────────────

export interface GitStatusCardProps {
  branch?: string;
  modified?: boolean;
  insertions?: number;
  deletions?: number;
  onViewDiff?: () => void;
}

export function GitStatusCard({
  branch = 'main',
  modified = true,
  insertions = 12,
  deletions = 3,
  onViewDiff,
}: GitStatusCardProps) {
  return (
    <div className="rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)] px-2 py-0.5 font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">
            <GitBranch className="h-3 w-3" />
            {branch}
          </span>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              modified ? 'animate-pulse bg-[var(--vestara-accent-os-amber)]' : 'bg-[var(--vestara-text-os-muted)]',
            )}
          />
          <span className="text-[11px] font-medium text-[var(--vestara-text-os-secondary)]">
            {modified ? 'modified' : 'clean'}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-3 font-mono text-[11px]">
        <span className="rounded border border-[var(--vestara-accent-os-teal)]/20 bg-[var(--vestara-accent-os-teal)]/10 px-2 py-0.5 text-[var(--vestara-accent-os-teal)]">
          +{insertions} ins
        </span>
        <span className="rounded border border-[var(--vestara-status-os-danger)]/20 bg-[var(--vestara-status-os-danger)]/10 px-2 py-0.5 text-[var(--vestara-status-os-danger)]">
          -{deletions} del
        </span>
      </div>
      {onViewDiff && (
        <button
          type="button"
          onClick={onViewDiff}
          className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[12px] text-[var(--vestara-text-os-secondary)] transition-colors hover:border-[var(--vestara-border-os-strong)] hover:text-[var(--vestara-text-os-primary)]"
        >
          <FileText className="h-3 w-3" /> View diff
        </button>
      )}
    </div>
  );
}

// ─── Toast ─────────────────────────────────────────────────────

export interface ToastProps {
  message: string;
  show?: boolean;
  time?: string;
}

export function Toast({ message, show = true, time }: ToastProps) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[80] -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-[var(--vestara-border-os-strong)] bg-[var(--vestara-surface-os-raised)] px-4 py-2.5 text-[13px] text-[var(--vestara-text-os-primary)] shadow-[var(--vestara-elevation-lg)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--vestara-accent-os-teal)]" />
        <span>{message}</span>
        <span className="mx-1 h-4 w-px bg-[var(--vestara-border-os-subtle)]" />
        <span className="font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
          {time ?? new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

// ─── Re-exports (icon helpers used by consumers) ───────────────

export { Check };
