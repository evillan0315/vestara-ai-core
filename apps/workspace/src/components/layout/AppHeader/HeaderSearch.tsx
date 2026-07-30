import SearchRounded from '@mui/icons-material/SearchRounded';
import type { FC } from 'react';

const HeaderSearch: FC = () => {
  const openSearch = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  return (
    <div className="mx-10 hidden max-w-xl flex-1 lg:block">
      <button onClick={openSearch}
        className="flex h-11 w-full items-center gap-3 rounded-xl border border-(--vestara-accent-border) bg-primary-900/60 px-4 text-left transition hover:border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg)">
        <SearchRounded fontSize="small" className="text-(--vestara-text-2)" />
        <span className="flex-1 text-sm text-(--vestara-text-2)">Search pages, agents, projects...</span>
        <kbd className="rounded border border-(--vestara-accent-border) px-2 py-0.5 text-[10px] text-(--vestara-text-2)">⌘K</kbd>
      </button>
    </div>
  );
};

export default HeaderSearch;
