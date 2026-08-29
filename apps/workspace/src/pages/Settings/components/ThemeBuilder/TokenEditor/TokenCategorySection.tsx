import { useState, useMemo } from 'react';
import type { TokenCategory, SemanticToken } from '../../../../../lib/theme';
import { TokenRow } from './TokenRow';
import { surface, focus } from '../../../settings-ui';

interface TokenCategorySectionProps {
  category: TokenCategory;
  label: string;
  tokens: readonly SemanticToken[];
}

export function TokenCategorySection({ category, label, tokens }: TokenCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const tokenRows = useMemo(() => {
    return tokens.map((token) => (
      <TokenRow key={token.cssVar} token={token} />
    ));
  }, [tokens]);

  return (
    <section
      className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] first:border-t-0"
      role="listitem"
      aria-labelledby={`category-${category}-header`}
    >
      <header
        id={`category-${category}-header`}
        className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={`category-${category}-content`}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`size-4 transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="m7 4 6 6-6 6" />
          </svg>
          <span className="text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] truncate">
            {label}
          </span>
          <span
            className="size-5 shrink-0 flex items-center justify-center rounded-[var(--vestara-radius-full)] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] text-[var(--vestara-font-size-xs)] font-mono text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]"
            aria-label={`${tokens.length} tokens`}
          >
            {tokens.length}
          </span>
        </div>
      </header>
      <div
        id={`category-${category}-content`}
        role="region"
        aria-label={`${label} tokens`}
        hidden={!isOpen}
        className="overflow-hidden transition-all motion-reduce:transition-none"
      >
        <div className="px-4 pb-4 sm:px-5" role="list" aria-label={`${label} token list`}>
          {tokenRows}
        </div>
      </div>
    </section>
  );
}