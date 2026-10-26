import { useEffect, useRef, useState } from 'react';
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
  /**
   * Density for the 36px desktop top bar (`compact`) vs the legacy
   * 64px shell header (`cozy`, default). Compact renders the prototype
   * avatar pill (h-6, 16px avatar, chevron only); the dropdown menu is
   * identical in both densities.
   */
  density?: 'cozy' | 'compact';
}

export default function HeaderUserMenu({ name, role = 'Administrator', density = 'cozy' }: HeaderUserMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { resolved, toggle } = useTheme();

  const compact = density === 'compact';

  // Close dropdown on outside click. A `fixed inset-0` scrim cannot be
  // used here: `.shell-topbar` sets `backdrop-filter`, which makes the
  // header the containing block for fixed descendants — the scrim would
  // only cover the 36px bar and canvas clicks would never dismiss the
  // menu. This matches the `HeaderNotifications` dismiss pattern.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        className={
          compact
            ? 'flex h-6 items-center gap-1 rounded-full border border-(--vestara-accent-border) bg-(--vestara-surface) py-0 pr-1.5 pl-1 transition-colors hover:border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vestara-border-focus)'
            : 'flex items-center gap-3 px-2 h-10 rounded-xl border border-(--vestara-accent-border) hover:bg-(--vestara-accent-bg) transition-colors cursor-pointer'
        }
      >
        <div
          className={
            compact
              ? 'flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-(--vestara-accent) to-(--vestara-accent-dark) text-white'
              : 'flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-(--vestara-accent) to-(--vestara-accent-dark) text-white'
          }
        >
          <span className={compact ? 'font-mono font-bold text-(--vestara-font-size-micro)' : 'text-xs font-bold'}>
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
        {!compact && (
          <div className="hidden md:block text-left">
            <div className="text-sm font-medium text-(--vestara-text)">{name}</div>
            <div className="text-xs text-(--vestara-text-2)">{role}</div>
          </div>
        )}
        <span className={compact ? 'flex text-(--vestara-font-size-caption) text-(--vestara-text-2)' : undefined}>
          <KeyboardArrowDownRoundedIcon
            fontSize={compact ? 'inherit' : 'small'}
            className={`text-(--vestara-text-2) transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-(--vestara-surface) border border-(--vestara-accent-border) rounded-xl shadow-2xl z-[var(--vestara-z-index-popover)] py-1 overflow-hidden">
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
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[11px] text-(--vestara-status-error) hover:bg-(--vestara-status-error-bg) transition-colors cursor-pointer">
                <LogoutRoundedIcon fontSize="small" />
                Sign Out
              </button>
            </div>
          </div>
      )}
    </div>
  );
}
