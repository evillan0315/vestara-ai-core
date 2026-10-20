import { Tabs, type Tab } from '@vestara/ui';
import type { ReactNode } from 'react';
import '../../pages/Settings/settings.tokens.css';

export interface WorkspaceTab extends Tab {
  description?: string;
}

export interface WorkspaceTabsProps {
  tabs: readonly WorkspaceTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children?: ReactNode;
  ariaLabel: string;
  className?: string;
  /** Stretch tab items across the available row width when enabled (horizontal only). */
  stretch?: boolean;
  /** Layout axis. Vertical renders a full-width rail with left-aligned items. Default: 'horizontal'. */
  orientation?: 'horizontal' | 'vertical';
  /**
   * Visual treatment (horizontal only; vertical always renders pills).
   * `pill` is the bordered panel default; `underline` is borderless text
   * tabs with an accent bottom edge on the active tab.
   */
  variant?: 'pill' | 'underline';
}

const PILL_TAB =
  'min-h-10 min-w-28 justify-center whitespace-nowrap rounded-[var(--vestara-radius)] border-transparent text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text)]';
const PILL_TAB_ACTIVE =
  'border-[color-mix(in_srgb,var(--vestara-accent)_54%,var(--vestara-border-subtle))] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-accent-text)]';
const PILL_TAB_VERTICAL =
  'min-h-11 w-full justify-start whitespace-nowrap rounded-[var(--vestara-radius)] border-transparent px-[var(--vestara-spacing-section)] text-left text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text)]';
// Underline keeps the canonical Tabs chrome (edge border, roving tabindex)
// and only swaps the fill: no rounding, no box, accent bottom edge when active.
const UNDERLINE_TAB = 'min-h-10 justify-center whitespace-nowrap bg-transparent';
const UNDERLINE_TAB_ACTIVE = 'border-b-[var(--vestara-accent)] bg-transparent';

/**
 * Workspace-level tab shell shared by route navigation and local page
 * sections. The canonical @vestara/ui Tabs owns keyboard and ARIA behavior;
 * this adapter owns the workspace panel treatment and tab metadata shape.
 */
export function WorkspaceTabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  ariaLabel,
  className = '',
  stretch = false,
  orientation = 'horizontal',
  variant = 'pill',
}: WorkspaceTabsProps) {
  const isVertical = orientation === 'vertical';
  const underline = variant === 'underline' && !isVertical;
  const stretchClass = stretch && !isVertical ? 'flex-1' : '';

  return (
    <Tabs
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel={ariaLabel}
      orientation={orientation}
      className={
        underline
          ? `min-w-0 border-b border-[var(--vestara-border-subtle)] bg-transparent st-panel-scroll-x ${className}`
          : `st-panel min-w-0 border border-[var(--vestara-border-subtle)] ${isVertical ? 'p-[var(--vestara-spacing-element)]' : 'st-panel-scroll-x st-settings-nav st-gap-field'} ${className}`
      }
      tabClassName={
        underline
          ? UNDERLINE_TAB
          : isVertical
            ? PILL_TAB_VERTICAL
            : `st-gap-field st-px-card min-w-28 ${stretchClass} ${PILL_TAB}`
      }
      activeTabClassName={underline ? UNDERLINE_TAB_ACTIVE : PILL_TAB_ACTIVE}
    >
      {children}
    </Tabs>
  );
}
