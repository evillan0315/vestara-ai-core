/**
 * VES-OVERVIEW-001: Today's Focus Component
 *
 * Checklist with gradient progress, priority glow dots, and an
 * Add Task row on the Marketplace row grammar.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { OverviewFocusItem } from '../overview.types';
import { SectionCard } from './SectionCard';

interface TodayFocusProps {
  items: readonly OverviewFocusItem[];
}

const PRIORITY_COLOR: Record<string, string> = {
  high: 'var(--vestara-status-error)',
  medium: 'var(--vestara-marketplace-primary)',
  low: 'var(--vestara-status-success)',
};

const PRIORITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
};

export function TodayFocus({ items }: TodayFocusProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const resolved = items.map((item) => ({
    ...item,
    completed: overrides[item.id] ?? item.completed ?? false,
  }));

  function toggle(id: string) {
    setOverrides((prev) => {
      const current = prev[id] ?? items.find((i) => i.id === id)?.completed ?? false;
      return { ...prev, [id]: !current };
    });
  }

  if (items.length === 0) {
    return (
      <SectionCard title="Today's Focus" actionLabel="✎ Edit" accent="var(--vestara-accent-primary)" index={5}>
        <p className="py-4 text-center text-[12px] text-[var(--vestara-text-muted)]">
          No priority items today. You&apos;re all caught up!
        </p>
      </SectionCard>
    );
  }

  const done = resolved.filter((i) => i.completed).length;
  const pct = resolved.length ? Math.round((done / resolved.length) * 100) : 0;

  return (
    <SectionCard title="Today's Focus" actionLabel="✎ Edit" accent="var(--vestara-accent-primary)" index={1}>
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--vestara-text-muted)]">
          <span>{done} of {resolved.length} done</span>
          <span className="text-[var(--vestara-text-primary)]">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--vestara-text-muted)_18%,transparent)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Today's focus progress">
          <span
            className="block h-full rounded-[inherit] bg-gradient-to-r from-[var(--vestara-marketplace-primary)] to-[var(--vestara-accent)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <ul className="space-y-1.5">
        {resolved.map((item, i) => (
          <li key={item.id} className="mpg-enter" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="mpg-category-row px-1" title={`${item.title} · ${item.reason} · ${item.priority} priority`}>
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  aria-pressed={item.completed}
                  aria-label={`${item.completed ? 'Mark not done' : 'Mark done'}: ${item.title}`}
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold transition-all ${
                    item.completed
                      ? 'border-[var(--ov-check-checked-border)] bg-[var(--ov-check-checked-bg)] text-[var(--ov-check-checked-fg)]'
                      : 'border-[var(--vestara-border-strong)] bg-transparent text-transparent hover:border-[var(--vestara-accent)]'
                  }`}
                  style={item.completed ? { boxShadow: '0 0 8px color-mix(in srgb, var(--ov-check-checked-bg) 60%, transparent)' } : undefined}
                >
                  <span aria-hidden="true">✓</span>
                </button>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-[12.5px] ${
                      item.completed
                        ? 'text-[var(--vestara-text-muted)] line-through'
                        : 'text-[var(--vestara-text-primary)]'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">
                    {item.reason}
                  </span>
                </span>
              </span>
              <span
                className="mpg-tag-pill shrink-0 tabular-nums"
                style={{ color: PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.low }}
              >
                <span
                  aria-hidden="true"
                  title={`${item.priority} priority`}
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.low, boxShadow: `0 0 6px ${PRIORITY_COLOR[item.priority] ?? PRIORITY_COLOR.low}` }}
                />
                {PRIORITY_LABEL[item.priority] ?? item.priority}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <Link
        to="/tasks"
        className="mpg-category-row mt-3 justify-center text-[12.5px] font-medium text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
      >
        <span aria-hidden="true" className="text-[14px]">＋</span> Add Task
      </Link>
    </SectionCard>
  );
}
