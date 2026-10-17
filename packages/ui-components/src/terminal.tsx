/**
 * @vestara/ui-components — Terminal drawer primitives.
 *
 * Merged from the VESTARA reference artifact (terminal drawer system):
 * a bottom drawer shell with drag resize + snap heights, session tabs,
 * an interactive pane, a resizable split view, command autocomplete, and
 * a collapsed status bar. Every visual value resolves through a
 * `var(--vestara-*)` token (VES-DESIGN-006) — no raw hex, no arbitrary
 * utilities — so the drawer follows the selected theme, accent palette,
 * and workspace profile like every other primitive.
 */

import { type ComponentType, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Cpu,
  FileText,
  Folder,
  GitBranch,
  HardDrive,
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelBottom,
  PanelBottomOpen,
  Plus,
  Search,
  Split,
  Terminal as TerminalGlyph,
  Trash2,
  X,
} from './icons.js';
import { cn } from './utils.js';

// ─── Types ─────────────────────────────────────────────────────

export type TerminalStatus = 'ok' | 'error' | 'idle';

export type TerminalSessionStatus = 'active' | 'idle' | 'error';

export interface TerminalSession {
  id: string;
  name: string;
  status: TerminalSessionStatus;
  icon?: ComponentType<{ className?: string }>;
}

export interface TerminalHistoryEntry {
  id: string;
  cmd: string;
  output: string;
  exitCode: number;
}

export interface SuggestCommand {
  name: string;
  desc: string;
  icon: ComponentType<{ className?: string }>;
}

// ─── CollapsedBar ──────────────────────────────────────────────

export interface CollapsedBarProps {
  sessionCount?: number;
  lastCommand?: string;
  lastStatus?: TerminalStatus;
  onExpand: () => void;
  onClose?: () => void;
}

const COLLAPSED_DOT: Record<TerminalStatus, string> = {
  ok: 'bg-[var(--vestara-accent-os-teal)] shadow-[0_0_6px_var(--vestara-accent-os-teal)]',
  error: 'bg-[var(--vestara-status-os-danger)]',
  idle: 'bg-[var(--vestara-accent-os-amber)]',
};

const COLLAPSED_MARK: Record<TerminalStatus, string> = {
  ok: '✓',
  error: '✗',
  idle: '○',
};

