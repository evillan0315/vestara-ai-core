import SearchRounded from '@mui/icons-material/SearchRounded';
import type { FC } from 'react';

const HeaderSearch: FC = () => {
  return (
    <div className="mx-10 hidden max-w-xl flex-1 lg:block">
      <button
        className="
            flex
            h-11
            w-full
            items-center
            gap-3
            rounded-xl
            border
   border-(--vestara-accent-border) 
            bg-primary-900/60
            px-4
            text-left
            transition
            hover:border-(--vestara-accent-border)
            hover:bg-(--vestara-accent-bg)
          "
      >
        <SearchRounded fontSize="small" className="text-zinc-400" />

        <span className="flex-1 text-sm text-zinc-500">Search projects, agents, sessions...</span>

        <kbd className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500">⌘K</kbd>
      </button>
    </div>
  );
};

export default HeaderSearch;
