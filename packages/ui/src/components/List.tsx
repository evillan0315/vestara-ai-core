/**
 * VES-UI-C7: List Component
 *
 * Domain-independent list component with dividers, selection, and actions.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-C: Data Display (phases 6-8)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-005
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import type { ReactNode } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export type ListSize = 'sm' | 'md' | 'lg';

export interface ListProps {
  /** List size */
  size?: ListSize;

  /** Whether to show dividers between items */
  dividers?: boolean;

  /** Whether list has border */
  bordered?: boolean;

  /** Custom class name */
  className?: string;

  /** List content */
  children: ReactNode;
}

export interface ListItemProps {
  /** Whether item is selected */
  selected?: boolean;

  /** Whether item is disabled */
  disabled?: boolean;

  /** Click handler */
  onClick?: () => void;

  /** Leading content (icon, avatar, etc.) */
  leading?: ReactNode;

  /** Trailing content (action, badge, etc.) */
  trailing?: ReactNode;

  /** Custom class name */
  className?: string;

  /** Item content */
  children: ReactNode;
}

export interface ListItemTextProps {
  /** Primary text */
  primary: ReactNode;

  /** Secondary text */
  secondary?: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface ListItemActionProps {
  /** Action content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

export interface ListDividerProps {
  /** Custom class name */
  className?: string;
}

export interface ListHeaderProps {
  /** Header content */
  children: ReactNode;

  /** Custom class name */
  className?: string;
}

// ─── Styles ────────────────────────────────────────────────────

const SIZE_STYLES: Record<ListSize, { item: string; text: string }> = {
  sm: { item: 'px-3 py-1.5', text: 'text-xs' },
  md: { item: 'px-4 py-2.5', text: 'text-sm' },
  lg: { item: 'px-5 py-3', text: 'text-base' },
};

// ─── List Component ────────────────────────────────────────────

export function List({ size = 'md', dividers = false, bordered = false, className = '', children }: ListProps) {
  return (
    <ul
      className={`
        ${bordered ? 'rounded-xl border border-[var(--vestara-border-subtle)]' : ''}
        ${className}
      `}
      role="list"
    >
      {children}
    </ul>
  );
}

// ─── ListItem Component ────────────────────────────────────────

export function ListItem({
  selected = false,
  disabled = false,
  onClick,
  leading,
  trailing,
  className = '',
  children,
}: ListItemProps) {
  const sizeStyle = SIZE_STYLES.md;

  return (
    <li
      className={`
        flex items-center gap-3
        ${sizeStyle.item}
        ${onClick && !disabled ? 'cursor-pointer' : ''}
        ${selected ? 'bg-[var(--vestara-accent-primary)]/10' : ''}
        ${onClick && !disabled ? 'hover:bg-[var(--vestara-surface-interactive)]' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        transition-colors duration-100
        ${className}
      `}
      onClick={onClick && !disabled ? onClick : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={disabled || undefined}
      aria-selected={selected || undefined}
      onKeyDown={
        onClick && !disabled
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {leading && <span className="shrink-0 text-[var(--vestara-text-muted)]">{leading}</span>}
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && <span className="shrink-0 text-[var(--vestara-text-muted)]">{trailing}</span>}
    </li>
  );
}

// ─── ListItemText Component ────────────────────────────────────

export function ListItemText({ primary, secondary, className = '' }: ListItemTextProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-sm font-medium text-[var(--vestara-text-primary)] truncate">{primary}</div>
      {secondary && <div className="text-xs text-[var(--vestara-text-muted)] truncate mt-0.5">{secondary}</div>}
    </div>
  );
}

// ─── ListItemAction Component ──────────────────────────────────

export function ListItemAction({ children, className = '' }: ListItemActionProps) {
  return <span className={`shrink-0 ${className}`}>{children}</span>;
}

// ─── ListDivider Component ─────────────────────────────────────

export function ListDivider({ className = '' }: ListDividerProps) {
  return (
    <li role="separator" className={`h-px bg-[var(--vestara-border-subtle)] my-1 ${className}`} aria-hidden="true" />
  );
}

// ─── ListHeader Component ──────────────────────────────────────

export function ListHeader({ children, className = '' }: ListHeaderProps) {
  return (
    <li
      className={`px-4 py-2 text-xs font-medium text-[var(--vestara-text-muted)] uppercase tracking-wider ${className}`}
    >
      {children}
    </li>
  );
}
