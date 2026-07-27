import type { FC } from 'react';

import PersonRounded from '@mui/icons-material/PersonRounded';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';

export interface SidebarUserProps {
  name: string;
  role: string;
  avatar?: string;
  onClick?: () => void;
}

const SidebarUser: FC<SidebarUserProps> = ({ name, role, avatar, onClick }) => {
  return (
    <button
      onClick={onClick}
      className="
        mx-3
        flex
        w-auto
        items-center
        gap-3
        rounded-2xl
        border
        border-zinc-800
        bg-zinc-900/60
        p-3
        transition-all
        hover:border-zinc-700
        hover:bg-zinc-900
        cursor-pointer
      "
    >
      {avatar ? (
        <img src={avatar} alt={name} className="h-11 w-11 rounded-xl object-cover" />
      ) : (
        <div
          className="
            flex
            h-11
            w-11
            items-center
            justify-center
            rounded-xl
            bg-zinc-800
          "
        >
          <PersonRounded className="text-zinc-300" />
        </div>
      )}

      <div className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm font-semibold text-zinc-100">{name}</div>

        <div className="truncate text-xs text-zinc-500">{role}</div>
      </div>

      <MoreHorizRounded className="text-zinc-600" />
    </button>
  );
};

export default SidebarUser;
