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
        <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--vestara-accent-light),var(--vestara-accent)_55%,var(--vestara-accent-dark))] text-[var(--vestara-on-accent)] shadow-[0_8px_28px_-8px_var(--vestara-accent-glow)] ring-1 ring-[var(--vestara-surface-sheen)]">
          {icon}
        </div>
      )}
      <h3 className="mb-1 text-sm font-semibold tracking-tight text-[var(--vestara-text-primary)]">{title}</h3>
      {description && (
        <p className="mb-4 max-w-[230px] text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
