/**
 * @vestara/ui-components — Chat assistant primitives.
 *
 * Extracted from the VESTARA AI_OS reference artifact. Every visual value
 * resolves through a `var(--vestara-*)` token (VES-DESIGN-006).
 */

import { type ComponentType, createElement, type MouseEvent, type ReactNode, useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  Layers,
  Menu,
  MessageSquare,
  Plus,
  Send,
  Settings,
  Shield,
  Sparkles,
  X,
  Zap,
} from './icons.js';
import { cn } from './utils.js';

// ─── Types ─────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  preview: string;
  time: string;
  status: 'active' | 'alert' | 'idle';
  unread?: number;
}

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  time: string;
}

export interface TestRow {
  name: string;
  status: 'pass' | 'run' | 'fail';
  time: string;
}

export interface OsUnit {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
}

// ─── AppHeader ─────────────────────────────────────────────────

export interface AppHeaderProps {
  live?: boolean;
  actions?: ReactNode;
}

export function AppHeader({ live = true, actions }: AppHeaderProps) {
  return (
    <div className="flex h-14 items-center justify-between rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-4">
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-[var(--vestara-accent-os-teal)] to-[var(--vestara-accent-os-cyan)] text-[13px] font-bold text-[var(--vestara-color-os-on-accent)]">
          V
        </div>
        <span className="text-[13px] font-semibold tracking-wide text-[var(--vestara-text-os-primary)]">
          VESTARA OS
        </span>
        {live && (
          <span className="ml-1 flex items-center gap-1.5 border-l border-[var(--vestara-border-os-subtle)] pl-3 font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--vestara-accent-os-teal)] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--vestara-accent-os-teal)]" />
            </span>
            LIVE
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {actions ?? (
          <div className="grid h-7 w-7 place-items-center rounded-full border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)]">
            <Settings className="h-3.5 w-3.5 text-[var(--vestara-text-os-muted)]" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ModelSelector ─────────────────────────────────────────────

export interface ModelSelectorProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

export function ModelSelector({ value, options, onChange }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-3 text-[12px] text-[var(--vestara-text-os-primary)] hover:border-[var(--vestara-border-os-strong)]"
      >
        <Cpu className="h-3.5 w-3.5 text-[var(--vestara-accent-os-teal)]" />
        {value}
        <ChevronDown
          className={cn('h-3 w-3 text-[var(--vestara-text-os-muted)] transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[42px] z-20 w-[240px] overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-strong)] bg-[var(--vestara-surface-os-raised)] shadow-[var(--vestara-elevation-xl)]"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={cn(
                'w-full px-3 py-2.5 text-left text-[12px] hover:bg-[var(--vestara-surface-os-hover)]',
                value === option
                  ? 'bg-[var(--vestara-surface-os-elevated)] text-[var(--vestara-accent-os-teal)]'
                  : 'text-[var(--vestara-text-os-secondary)]',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── NewChatButton ─────────────────────────────────────────────

export interface NewChatButtonProps {
  onClick: () => void;
}

export function NewChatButton({ onClick }: NewChatButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-[10px] bg-[var(--vestara-accent-os-cyan)] px-4 text-[13px] font-medium text-[var(--vestara-color-os-on-accent)] shadow-[var(--vestara-elevation-md)] transition-colors hover:brightness-110"
    >
      <Plus className="h-4 w-4" /> New Chat
    </button>
  );
}

// ─── ConversationItem ──────────────────────────────────────────

export interface ConversationItemProps {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
}

export function ConversationItem({ conversation, active, onSelect }: ConversationItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group flex w-full items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition-all',
        active
          ? 'border-[var(--vestara-accent-os-teal)]/30 bg-[var(--vestara-surface-os-elevated)] text-[var(--vestara-text-os-primary)]'
          : 'border-transparent text-[var(--vestara-text-os-secondary)] hover:border-[var(--vestara-border-os-subtle)] hover:bg-[var(--vestara-surface-os-raised)] hover:text-[var(--vestara-text-os-primary)]',
      )}
    >
      <span
        className={cn(
          'mt-1 h-2 w-2 shrink-0 rounded-full',
          conversation.status === 'active'
            ? 'bg-[var(--vestara-accent-os-teal)]'
            : conversation.status === 'alert'
              ? 'bg-[var(--vestara-accent-os-amber)]'
              : 'bg-[var(--vestara-text-os-muted)]',
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[12.5px] font-medium">{conversation.title}</span>
          <span className="shrink-0 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
            {conversation.time}
          </span>
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-[var(--vestara-text-os-muted)]">
          {conversation.preview}
        </span>
      </span>
      {conversation.unread ? (
        <span className="ml-auto rounded-full bg-[var(--vestara-accent-os-teal)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--vestara-color-os-on-accent)]">
          {conversation.unread}
        </span>
      ) : null}
    </button>
  );
}

// ─── ConversationGroup ─────────────────────────────────────────

export interface ConversationGroupProps {
  label: string;
  count?: number;
}

export function ConversationGroup({ label, count }: ConversationGroupProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[var(--vestara-text-os-faint)]">
      <span>{label}</span>
      {count !== undefined && (
        <span className="rounded border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-1.5 py-0.5">
          {count}
        </span>
      )}
      <div className="h-px flex-1 bg-[var(--vestara-border-os-subtle)]" />
    </div>
  );
}

// ─── OsUnitsCard ───────────────────────────────────────────────

export interface OsUnitsCardProps {
  units?: readonly OsUnit[];
  activeCount?: number;
}

export function OsUnitsCard({ units, activeCount = 3 }: OsUnitsCardProps) {
  const resolved: readonly OsUnit[] = units ?? [
    { label: 'CORE', value: '12', icon: (p) => <Cpu {...p} /> },
    { label: 'MEM', value: '64%', icon: (p) => <Database {...p} /> },
    { label: 'NET', value: 'OK', icon: (p) => <Zap {...p} /> },
  ];
  return (
    <div className="relative overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-strong)] bg-gradient-to-br from-[var(--vestara-surface-os-elevated)] to-[var(--vestara-surface-os-panel)]">
      <div className="relative p-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-[var(--vestara-accent-os-teal)]">
            <Layers className="h-3.5 w-3.5" /> OS Units
          </span>
          <span className="rounded border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
            {activeCount} active
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {resolved.map((unit) => (
            <div
              key={unit.label}
              className="rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-2"
            >
              <div className="flex items-center gap-1 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
                {createElement(unit.icon, { className: 'h-3 w-3' })} {unit.label}
              </div>
              <div className="mt-1 text-[13px] font-medium text-[var(--vestara-text-os-primary)]">{unit.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WorkspaceTabs ─────────────────────────────────────────────

/** A single tab. Plain strings stay supported; objects add routing + badges. */
export interface WorkspaceTabItem {
  /** Stable id used for the active comparison. */
  id: string;
  label: string;
  /** Optional route/href — renders an anchor and enables `onNavigate`. */
  href?: string;
  /** Optional count badge (hidden when 0). */
  badge?: number | string;
}

export interface WorkspaceTabsProps {
  active: string;
  tabs?: readonly (string | WorkspaceTabItem)[];
  onActive: (value: string) => void;
  /** SPA hosts intercept anchor navigation; without it the anchor navigates. */
  onNavigate?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
  ariaLabel?: string;
}

const DEFAULT_WORKSPACE_TABS = ['Files', 'Code', 'Canvas', 'Terminal'];

function normalizeWorkspaceTab(tab: string | WorkspaceTabItem): WorkspaceTabItem {
  return typeof tab === 'string' ? { id: tab, label: tab } : tab;
}

export function WorkspaceTabs({
  active,
  tabs = DEFAULT_WORKSPACE_TABS,
  onActive,
  onNavigate,
  className,
  ariaLabel,
}: WorkspaceTabsProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        'flex w-fit max-w-full gap-1 overflow-x-auto rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] p-1',
        className,
      )}
    >
      {tabs.map(normalizeWorkspaceTab).map((tab) => {
        const isActive = active === tab.id;
        const tabClass = cn(
          'flex shrink-0 items-center gap-1.5 rounded-[7px] px-3 py-1 text-[12px] transition-all',
          isActive
            ? 'border border-[var(--vestara-border-os-strong)] bg-[var(--vestara-surface-os-hover)] text-[var(--vestara-text-os-primary)]'
            : 'text-[var(--vestara-text-os-muted)] hover:text-[var(--vestara-text-os-secondary)]',
        );
        const badge =
          tab.badge !== undefined && tab.badge !== 0 && tab.badge !== '' ? (
            <span className="inline-flex min-w-[1.15rem] items-center justify-center rounded-full border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-color-os-inverse)]/10 px-1 text-[10px] font-semibold text-[var(--vestara-text-os-secondary)]">
              {tab.badge}
            </span>
          ) : null;

        if (tab.href) {
          return (
            <a
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={(event) => onNavigate?.(tab.href as string, event)}
              className={tabClass}
            >
              {tab.label}
              {badge}
            </a>
          );
        }

        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onActive(tab.id)}
            className={tabClass}
          >
            {tab.label}
            {badge}
          </button>
        );
      })}
    </nav>
  );
}

// ─── ChatMessage ───────────────────────────────────────────────

export interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--vestara-accent-os-teal)]" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[75%] rounded-[12px] border px-3 py-2.5',
          isUser
            ? 'border-[var(--vestara-accent-os-cyan)]/30 bg-[var(--vestara-accent-os-cyan)]/10 text-[var(--vestara-text-os-primary)]'
            : 'border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] text-[var(--vestara-text-os-secondary)]',
        )}
      >
        <div className="text-[13px] leading-[1.5]">{message.text}</div>
        <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
          <Clock className="h-3 w-3" /> {message.time}
          {isUser && <CheckCheck className="h-3 w-3 text-[var(--vestara-accent-os-teal)]" />}
        </div>
      </div>
      {isUser && (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--vestara-accent-os-cyan)]/30 bg-[var(--vestara-accent-os-cyan)]/20 text-[11px] font-medium text-[var(--vestara-accent-os-cyan)]">
          U
        </div>
      )}
    </div>
  );
}

