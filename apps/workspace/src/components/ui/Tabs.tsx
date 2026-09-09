/**
 * Tabs — accessible tab navigation with keyboard support.
 *
 * Follows WAI-ARIA Tabs pattern: role="tablist", role="tab", role="tabpanel",
 * arrow-key navigation between tabs, Home/End to jump to first/last tab.
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface Tab {
  id: string;
  label: string;
  /** Optional short label for narrow viewports. */
  shortLabel?: string;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
  /** className applied to the tab list container. */
  className?: string;
  /** className applied to each tab button. */
  tabClassName?: string;
  /** className applied to the active tab button. */
  activeTabClassName?: string;
}

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  className = '',
  tabClassName = '',
  activeTabClassName = '',
}: TabsProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const focusTab = useCallback(
    (tabId: string) => {
      tabRefs.current.get(tabId)?.focus();
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      if (currentIndex === -1) return;

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = (currentIndex + 1) % tabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== null) {
        const nextTab = tabs[nextIndex];
        onTabChange(nextTab.id);
        focusTab(nextTab.id);
      }
    },
    [tabs, activeTab, onTabChange, focusTab],
  );

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-0 border-b border-(--vestara-accent-border) overflow-x-auto scrollbar-none"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors cursor-pointer
                border-b-2 -mb-px
                ${
                  isActive
                    ? `border-(--vestara-accent-text) text-(--vestara-accent-text) ${activeTabClassName}`
                    : `border-transparent text-(--vestara-text-muted) hover:text-(--vestara-text-2) ${tabClassName}`
                }`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="focus:outline-none"
      >
        {children}
      </div>
    </div>
  );
}

export default Tabs;
