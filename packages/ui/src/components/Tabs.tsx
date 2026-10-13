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
 *   UI-COMP-001 Phase 2 \u00a7C \u2192 Phase 7A Slice 1
 */

import type { ReactNode } from 'react';
import { useCallback, useId, useRef } from 'react';

// \u2503 Types \u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503

export interface Tab {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: ReactNode;
  title?: string;
  borderBottom?: boolean;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: readonly Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  children?: ReactNode;
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  ariaLabel?: string;
  orientation?: 'horizontal' | 'vertical';
  border?: 'none' | 'accent';
  tablistClassName?: string;
}

// \u2503 Component \u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503\u2503

export function Tabs({
  tabs,
  activeTab,
  onTabChange,
  children,
  className = '',
  tabClassName = '',
  activeTabClassName = '',
  ariaLabel,
  orientation = 'horizontal',
  border = 'none',
  tablistClassName = '',
}: TabsProps) {
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const uid = useId().replace(/:/g, '');
  const isVertical = orientation === 'vertical';

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
          if (isVertical) return;
          e.preventDefault();
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % enabledTabs.length;
          break;
        case 'ArrowDown':
          if (!isVertical) return;
          e.preventDefault();
          nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % enabledTabs.length;
          break;
        case 'ArrowLeft':
          if (isVertical) return;
          e.preventDefault();
          nextIndex =
            currentIndex === -1 ? enabledTabs.length - 1 : (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
          break;
        case 'ArrowUp':
          if (!isVertical) return;
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
    [tabs, activeTab, onTabChange, focusTab, isVertical],
  );

  const verticalTablist = 'flex flex-col items-stretch gap-1 bg-(--vestara-surface-canvas) ' + tablistClassName;
  const horizontalTablist =
    'flex gap-0 overflow-x-auto scrollbar-none bg-(--vestara-surface-canvas) ' + tablistClassName;

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation={orientation}
        className={isVertical ? verticalTablist : horizontalTablist}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isDisabled = tab.disabled === true;
          const hasEdge = tab.borderBottom !== false;
          const edgeWidth = hasEdge
            ? isVertical
              ? 'border-l-2 -ml-px'
              : 'border-b-2 -mb-px'
            : isVertical
              ? 'border-l-0'
              : 'border-b-0';
          const showAccentBorder = border === 'accent' && hasEdge && isActive;

          let buttonClass = '';
          if (isVertical) {
            buttonClass = 'w-full';
          } else {
            buttonClass = 'flex-shrink-0';
          }
          buttonClass +=
            ' vestara-tab inline-flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors cursor-pointer ';
          buttonClass += edgeWidth + ' ';

          if (isActive) {
            if (showAccentBorder) {
              buttonClass += 'border-(--vestara-accent-text) text-(--vestara-accent-text) ';
            } else {
              buttonClass += 'text-(--vestara-accent-text) ' + activeTabClassName + ' ';
            }
          } else {
            buttonClass +=
              'border-transparent text-(--vestara-text-muted) hover:text-(--vestara-text-2) ' + tabClassName + ' ';
          }
          buttonClass += 'disabled:cursor-not-allowed disabled:opacity-45';

          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              id={'tab-' + uid + '-' + tab.id}
              aria-selected={isActive}
              aria-disabled={isDisabled || undefined}
              aria-controls={'tabpanel-' + uid + '-' + tab.id}
              tabIndex={isActive && !isDisabled ? 0 : -1}
              type="button"
              title={tab.title}
              disabled={isDisabled}
              onClick={() => onTabChange(tab.id)}
              className={buttonClass.trim()}
            >
              {tab.icon && (
                <span aria-hidden="true" className="[&_svg]:size-4">
                  {tab.icon}
                </span>
              )}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel ?? tab.label}</span>
            </button>
          );
        })}
      </div>
      {children !== undefined && (
        <div
          role="tabpanel"
          id={'tabpanel-' + uid + '-' + activeTab}
          aria-labelledby={'tab-' + uid + '-' + activeTab}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: WAI-ARIA tabpanel pattern — the panel is focus-labelled by its tab
          tabIndex={0}
          className="focus:outline-none"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default Tabs;
