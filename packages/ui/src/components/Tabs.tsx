/**
 * VES-UI: Tabs Component (UI-COMP-001 Phase 7A canonical primitive)
 *
 * Promoted from apps/workspace/src/components/ui/Tabs.tsx with two
 * canonicalization gaps closed: disabled-tab support and instance-scoped
 * tab/tabpanel IDs (the application copy used global `tab-{id}` IDs).
 *
 * Presentation-only, domain-independent: keyboard behavior, ARIA wiring,
 * and token-only styling. No routing, no domain models, no runtime clients.
 *
 * Architecture Traceability:
 *   UI-COMP-001 Phase 2 §C → Phase 7A Slice 1
 */

import type { ReactNode } from 'react';
import { useCallback, useId, useRef } from 'react';

// ─── Types ─────────────────────────────────────────────────────

export interface Tab {
  id: string;
  label: string;
  /** Optional short label for narrow viewports. */
  shortLabel?: string;
  /** Disabled tabs are skipped by keyboard navigation and not selectable. */
  disabled?: boolean;
}

export interface TabsProps {
  tabs: readonly Tab[];
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

// ─── Component ─────────────────────────────────────────────────

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
  const uid = useId().replace(/:/g, '');

  const focusTab = useCallback((tabId: string) => {
    tabRefs.current.get(tabId)?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const enabledTabs = tabs.filter((t) => !t.disabled);
      if (enabledTabs.length === 0) return;
      const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab);

      let nextIndex: number | null = null;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % enabledTabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          nextIndex =
            currentIndex === -1 ? enabledTabs.length - 1 : (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = enabledTabs.length - 1;
          break;
        default:
          return;
      }

      if (nextIndex !== null) {
        const nextTab = enabledTabs[nextIndex];
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
          const isDisabled = tab.disabled === true;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              id={`tab-${uid}-${tab.id}`}
              aria-selected={isActive}
              aria-disabled={isDisabled || undefined}
              aria-controls={`tabpanel-${uid}-${tab.id}`}
              tabIndex={isActive && !isDisabled ? 0 : -1}
              type="button"
              disabled={isDisabled}
              onClick={() => onTabChange(tab.id)}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium transition-colors cursor-pointer
                border-b-2 -mb-px
                ${
                  isActive
                    ? `border-(--vestara-accent-text) text-(--vestara-accent-text) ${activeTabClassName}`
                    : `border-transparent text-(--vestara-text-muted) hover:text-(--vestara-text-2) ${tabClassName}`
                } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`tabpanel-${uid}-${activeTab}`}
        aria-labelledby={`tab-${uid}-${activeTab}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: tabpanel keeps tabIndex=0 for keyboard scroll parity with the promoted application copy (WAI-ARIA tabpanel focus when content overflows).
        tabIndex={0}
        className="focus:outline-none"
      >
        {children}
      </div>
    </div>
  );
}

export default Tabs;
