import type { FC } from 'react';

import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';

export interface SidebarWorkspaceProps {
  workspace: string;
  repository?: string;
  onClick?: () => void;
}

const SidebarWorkspace: FC<SidebarWorkspaceProps> = ({ workspace, repository, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="
        mx-3
        mb-4
        flex
        w-auto
        items-center
        gap-3
        rounded-2xl
        border
        border-zinc-800
        bg-zinc-900/70
        p-4
        text-left
        transition-all
        hover:border-zinc-700
        hover:bg-zinc-900
        cursor-pointer
      "
    >
      <div
        className="
          flex
          h-11
          w-11
          items-center
          justify-center
          rounded-xl
          bg-zinc-800
          text-zinc-300
        "
      >
        <FolderRounded />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600">Workspace</div>

        <div className="truncate text-sm font-semibold text-zinc-100">{workspace}</div>

        {repository && <div className="truncate text-xs text-zinc-500">{repository}</div>}
      </div>

      <KeyboardArrowDownRounded className="text-zinc-500" />
    </button>
  );
};

export default SidebarWorkspace;
