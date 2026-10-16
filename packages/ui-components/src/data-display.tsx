/**
 * @vestara/ui-components — Data display primitives (CodeBlock, PropTable).
 */

import { useState } from 'react';
import { Copy } from './icons.js';
import { cn } from './utils.js';

// ─── CodeBlock ─────────────────────────────────────────────────

export interface CodeBlockProps {
  code: string;
  onCopy?: () => void;
  className?: string;
}

export function CodeBlock({ code, onCopy, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-canvas)]',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
          onCopy?.();
          window.setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 z-10 flex h-6 items-center gap-1 rounded-[6px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-2 font-mono text-[11px] text-[var(--vestara-text-os-secondary)] transition-colors hover:text-[var(--vestara-text-os-primary)]"
      >
        <Copy className="h-3 w-3" />
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap p-3 pr-16 font-mono text-[12px] leading-5 text-[var(--vestara-text-os-secondary)]">
        {code}
      </pre>
    </div>
  );
}

// ─── PropTable ─────────────────────────────────────────────────

export interface PropRow {
  prop: string;
  type: string;
  default?: string;
  desc: string;
}

export interface PropTableProps {
  rows: readonly PropRow[];
  className?: string;
}

export function PropTable({ rows, className }: PropTableProps) {
  const keyed = rows.map((row, position) => ({ key: `${row.prop}-${position}`, row }));
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[10px] border border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-canvas)]',
        className,
      )}
    >
      <div className="grid grid-cols-[0.9fr_1.1fr_0.6fr_1.2fr] gap-2 border-b border-[var(--vestara-border-os-subtle)] bg-[var(--vestara-surface-os-raised)] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--vestara-text-os-muted)]">
        <span>Prop</span>
        <span>Type</span>
        <span>Default</span>
        <span>Desc</span>
      </div>
      {keyed.map(({ key, row }) => (
        <div
          key={key}
          className="grid grid-cols-[0.9fr_1.1fr_0.6fr_1.2fr] gap-2 border-b border-[var(--vestara-surface-os-raised)] px-3 py-2.5 text-[12px] transition-colors last:border-0 hover:bg-[var(--vestara-surface-os-raised)]/60"
        >
          <span className="font-mono text-[12px] text-[var(--vestara-accent-os-teal)]">{row.prop}</span>
          <span className="truncate font-mono text-[11px] text-[var(--vestara-text-os-secondary)]" title={row.type}>
            {row.type}
          </span>
          <span className="font-mono text-[11px] text-[var(--vestara-text-os-muted)]">{row.default ?? '—'}</span>
          <span className="text-[11px] leading-snug text-[var(--vestara-text-os-secondary)]">{row.desc}</span>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="px-3 py-4 text-center text-[12px] text-[var(--vestara-text-os-muted)]">No props.</p>
      )}
    </div>
  );
}
