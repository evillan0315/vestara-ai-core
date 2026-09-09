/**
 * DrawerMenu — compact vertical ⋮ menu for drawer header.
 *
 * Renders a three-dot button that opens a dropdown menu.
 * Used for drawer presentation controls (size selection, etc.).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DrawerMenuAction {
  id: string;
  label: string;
  checked?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

export interface DrawerMenuProps {
  actions: DrawerMenuAction[];
  onSelect: (id: string) => void;
  disabled?: boolean;
  className?: string;
}

export function DrawerMenu({ actions, onSelect, disabled = false, className = '' }: DrawerMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleActions = actions.filter((a) => !a.divider);

  // Outside-click close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus first item on open
  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % visibleActions.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + visibleActions.length) % visibleActions.length);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (activeIndex >= 0 && visibleActions[activeIndex]) {
            onSelect(visibleActions[activeIndex].id);
            setOpen(false);
            setActiveIndex(-1);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          break;
        default:
          break;
      }
    },
    [open, activeIndex, visibleActions, onSelect],
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-label="Drawer options"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-(--vestara-text-muted) transition-colors hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Drawer options"
          className="absolute right-0 top-full mt-1 z-50 min-w-[140px] bg-zinc-900 border border-(--vestara-accent-border) rounded-lg shadow-lg overflow-hidden py-1"
        >
          {actions.map((action, i) => {
            if (action.divider) {
              return <div key={`divider-${i}`} className="my-1 border-t border-(--vestara-accent-border)" />;
            }
            const visibleIdx = visibleActions.indexOf(action);
            return (
              <button
                key={action.id}
                type="button"
                role="menuitem"
                aria-checked={action.checked}
                disabled={action.disabled}
                onClick={() => {
                  onSelect(action.id);
                  setOpen(false);
                  setActiveIndex(-1);
                }}
                onMouseEnter={() => setActiveIndex(visibleIdx)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                  visibleIdx === activeIndex
                    ? 'bg-(--vestara-accent-bg) text-(--vestara-text)'
                    : 'text-(--vestara-text-2) hover:bg-(--vestara-accent-bg)'
                } ${action.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <span className="w-3 text-center">
                  {action.checked && (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                  )}
                </span>
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DrawerMenu;
