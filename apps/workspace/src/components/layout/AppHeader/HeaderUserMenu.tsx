import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';

export interface HeaderUserMenuProps {
  name: string;
  role?: string;
}

export default function HeaderUserMenu({ name, role = 'Administrator' }: HeaderUserMenuProps) {
  return (
    <button className="flex items-center gap-3 px-2 h-10 rounded-xl border border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) transition- colors">
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full  text-(--vestara-bg)"
        style={{
          background:
            'linear-gradient(135deg, var(--vestara-primary-hover), var(--bg-primary), var(--vestara-primary-muted))',
        }}
      >
        <AccountCircleRoundedIcon fontSize="small" />
      </div>

      <div className="hidden md:block text-left">
        <div className="text-sm font-medium text-zinc-100">{name}</div>

        <div className="text-xs text-zinc-500">{role}</div>
      </div>

      <KeyboardArrowDownRoundedIcon fontSize="small" className="text-zinc-500" />
    </button>
  );
}
