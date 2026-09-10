/**
 * VES-UI-B7: EmptyState Component
 *
 * Domain-independent empty state pattern with icon, title, description,
 * and optional action. Shared between Activity Room (.ar-empty) and
 * Floating Assistant (EmptyState/SuggestionEmptyState).
 *
 * Architecture Traceability:
 *   VES-UI-B: Core UI Primitives
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export interface EmptyStateProps {
  /** Icon element (typically an SVG) */
  icon?: ReactNode;

  /** Title text */
  title: string;

  /** Description text */
  description?: string;

  /** Optional action button/link */
  action?: ReactNode;

  /** Additional class names */
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`relative flex flex-col items-center justify-center overflow-hidden p-6 text-center ${className}`}>
      {icon && (
        <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 shadow-[0_8px_28px_-8px_rgba(245,158,11,0.7)] ring-1 ring-white/25">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold tracking-tight text-zinc-100 mb-1">{title}</h3>
      {description && <p className="text-[11px] leading-relaxed text-zinc-500 mb-4 max-w-[230px]">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