// ─── ArchitectureCard ──────────────────────────────────────────

export interface ArchitectureLayer {
  label: string;
  sub: string;
  tone: 'teal' | 'cyan' | 'amber';
}

export interface ArchitectureCardProps {
  version?: string;
  layers?: readonly ArchitectureLayer[];
}

const LAYER_TONE: Record<ArchitectureLayer['tone'], string> = {
  teal: 'bg-[var(--vestara-accent-os-teal)]',
  cyan: 'bg-[var(--vestara-accent-os-cyan)]',
  amber: 'bg-[var(--vestara-accent-os-amber)]',
};

export function ArchitectureCard({ version = 'v2.0', layers }: ArchitectureCardProps) {
  const resolved: readonly ArchitectureLayer[] = layers ?? [
    { label: 'Interface', sub: 'React 19 + Tailwind', tone: 'teal' },
    { label: 'Core', sub: 'VESTARA OS · primitives', tone: 'cyan' },
    { label: 'Storage', sub: 'IndexedDB · local draft', tone: 'amber' },
  ];
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)]">
      <div className="flex items-center justify-between border-b border-[var(--vestara-border-os-subtle)] px-3 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-[var(--vestara-text-os-muted)]">
          <Layers className="h-3.5 w-3.5" /> Architecture
        </span>
        <span className="rounded border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vestara-text-os-muted)]">
          {version}
        </span>
      </div>
      <div className="space-y-2 p-3">
        {resolved.map((layer, index) => (
          <div key={layer.label} className="relative pl-6">
            {index < resolved.length - 1 && (
              <div className="absolute left-[7px] top-[18px] h-[28px] w-px bg-[var(--vestara-border-os-default)]" />
            )}
            <div className={cn('absolute left-1 top-2 h-2 w-2 rounded-full', LAYER_TONE[layer.tone])} />
            <div className="rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-3 py-2">
              <div className="text-[12px] font-medium text-[var(--vestara-text-os-primary)]">{layer.label}</div>
              <div className="font-mono text-[11px] text-[var(--vestara-text-os-muted)]">{layer.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── GapCard ───────────────────────────────────────────────────

export interface GapCardProps {
  before?: string;
  after?: string;
}

export function GapCard({
  before = '12 files scattered, no tokens',
  after = 'Merged, one token system',
}: GapCardProps) {
  const [showAfter, setShowAfter] = useState(false);
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)]">
      <div className="flex items-center justify-between border-b border-[var(--vestara-border-os-subtle)] px-3 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--vestara-text-os-muted)]">
          Gap Analysis
        </span>
        <button
          type="button"
          onClick={() => setShowAfter((v) => !v)}
          aria-pressed={showAfter}
          className="rounded-[6px] border border-[var(--vestara-border-os-strong)] bg-[var(--vestara-surface-os-hover)] px-2 py-1 font-mono text-[11px] text-[var(--vestara-accent-os-teal)]"
        >
          {showAfter ? 'After' : 'Before'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div
          className={cn(
            'rounded-[8px] border p-2.5 transition-all',
            !showAfter
              ? 'border-[var(--vestara-status-os-danger)]/20 bg-[var(--vestara-status-os-danger)]/10'
              : 'border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] opacity-60',
          )}
        >
          <div className="flex items-center gap-1 font-mono text-[11px] text-[var(--vestara-status-os-danger)]">
            <X className="h-3 w-3" /> BEFORE
          </div>
          <div className="mt-1 text-[12px] text-[var(--vestara-text-os-secondary)]">{before}</div>
        </div>
        <div
          className={cn(
            'rounded-[8px] border p-2.5 transition-all',
            showAfter
              ? 'border-[var(--vestara-accent-os-teal)]/30 bg-[var(--vestara-surface-os-elevated)]'
              : 'border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] opacity-60',
          )}
        >
          <div className="flex items-center gap-1 font-mono text-[11px] text-[var(--vestara-accent-os-teal)]">
            <Check className="h-3 w-3" /> AFTER
          </div>
          <div className="mt-1 text-[12px] text-[var(--vestara-text-os-primary)]">{after}</div>
        </div>
      </div>
    </div>
  );
}

// ─── TestSuiteCard ─────────────────────────────────────────────

export interface TestSuiteCardProps {
  tests: readonly TestRow[];
}

const TEST_STATUS: Record<TestRow['status'], string> = {
  pass: 'bg-[var(--vestara-status-os-success)]/15 text-[var(--vestara-status-os-success)]',
  run: 'bg-[var(--vestara-status-os-info)]/15 text-[var(--vestara-status-os-info)]',
  fail: 'bg-[var(--vestara-status-os-danger)]/15 text-[var(--vestara-status-os-danger)]',
};

export function TestSuiteCard({ tests }: TestSuiteCardProps) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)]">
      <div className="flex items-center justify-between border-b border-[var(--vestara-border-os-subtle)] px-3 py-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-[var(--vestara-text-os-muted)]">
          <Shield className="h-3.5 w-3.5" /> Test Suite
        </span>
      </div>
      <div className="divide-y divide-[var(--vestara-border-os-subtle)]">
        {tests.map((test) => (
          <div key={test.name} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={cn('grid h-4 w-4 place-items-center rounded-full', TEST_STATUS[test.status])}>
                {test.status === 'pass' ? (
                  <Check className="h-3 w-3" />
                ) : test.status === 'run' ? (
                  <Clock className="h-3 w-3" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </span>
              <span className="text-[12px] text-[var(--vestara-text-os-primary)]">{test.name}</span>
            </div>
            <span className="font-mono text-[10px] text-[var(--vestara-text-os-muted)]">{test.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Composer ──────────────────────────────────────────────────

export interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
}

export function Composer({ value, onChange, onSend, placeholder = 'Message VESTARA OS…' }: ComposerProps) {
  return (
    <div className="flex items-end gap-2 rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] p-2">
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={1}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] px-3 py-2.5 text-[13px] text-[var(--vestara-text-os-primary)] placeholder:text-[var(--vestara-text-os-faint)] focus:border-[var(--vestara-accent-os-teal)]/40 focus:outline-none"
      />
      <button
        type="button"
        aria-label="Send message"
        onClick={onSend}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--vestara-accent-os-teal)] text-[var(--vestara-color-os-on-accent)] transition-colors hover:brightness-110"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── TypingIndicator ───────────────────────────────────────────

export interface TypingIndicatorProps {
  label?: string;
}

export function TypingIndicator({ label = 'VESTARA is thinking…' }: TypingIndicatorProps) {
  return (
    <div className="flex w-fit items-center gap-2 rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-3 py-2">
      <div className="grid h-6 w-6 place-items-center rounded-full border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-elevated)]">
        <Sparkles className="h-3 w-3 text-[var(--vestara-accent-os-teal)]" />
      </div>
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--vestara-text-os-muted)] [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--vestara-text-os-muted)] [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--vestara-text-os-muted)]" />
      </div>
      <span className="font-mono text-[11px] text-[var(--vestara-text-os-muted)]">{label}</span>
    </div>
  );
}

