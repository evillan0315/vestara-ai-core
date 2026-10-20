import SearchRounded from '@mui/icons-material/SearchRounded';
import type { FC } from 'react';

export interface HeaderSearchProps {
  /**
   * Density for the 32px desktop top bar (`compact`) vs the legacy
   * 64px shell header (`cozy`, default). Compact renders the
   * prototype 200px Spotlight pill (h-6); cozy keeps the full-width
   * search button (h-11) untouched.
   */
  density?: 'cozy' | 'compact';
}

const HeaderSearch: FC<HeaderSearchProps> = ({ density = 'cozy' }) => {
  const openSearch = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  if (density === 'compact') {
    return (
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search pages, agents, and projects"
        className="hidden h-6 w-[var(--vestara-sizing-topbar-spotlight-width)] items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-surface) px-3 text-left transition hover:border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vestara-border-focus) md:flex"
      >
        <span className="flex text-(--vestara-font-size-caption) text-(--vestara-text-2)">
          <SearchRounded fontSize="inherit" />
        </span>
        <span className="font-mono text-(--vestara-font-size-caption) text-(--vestara-text-2)">Spotlight</span>
        <kbd className="ml-auto rounded border border-(--vestara-accent-border) px-1 font-mono text-(--vestara-font-size-micro) text-(--vestara-text-2)">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <div className="flex max-w-xl flex-1 justify-end lg:block">
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search pages, agents, and projects"
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-(--vestara-accent-border) bg-(--vestara-surface) px-4 text-left transition hover:border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vestara-border-focus) lg:w-full">
        <SearchRounded fontSize="small" className="text-(--vestara-text-2)" />
        <span className="hidden flex-1 text-sm text-(--vestara-text-2) lg:block">Search pages, agents, projects...</span>
        <kbd className="hidden rounded border border-(--vestara-accent-border) px-2 py-0.5 text-[10px] text-(--vestara-text-2) lg:block">⌘K</kbd>
      </button>
    </div>
  );
};

export default HeaderSearch;
