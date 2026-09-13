/**
 * Dashboard premium row kit — Overview gallery grammar for Dashboard sections.
 *
 * Reuses the Marketplace/Overview materials (mpg-category-row, mpg-icon-box,
 * mpg-tag-pill, --ov-gauge-track) so Dashboard rows match Overview's
 * ProjectsSummary instead of running a parallel card style. Presentation
 * only — no domain behavior, no data fetching.
 */

import type { CSSProperties, ReactNode } from 'react';

/** Glowing icon-tile wash for a status accent (mirrors Overview tiles). */
export function tileStyle(accent: string): CSSProperties {
  return {
    background: `color-mix(in srgb, ${accent} 88%, transparent)`,
    borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
    boxShadow: `0 0 14px color-mix(in srgb, ${accent} 40%, transparent)`,
    width: '2rem',
    height: '2rem',
    fontSize: '0.85rem',
    borderRadius: '0.5rem',
    color: '#fff',
  };
}

export function DashTile({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <span aria-hidden="true" className="mpg-icon-box" style={tileStyle(accent)}>
      {children}
    </span>
  );
}

/** Status pill on the mpg-tag-pill grammar with an optional presence dot. */
export function DashPill({ dot, className = '', children }: { dot?: string; className?: string; children: ReactNode }) {
  return (
    <span className={`mpg-tag-pill shrink-0 ${className}`}>
      {dot && (
        <span
          aria-hidden="true"
          className="mr-1 inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: dot, boxShadow: `0 0 6px ${dot}` }}
        />
      )}
      {children}
    </span>
  );
}

/** Stagger helper for mpg-enter list items. */
export function enterDelay(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, 12) * 30}ms` };
}

/** Premium progress track on the --ov-gauge-track grammar. */
export function DashProgress({ value, color }: { value: number; color: string }) {
  return (
    <div className="bg-(--ov-gauge-track) h-1 w-full overflow-hidden rounded-full">
      <div className="h-1 rounded-full transition-all" style={{ width: `${Math.min(Math.max(value, 0), 100)}%`, backgroundColor: color }} />
    </div>
  );
}