// ─── Sidebar ───────────────────────────────────────────────────

export interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  conversations: readonly Conversation[];
}

export function Sidebar({ open, onToggle, conversations }: SidebarProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-3 text-[12px] text-[var(--vestara-text-os-secondary)]"
      >
        <Menu className="h-3.5 w-3.5" /> {open ? 'Close Sidebar' : 'Open Sidebar'}
      </button>
      {open && (
        <div className="mt-3 w-[280px] overflow-hidden rounded-[12px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-panel)] shadow-[var(--vestara-elevation-xl)]">
          <div className="flex h-11 items-center justify-between border-b border-[var(--vestara-border-os-subtle)] px-3">
            <span className="text-[12px] font-medium text-[var(--vestara-text-os-primary)]">Workspace</span>
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={onToggle}
              className="grid h-6 w-6 place-items-center rounded text-[var(--vestara-text-os-muted)] hover:bg-[var(--vestara-surface-os-hover)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1 p-2">
            {conversations.slice(0, 3).map((conversation) => (
              <div
                key={conversation.id}
                className="flex items-center gap-2 rounded-[8px] px-2 py-2 text-[12px] text-[var(--vestara-text-os-secondary)] hover:bg-[var(--vestara-surface-os-elevated)]"
              >
                <MessageSquare className="h-3.5 w-3.5 text-[var(--vestara-text-os-faint)]" />
                {conversation.title}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
