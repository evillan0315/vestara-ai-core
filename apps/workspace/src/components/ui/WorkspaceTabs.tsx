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
}

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
}: WorkspaceTabsProps) {
  const isVertical = orientation === 'vertical';
  const stretchClass = stretch && !isVertical ? 'flex-1' : '';

  return (
    <Tabs
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={onTabChange}
      ariaLabel={ariaLabel}
      orientation={orientation}
      className={`st-panel min-w-0 border border-[var(--vestara-border-subtle)] ${isVertical ? 'p-[var(--vestara-spacing-element)]' : 'st-panel-scroll-x st-settings-nav st-gap-field'} ${className}`}
      tabClassName={
        isVertical
          ? 'min-h-11 w-full justify-start whitespace-nowrap rounded-[var(--vestara-radius)] border-transparent px-[var(--vestara-spacing-section)] text-left text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text)]'
          : `st-gap-field st-px-card min-h-10 min-w-28 ${stretchClass} justify-center whitespace-nowrap rounded-[var(--vestara-radius)] border-transparent text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text)]`
      }
      activeTabClassName={
        isVertical
          ? 'border-[color-mix(in_srgb,var(--vestara-accent)_54%,var(--vestara-border-subtle))] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-accent-text)]'
          : 'border-[color-mix(in_srgb,var(--vestara-accent)_54%,var(--vestara-border-subtle))] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-accent-text)]'
      }
    >
      {children}
    </Tabs>
  );
}
