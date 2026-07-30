import { useEffect, useRef } from 'react';

interface ChatSearchProps {
  value: string;
  onChange: (value: string) => void;
  matchCount: number | null;
  onClose: () => void;
}

export function ChatSearch({ value, onChange, matchCount, onClose }: ChatSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="px-3 py-2">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-(--vestara-text-muted)"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg pl-8 pr-8 py-1.5 text-[12px] text-(--vestara-text) placeholder-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active) transition-colors"
        />
        {value.trim() && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {matchCount !== null && <span className="text-[10px] text-(--vestara-text-muted)">{matchCount} matches</span>}
            <button
              onClick={() => {
                onChange('');
                onClose();
              }}
              className="text-(--vestara-text-muted) hover:text-(--vestara-text) transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
