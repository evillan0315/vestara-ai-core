import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import { useTheme } from '../../../lib/theme';

export interface HeaderUserMenuProps {
  name: string;
  role?: string;
}

export default function HeaderUserMenu({ name, role = 'Administrator' }: HeaderUserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 px-2 h-10 rounded-xl border border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer"
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-(--vestara-accent) to-(--vestara-accent-dark) text-white">
          <span className="text-xs font-bold">{name.charAt(0).toUpperCase()}</span>
        </div>
        <div className="hidden md:block text-left">
          <div className="text-sm font-medium text-(--vestara-text)">{name}</div>
          <div className="text-xs text-(--vestara-text-2)">{role}</div>
        </div>
        <KeyboardArrowDownRoundedIcon fontSize="small" className={`text-(--vestara-text-2) transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-zinc-900 border border-(--vestara-accent-border) rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
            {/* User info header */}
            <div className="px-4 py-3 border-b border-(--vestara-accent-border)">
              <div className="text-sm font-medium text-(--vestara-text) truncate">{name}</div>
              <div className="text-[10px] text-(--vestara-text-2)">{role}</div>
            </div>

            {/* Menu items */}
            <button onClick={() => { setOpen(false); navigate('/settings/account'); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer">
              <PersonRoundedIcon fontSize="small" className="text-(--vestara-text-muted)" />
              Profile
            </button>
            <button onClick={() => { setOpen(false); navigate('/settings'); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer">
              <SettingsRoundedIcon fontSize="small" className="text-(--vestara-text-muted)" />
              Settings
            </button>

            {/* Theme toggle */}
            <button onClick={() => { toggle(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] text-(--vestara-text-2) hover:text-(--vestara-text) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer">
              {resolved === 'dark' ? <LightModeRoundedIcon fontSize="small" className="text-(--vestara-text-muted)" /> : <DarkModeRoundedIcon fontSize="small" className="text-(--vestara-text-muted)" />}
              {resolved === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>

            <div className="border-t border-(--vestara-accent-border) mt-1 pt-1">
              <button onClick={() => { setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] text-red-400 hover:text-red-300 hover:bg-red-400/5 transition-colors cursor-pointer">
                <LogoutRoundedIcon fontSize="small" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