export function CollapsedBar({
  sessionCount = 3,
  lastCommand = 'ls',
  lastStatus = 'ok',
  onExpand,
  onClose,
}: CollapsedBarProps) {
  return (
    <div className="flex h-9 min-h-[36px] shrink-0 items-center gap-3 border-t border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-3">
      <div className="flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)]">
          <TerminalGlyph className="h-3.5 w-3.5 text-[var(--vestara-accent-os-teal)]" />
        </div>
        <span className="text-[12px] font-medium text-[var(--vestara-text-os-primary)]">Terminal</span>
        <span className="h-1 w-1 rounded-full bg-[var(--vestara-text-os-faint)]" />
        <span className="font-mono text-[11px] text-[var(--vestara-text-os-secondary)]">{sessionCount} sessions</span>
      </div>
      <div className="hidden items-center gap-2 font-mono text-[11px] sm:flex">
        <span className={cn('h-1.5 w-1.5 rounded-full', COLLAPSED_DOT[lastStatus])} />
        <span className="text-[var(--vestara-text-os-muted)]">
          {COLLAPSED_MARK[lastStatus]} {lastCommand}
        </span>
        <span className="text-[var(--vestara-text-os-faint)]">• 2s ago</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onExpand}
          className="flex h-6 items-center gap-1 rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)] px-2.5 font-mono text-[11px] text-[var(--vestara-text-os-secondary)] hover:border-[var(--vestara-border-os-strong)] hover:text-[var(--vestara-text-os-primary)]"
        >
          <PanelBottomOpen className="h-3 w-3" /> Expand
        </button>
        {onClose && (
          <button
            type="button"
            aria-label="Close terminal"
            onClick={onClose}
            className="grid h-6 w-6 place-items-center rounded-[6px] text-[var(--vestara-text-os-muted)] hover:bg-[var(--vestara-surface-os-hover)]"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── TerminalTabs ──────────────────────────────────────────────

export interface TerminalTabsProps {
  tabs: readonly TerminalSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onNew?: () => void;
}

const SESSION_DOT: Record<TerminalSessionStatus, string> = {
  active: 'bg-[var(--vestara-accent-os-teal)] shadow-[0_0_6px_var(--vestara-accent-os-teal)]',
  idle: 'bg-[var(--vestara-accent-os-amber)]',
  error: 'bg-[var(--vestara-status-os-danger)] shadow-[0_0_6px_var(--vestara-status-os-danger)]',
};

export function TerminalTabs({ tabs, activeId, onSelect, onClose, onNew }: TerminalTabsProps) {
  return (
    <div className="relative flex h-8 min-h-[32px] shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-2">
      <div className="flex items-center gap-1">
        {tabs.map((tab) => {
          const isActive = activeId === tab.id;
          const Glyph = tab.icon ?? TerminalGlyph;
          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={isActive}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(tab.id);
                }
              }}
              className={cn(
                'group flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] border px-2.5 pr-1 text-[12px] transition-all',
                isActive
                  ? 'border-[var(--vestara-accent-os-teal)]/30 bg-[var(--vestara-surface-os-elevated)] text-[var(--vestara-text-os-primary)] shadow-[0_0_0_1px_var(--vestara-accent-os-teal)]/10'
                  : 'border-transparent bg-transparent text-[var(--vestara-text-os-secondary)] hover:border-[var(--vestara-border-os-subtle)] hover:bg-[var(--vestara-surface-os-raised)] hover:text-[var(--vestara-text-os-primary)]',
              )}
            >
              <Glyph
                className={cn(
                  'h-3 w-3',
                  isActive ? 'text-[var(--vestara-accent-os-teal)]' : 'text-[var(--vestara-text-os-muted)]',
                )}
              />
              <span className="font-medium">{tab.name}</span>
              <span className={cn('ml-1 h-1.5 w-1.5 rounded-full', SESSION_DOT[tab.status])} />
              <button
                type="button"
                aria-label={`Close ${tab.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose?.(tab.id);
                }}
                className="ml-1 grid h-4 w-4 place-items-center rounded-[5px] text-[var(--vestara-text-os-muted)] opacity-0 transition-all hover:bg-[var(--vestara-surface-os-hover)] hover:text-[var(--vestara-text-os-primary)] group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
      {onNew && (
        <button
          type="button"
          aria-label="New terminal tab"
          onClick={onNew}
          className="ml-2 grid h-6 w-6 shrink-0 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] hover:border-[var(--vestara-border-os-strong)] hover:text-[var(--vestara-text-os-primary)]"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 w-8 bg-gradient-to-l from-[var(--vestara-surface-os-panel)] to-transparent" />
    </div>
  );
}

// ─── TerminalSuggest ───────────────────────────────────────────

export interface TerminalSuggestProps {
  query: string;
  visible: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
  commands?: readonly SuggestCommand[];
}

const DEFAULT_SUGGEST_COMMANDS: readonly SuggestCommand[] = [
  { name: 'ls', desc: 'List directory', icon: Folder },
  { name: 'pwd', desc: 'Print working dir', icon: HardDrive },
  { name: 'vestara status', desc: 'OS status & sessions', icon: Cpu },
  { name: 'help', desc: 'Available commands', icon: FileText },
  { name: 'clear', desc: 'Clear terminal', icon: Trash2 },
  { name: 'git status', desc: 'Show git changes', icon: GitBranch },
  { name: 'echo', desc: 'Echo text', icon: MessageSquare },
  { name: 'cat', desc: 'Show file', icon: FileText },
];

export function TerminalSuggest({
  query,
  visible,
  onSelect,
  onClose,
  commands = DEFAULT_SUGGEST_COMMANDS,
}: TerminalSuggestProps) {
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? commands.filter((cmd) => cmd.name.toLowerCase().includes(q) || cmd.desc.toLowerCase().includes(q))
      : commands;
    return list.slice(0, 6);
  }, [query, commands]);

  if (!visible || matches.length === 0) return null;

  return (
    <div className="absolute bottom-[48px] left-3 right-3 z-10 overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] shadow-[var(--vestara-elevation-lg)]">
      <div className="max-h-[200px] overflow-auto py-1">
        {matches.map((cmd) => (
          <button
            key={cmd.name}
            type="button"
            onClick={() => {
              onSelect(cmd.name);
              onClose();
            }}
            className="group flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--vestara-surface-os-hover)]"
          >
            <span className="grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] text-[var(--vestara-text-os-muted)] group-hover:text-[var(--vestara-accent-os-teal)]">
              <cmd.icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[12px] text-[var(--vestara-text-os-primary)]">{cmd.name}</span>
              <span className="block truncate text-[11px] text-[var(--vestara-text-os-muted)]">{cmd.desc}</span>
            </span>
            <span className="font-mono text-[10px] text-[var(--vestara-text-os-faint)]">↵</span>
          </button>
        ))}
      </div>
      <div className="flex h-7 items-center justify-between border-t border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-3 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
        <span>↑↓ navigate • ⏎ select</span>
        <span className="flex items-center gap-1">
          <span className="rounded border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-1 py-0.5">
            ESC
          </span>
          close
        </span>
      </div>
    </div>
  );
}

// ─── TerminalPane ──────────────────────────────────────────────

export interface TerminalPaneProps {
  id?: string;
  initialHistory?: readonly TerminalHistoryEntry[];
  onCommand?: (cmd: string) => void;
  cwd?: string;
  branch?: string;
  user?: string;
  showStatusBar?: boolean;
  onClear?: () => void;
  /** Controlled input override; uncontrolled when omitted. */
  value?: string;
  onInputChange?: (value: string) => void;
  insertions?: number;
  deletions?: number;
}

const DEFAULT_HISTORY: readonly TerminalHistoryEntry[] = [
  {
    id: 'h1',
    cmd: 'vestara status',
    output:
      'VESTARA OS v0.9.4\n• Workspace: Connected\n• Sessions: 3 active (bash, zsh, vestara)\n• Marketplace: 46 TOTAL • 38 ACTIVE • 8 PARKED\n• Partition: vestara_a ACTIVE ✓ Verified Boot\n• Uptime: 2h 14m',
    exitCode: 0,
  },
  {
    id: 'h2',
    cmd: 'ls',
    output: 'AGENTS.md  apps/  package.json  src/  vestara.db  README.md\n6 items • 124 files indexed',
    exitCode: 0,
  },
];

function runLocalCommand(cmd: string, cwd: string, branch: string): { output: string; exitCode: number } {
  const input = cmd.trim();
  if (input === 'ls') {
    return {
      output: 'AGENTS.md  apps/  package.json  src/  vestara.db  README.md\n6 items • 124 files indexed',
      exitCode: 0,
    };
  }
  if (input.startsWith('vestara status')) {
    return {
      output:
        'VESTARA OS v0.9.4\n• Workspace: Connected\n• Sessions: 3 active\n• Marketplace: 46 TOTAL • 38 ACTIVE • 8 PARKED\n• Partition A ACTIVE ✓\n• MEM 64% • CORE 12',
      exitCode: 0,
    };
  }
  if (input === 'help') {
    return {
      output:
        'Available commands:  ls, pwd, vestara status, git status, clear, help, echo <text>, cat <file>\nType a command and press Enter. Tab for autocomplete.',
      exitCode: 0,
    };
  }
  if (input === 'pwd') return { output: '/home/eddie/marketplace', exitCode: 0 };
  if (input === 'git status') {
    return {
      output: `On branch ${branch} • modified\nChanges: +2 -1\n  modified: src/components/TerminalDrawer.tsx\n  modified: AGENTS.md\n2 files changed`,
      exitCode: 0,
    };
  }
  if (input.startsWith('echo ')) return { output: input.slice(5), exitCode: 0 };
  if (input.startsWith('cat '))
    return { output: `# ${input.slice(4)}\nFile content preview (local draft)...`, exitCode: 0 };
  return { output: `command not found: ${input}\nTry 'help' for list`, exitCode: 127 };
}

export function TerminalPane({
  id = 'bash',
  initialHistory = DEFAULT_HISTORY,
  onCommand,
  cwd = '~/marketplace',
  branch = 'main',
  user = 'eddie@vestara',
  showStatusBar = true,
  onClear,
  value,
  onInputChange,
  insertions = 2,
  deletions = 1,
}: TerminalPaneProps) {
  const [history, setHistory] = useState<readonly TerminalHistoryEntry[]>(initialHistory);
  const [inner, setInner] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const input = value ?? inner;
  const setInput = onInputChange ?? setInner;

  useEffect(() => {
    if (history.length === 0) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history]);

  const submit = (raw: string) => {
    const cmd = raw.trim();
    if (!cmd) return;
    if (cmd === 'clear') {
      setHistory([]);
      setInput('');
      setSuggestOpen(false);
      onClear?.();
      return;
    }
    const { output, exitCode } = runLocalCommand(cmd, cwd, branch);
    setHistory((prev) => [...prev, { id: `${Date.now()}`, cmd, output, exitCode }]);
    setInput('');
    setSuggestOpen(false);
    onCommand?.(cmd);
  };

  const toggleCollapsed = (entryId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const lastExit = history.length > 0 ? history[history.length - 1].exitCode : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--vestara-surface-os-canvas)]" data-terminal={id}>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-3 font-mono text-[12px] leading-[18px]">
        {history.map((entry) => (
          <div key={entry.id} className="group">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-[var(--vestara-accent-os-teal)]">{user}</span>
              <span className="text-[var(--vestara-text-os-muted)]">{cwd}</span>
              <span className="rounded border border-[var(--vestara-status-os-success)]/30 bg-[var(--vestara-status-os-success)]/10 px-1.5 py-0.5 text-[10px] text-[var(--vestara-status-os-success)]">
                {branch} • modified
              </span>
              <button
                type="button"
                aria-label={collapsed.has(entry.id) ? 'Expand output' : 'Collapse output'}
                onClick={() => toggleCollapsed(entry.id)}
                className="ml-auto grid h-4 w-4 place-items-center rounded text-[var(--vestara-text-os-muted)] hover:bg-[var(--vestara-surface-os-raised)]"
              >
                <ChevronDown className={cn('h-3 w-3 transition-transform', collapsed.has(entry.id) && '-rotate-90')} />
              </button>
            </div>
            <div className="mt-1 flex items-start gap-2">
              <span className="select-none text-[var(--vestara-text-os-muted)]">$</span>
              <span className="text-[var(--vestara-text-os-primary)]">{entry.cmd}</span>
              <span
                className={cn(
                  'ml-auto rounded px-1 font-mono text-[10px]',
                  entry.exitCode === 0
                    ? 'bg-[var(--vestara-surface-os-elevated)] text-[var(--vestara-text-os-muted)]'
                    : 'border border-[var(--vestara-status-os-danger)]/30 bg-[var(--vestara-status-os-danger)]/10 text-[var(--vestara-status-os-danger)]',
                )}
              >
                {entry.exitCode === 0 ? '✓' : `✗ ${entry.exitCode}`}
              </span>
            </div>
            {!collapsed.has(entry.id) && (
              <div className="ml-4 mt-2 whitespace-pre-wrap border-l border-[var(--vestara-border-os-subtle)] pl-3 text-[var(--vestara-text-os-secondary)]">
                <span className="text-[var(--vestara-text-os-muted)]">{entry.output}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <TerminalSuggest
        query={input}
        visible={suggestOpen && input.length > 0}
        onSelect={(name) => submit(name)}
        onClose={() => setSuggestOpen(false)}
      />

      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-2">
        <span className="font-mono text-[11px] text-[var(--vestara-accent-os-teal)]">{user}</span>
        <span className="font-mono text-[11px] text-[var(--vestara-text-os-muted)]">{cwd}</span>
        <span className="rounded border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vestara-accent-os-amber)]">
          {branch}
        </span>
        <div className="relative flex h-8 flex-1 items-center gap-2 rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-canvas)] px-2.5">
          <span className="font-mono text-[12px] text-[var(--vestara-text-os-muted)]">$</span>
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submit(input);
              if (event.key === 'Escape') setSuggestOpen(false);
              if (event.key === 'Tab') {
                event.preventDefault();
                setSuggestOpen(true);
              }
            }}
            placeholder="Type ls, vestara status, help, clear… (Tab autocomplete)"
            aria-label="Terminal input"
            className="flex-1 bg-transparent font-mono text-[12px] text-[var(--vestara-text-os-primary)] outline-none placeholder:text-[var(--vestara-text-os-faint)]"
          />
          <span className="inline-block h-4 w-2 animate-pulse bg-[var(--vestara-accent-os-teal)]" />
        </div>
      </div>

      {showStatusBar && (
        <div className="flex h-6 shrink-0 items-center gap-3 border-t border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-3 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
          <span className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" /> {cwd}
          </span>
          <span className="h-3 w-px bg-[var(--vestara-border-os-subtle)]" />
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--vestara-accent-os-teal)]" /> exit {lastExit}
          </span>
          <span className="h-3 w-px bg-[var(--vestara-border-os-subtle)]" />
          <span className="flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> {branch} • modified
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="rounded border border-[var(--vestara-accent-os-teal)]/20 bg-[var(--vestara-accent-os-teal)]/10 px-1.5 py-0.5 text-[var(--vestara-accent-os-teal)]">
              +{insertions}
            </span>
            <span className="rounded border border-[var(--vestara-status-os-danger)]/20 bg-[var(--vestara-status-os-danger)]/10 px-1.5 py-0.5 text-[var(--vestara-status-os-danger)]">
              -{deletions}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── SplitView ─────────────────────────────────────────────────

export interface SplitViewProps {
  orientation?: 'horizontal' | 'vertical';
  leftPane?: ReactNode;
  rightPane?: ReactNode;
  initialRatio?: number;
}

function clampRatio(ratio: number): number {
  return Math.min(0.8, Math.max(0.2, ratio));
}

export function SplitView({ orientation = 'horizontal', leftPane, rightPane, initialRatio = 0.5 }: SplitViewProps) {
  const [ratio, setRatio] = useState(clampRatio(initialRatio));
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (orientation === 'horizontal') {
        setRatio(clampRatio((event.clientX - rect.left) / rect.width));
      } else {
        setRatio(clampRatio((event.clientY - rect.top) / rect.height));
      }
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, orientation]);

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      ref={containerRef}
      className={cn('flex min-h-0 flex-1 overflow-hidden', isHorizontal ? 'flex-row' : 'flex-col')}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ flex: ratio }}>
        {leftPane ?? <TerminalPane id="left" />}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: adjustable pane divider follows the separator slider pattern (focusable, arrow-key resizing, valuemin/max/now) — an <hr> thematic break cannot carry the resize interaction */}
      <div
        onMouseDown={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            event.preventDefault();
            setRatio((current) => clampRatio(current - 0.05));
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            event.preventDefault();
            setRatio((current) => clampRatio(current + 0.05));
          }
        }}
        role="separator"
        tabIndex={0}
        aria-orientation={isHorizontal ? 'vertical' : 'horizontal'}
        aria-label="Resize terminal panes"
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(ratio * 100)}
        className={cn(
          'group relative shrink-0 bg-[var(--vestara-border-os-subtle)] transition-colors hover:bg-[var(--vestara-accent-os-teal)]',
          isHorizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize',
        )}
      >
        <div
          className={cn(
            'bg-[var(--vestara-accent-os-teal)] opacity-0 transition-opacity group-hover:opacity-100',
            dragging && 'opacity-100',
            'absolute inset-0',
          )}
        />
        <div
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--vestara-accent-os-teal)] opacity-0 shadow-[0_0_8px_var(--vestara-accent-os-teal)] transition-opacity group-hover:opacity-100',
            dragging && 'opacity-100',
            isHorizontal ? 'h-8 w-1' : 'h-1 w-8',
          )}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ flex: 1 - ratio }}>
        {rightPane ?? <TerminalPane id="right" cwd="~/marketplace/logs" />}
      </div>
    </div>
  );
}

