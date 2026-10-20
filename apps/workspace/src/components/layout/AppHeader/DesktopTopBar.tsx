/**
 * VES-UI-001 T1: DesktopTopBar — 32px global shell chrome.
 *
 * Promotes the v2 prototype `TopBar` (h-[32px], teal V lockup + live dot +
 * version pill, centered 200px Spotlight, clock/date, Wifi/Battery status,
 * compact avatar) into the governed Workspace UI:
 * - `<VestaraMark size={20} />` (theme-aware inline SVG, never `<img>`).
 * - Every visual value via `var(--vestara-*)` (NO-HARDCODE); geometry via
 *   `SIZING.topbar` / `--vestara-sizing-topbar-*` + Tailwind spacing scale.
 * - MUI v6 icons only (matches existing `AppHeader` imports), 12px glyphs
 *   via `SIZING.icon.xs` — no lucide, no literal `fontSize` numbers.
 * - Spotlight reuses `HeaderSearch density="compact"` (dispatches
 *   `open-command-palette`; bare `⌘K` is already handled globally by
 *   `CommandPalette`'s keydown listener).
 * - No version skew (G11): the pill renders only when `version` is passed
 *   in — `ShellLayout` passes the same literal as `AppSidebar`.
 *
 * Architecture Traceability:
 *   VES-UI-001 Phase 1 (T1.1 32px header + T1.5 global chrome swap)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §4
 */

import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import BatteryFullRoundedIcon from '@mui/icons-material/BatteryFullRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import WifiRoundedIcon from '@mui/icons-material/WifiRounded';
import { SIZING } from '@vestara/ui-tokens';
import { useEffect, useState } from 'react';
import { VestaraMark } from '../../branding/VestaraMark';
import { useAuth } from '../../../lib/auth';
import { useTheme } from '../../../lib/theme';
import HeaderConnection from './HeaderConnection';
import HeaderNotifications from './HeaderNotifications';
import HeaderSearch from './HeaderSearch';
import HeaderUserMenu from './HeaderUserMenu';

export interface DesktopTopBarProps {
  mobileSidebarOpen?: boolean;
  onMenuClick?: () => void;
  /** Version pill (e.g. `v1.0.0`). Omitted → no pill (G11: never hardcode). */
  version?: string;
}

export interface TopBarClock {
  /** `HH:MM` (24h, local). */
  head: string;
  /** `SS` — rendered in the accent color per the prototype. */
  seconds: string;
  /** `Oct 20` (pinned `en-US` formatting). */
  date: string;
}

/** Pure clock formatter — deterministic under test, locale-pinned output. */
export function formatTopBarClock(now: Date): TopBarClock {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    head: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    seconds: pad(now.getSeconds()),
    date: now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  };
}

/** Ticking clock — 1s interval, cleaned up on unmount. */
export function useTopBarClock(now = () => new Date()): TopBarClock {
  const [clock, setClock] = useState<TopBarClock>(() => formatTopBarClock(now()));
  useEffect(() => {
    const id = window.setInterval(() => setClock(formatTopBarClock(now())), 1000);
    return () => window.clearInterval(id);
  }, [now]);
  return clock;
}

export default function DesktopTopBar({ mobileSidebarOpen = false, onMenuClick, version }: DesktopTopBarProps) {
  const { actor } = useAuth();
  const { resolved, toggle } = useTheme();
  const clock = useTopBarClock();

  return (
    <header className="shell-topbar relative flex h-8 w-full shrink-0 items-center gap-2 border-b border-(--vestara-accent-border) bg-(--vestara-shell-bg) px-3">
      {/* Left: navigation toggle + brand lockup */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-controls="workspace-navigation"
          aria-expanded={mobileSidebarOpen}
          title={mobileSidebarOpen ? 'Close navigation' : 'Open navigation'}
          onClick={onMenuClick}
          className="flex h-6 w-6 items-center justify-center rounded-md text-(--vestara-text-2) transition hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vestara-border-focus) lg:hidden"
        >
          <MenuRounded sx={{ fontSize: SIZING.icon.xs }} />
        </button>
        <div className="flex min-w-0 items-center gap-2" aria-label="Vestara">
          <VestaraMark size={20} />
          <span className="hidden text-(--vestara-font-size-label) font-bold tracking-tight text-(--vestara-text-primary) min-[400px]:block">
            VESTARA
          </span>
          <span aria-hidden="true" className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-(--vestara-status-success)" />
          {version && (
            <span className="hidden shrink-0 rounded-full border border-(--vestara-accent-border) bg-(--vestara-surface) px-1.5 py-px font-mono text-(--vestara-font-size-micro) text-(--vestara-text-2) min-[480px]:block">
              {version}
            </span>
          )}
        </div>
      </div>

      {/* Center: Spotlight trigger (true-center via absolute positioning) */}
      <div className="pointer-events-none absolute inset-x-0 flex justify-center">
        <div className="pointer-events-auto">
          <HeaderSearch density="compact" />
        </div>
      </div>

      {/* Right: clock + status + session controls */}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <div
          role="status"
          aria-label={`Current time ${clock.head}:${clock.seconds}, ${clock.date}`}
          className="mr-1 hidden h-6 items-center gap-1.5 rounded-full border border-(--vestara-accent-border) bg-(--vestara-surface) px-2 sm:flex"
        >
          <span className="flex text-(--vestara-text-2)">
            <AccessTimeRoundedIcon sx={{ fontSize: SIZING.icon.xs }} />
          </span>
          <span className="font-mono text-(--vestara-font-size-caption) text-(--vestara-text-primary)">
            {clock.head}
            <span className="text-(--vestara-accent)">:{clock.seconds}</span>
          </span>
          <span className="text-(--vestara-font-size-micro) text-(--vestara-text-2)">{clock.date}</span>
        </div>

        <span
          role="img"
          aria-label="Network status"
          title="Network"
          className="hidden h-6 w-6 items-center justify-center rounded-md text-(--vestara-text-2) min-[560px]:flex"
        >
          <WifiRoundedIcon sx={{ fontSize: SIZING.icon.xs }} />
        </span>
        <span
          role="img"
          aria-label="Power status"
          title="Power"
          className="hidden h-6 w-6 items-center justify-center rounded-md text-(--vestara-text-2) min-[560px]:flex"
        >
          <BatteryFullRoundedIcon sx={{ fontSize: SIZING.icon.xs }} />
        </span>

        <HeaderConnection density="compact" />
        <HeaderNotifications density="compact" />

        <button
          onClick={toggle}
          type="button"
          aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
          className="flex h-6 w-6 items-center justify-center rounded-md text-(--vestara-text-2) transition hover:bg-(--vestara-accent-bg) hover:text-(--vestara-text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--vestara-border-focus)"
        >
          {resolved === 'dark' ? (
            <LightModeRounded sx={{ fontSize: SIZING.icon.xs }} />
          ) : (
            <DarkModeRounded sx={{ fontSize: SIZING.icon.xs }} />
          )}
        </button>

        <HeaderUserMenu name={actor} density="compact" />
      </div>
    </header>
  );
}
