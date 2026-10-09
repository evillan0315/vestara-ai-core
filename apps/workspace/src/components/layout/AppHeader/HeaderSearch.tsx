import SearchRounded from '@mui/icons-material/SearchRounded';
import type { FC } from 'react';

const HeaderSearch: FC = () => {
  const openSearch = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

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
