/**
 * MultiSelect — searchable autocomplete multi-value selection.
 *
 * Renders selected values as removable token chips.
 * Supports keyboard navigation, search filtering, and outside-click close.
 * Compose inside FormField for label/help/error.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inputClass } from '../agents/formClasses';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  error?: boolean;
  className?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  disabled = false,
  error = false,
  className = '',
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return options.filter(
      (opt) => !selectedSet.has(opt.value) && (q === '' || opt.label.toLowerCase().includes(q)),
    );
  }, [options, selectedSet, search]);

  const activeOption = activeIndex >= 0 ? filtered[activeIndex] : null;

  // Focus search input when opened
  useEffect(() => {
    if (open) {
      queueMicrotask(() => searchRef.current?.focus());
    }
  }, [open]);

  // Outside-click close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectOption = useCallback(
    (opt: MultiSelectOption) => {
      if (!selectedSet.has(opt.value)) {
        onChange([...value, opt.value]);
      }
      setSearch('');
      setActiveIndex(-1);
      searchRef.current?.focus();
    },
    [value, selectedSet, onChange],
  );

  const removeValue = useCallback(
    (val: string) => {
      onChange(value.filter((v) => v !== val));
    },
    [value, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % Math.max(filtered.length, 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + filtered.length) % Math.max(filtered.length, 1));
          break;
        case 'Enter':
          e.preventDefault();
          if (activeOption) selectOption(activeOption);
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          setSearch('');
          setActiveIndex(-1);
          break;
        case 'Backspace':
          if (search === '' && value.length > 0) {
            removeValue(value[value.length - 1]);
          }
          break;
        default:
          break;
      }
    },
    [open, filtered, activeOption, selectOption, removeValue, search, value],
  );

  // Scroll active option into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger / selected tokens */}
      <div
        role="listbox"
        aria-label={placeholder}
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setOpen(!open);
        }}
        onKeyDown={handleKeyDown}
        className={`min-h-[32px] w-full flex flex-wrap items-center gap-1 bg-(--vestara-accent-bg) border rounded-lg px-2 py-1 cursor-pointer outline-none transition-colors ${
          error ? 'border-red-400' : 'border-(--vestara-accent-border) focus:border-(--vestara-accent-border-active)'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {value.length === 0 && (
          <span className="text-xs text-(--vestara-text-dim)">{placeholder}</span>
        )}
        {value.map((val) => {
          const opt = options.find((o) => o.value === val);
          return (
            <span
              key={val}
              role="option"
              aria-selected="true"
              className="inline-flex items-center gap-1 rounded border border-(--vestara-accent-border) bg-(--vestara-accent-bg) px-1.5 py-0.5 text-[10px] text-(--vestara-text-2)"
            >
              {opt?.label ?? val}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeValue(val);
                  }}
                  className="text-(--vestara-text-muted) hover:text-(--vestara-text) cursor-pointer"
                  aria-label={`Remove ${opt?.label ?? val}`}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-zinc-900 border border-(--vestara-accent-border) rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-(--vestara-accent-border)">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActiveIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className={inputClass}
            />
          </div>
          <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-(--vestara-text-muted)">
                {search ? 'No matches' : 'All selected'}
              </div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onClick={() => selectOption(opt)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                    i === activeIndex
                      ? 'bg-(--vestara-accent-bg) text-(--vestara-text)'
                      : 'text-(--vestara-text-2) hover:bg-(--vestara-accent-bg)'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MultiSelect;