// ─── TerminalDrawer ────────────────────────────────────────────

export interface TerminalDrawerProps {
  height: number;
  onHeightChange: (height: number) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  sessionCount?: number;
  lastCommand?: string;
  onSearch?: () => void;
  onSplitH?: () => void;
  onSplitV?: () => void;
  onMaximize?: () => void;
  onClear?: () => void;
  onClose?: () => void;
  isMaximized?: boolean;
  children?: ReactNode;
}

export function TerminalDrawer({
  height,
  onHeightChange,
  collapsed,
  onToggleCollapsed,
  sessionCount = 3,
  lastCommand = 'ls',
  onSearch,
  onSplitH,
  onSplitV,
  onMaximize,
  onClear,
  onClose,
  isMaximized = false,
  children,
}: TerminalDrawerProps) {
  const [dragging, setDragging] = useState(false);
  const grabStartY = useRef(0);
  const grabStartHeight = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      const next = grabStartHeight.current + (grabStartY.current - event.clientY);
      const max = typeof window === 'undefined' ? 900 : window.innerHeight * 0.85;
      onHeightChange(Math.min(Math.max(Math.round(next), 48), Math.round(max)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, onHeightChange]);

  if (collapsed) {
    return (
      <CollapsedBar
        sessionCount={sessionCount}
        lastCommand={lastCommand}
        onExpand={onToggleCollapsed}
        onClose={onClose}
      />
    );
  }

  const maxHeight = typeof window === 'undefined' ? 900 : Math.round(window.innerHeight * 0.85);
  const nudgeHeight = (delta: number) => onHeightChange(Math.min(Math.max(height + delta, 48), maxHeight));

  return (
    <div
      className={cn(
        'relative flex shrink-0 flex-col overflow-hidden border-t border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] shadow-[var(--vestara-elevation-lg)] backdrop-blur-[12px]',
        !dragging && 'transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
      )}
      style={{ height }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: adjustable drawer handle follows the separator slider pattern (focusable, arrow-key resizing, valuemin/max/now) — an <hr> thematic break cannot carry the resize interaction */}
      <div
        onMouseDown={(event) => {
          event.preventDefault();
          grabStartY.current = event.clientY;
          grabStartHeight.current = height;
          setDragging(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            nudgeHeight(24);
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            nudgeHeight(-24);
          }
        }}
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="Resize terminal drawer"
        aria-valuemin={48}
        aria-valuemax={maxHeight}
        aria-valuenow={Math.min(height, maxHeight)}
        className="group absolute inset-x-0 top-0 z-20 flex h-8 cursor-row-resize items-center justify-center"
      >
        <div className="h-1 w-10 rounded-full bg-[var(--vestara-border-os-subtle)] transition-all group-hover:w-12 group-hover:bg-[var(--vestara-accent-os-teal)]/60" />
      </div>

      <div className="mt-2 flex h-9 shrink-0 items-center gap-2 border-b border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-3">
        <div className="flex items-center gap-2">
          <TerminalGlyph className="h-4 w-4 text-[var(--vestara-accent-os-teal)]" />
          <span className="text-[12px] font-semibold tracking-wide text-[var(--vestara-text-os-primary)]">
            Terminal
          </span>
          <span className="rounded-full border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
            {sessionCount} sessions
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onSearch}
            className="flex h-6 items-center gap-1 rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-2 font-mono text-[11px] text-[var(--vestara-text-os-muted)] hover:text-[var(--vestara-text-os-primary)]"
          >
            <Search className="h-3 w-3" /> ⌘F
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--vestara-border-os-subtle)]" />
          <button
            type="button"
            onClick={onSplitH}
            title="Split horizontal"
            aria-label="Split horizontal"
            className="grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] hover:border-[var(--vestara-border-os-strong)] hover:text-[var(--vestara-text-os-primary)]"
          >
            <PanelBottomOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onSplitV}
            title="Split vertical"
            aria-label="Split vertical"
            className="grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] hover:border-[var(--vestara-border-os-strong)] hover:text-[var(--vestara-text-os-primary)]"
          >
            <Split className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClear}
            title="Clear"
            aria-label="Clear terminal"
            className="grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] hover:text-[var(--vestara-text-os-primary)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
            aria-label={isMaximized ? 'Restore terminal' : 'Maximize terminal'}
            className="grid h-6 w-6 place-items-center rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-muted)] hover:text-[var(--vestara-text-os-primary)]"
          >
            {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose ?? onToggleCollapsed}
            title="Close"
            aria-label="Close terminal"
            className="grid h-6 w-6 place-items-center rounded-[6px] text-[var(--vestara-text-os-muted)] hover:bg-[var(--vestara-status-os-danger)]/10 hover:text-[var(--vestara-status-os-danger)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
