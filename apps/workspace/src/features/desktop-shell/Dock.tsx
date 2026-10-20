/**
 * VES-UI-001 T2: Dock
 *
 * Centered 48px application dock promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/components/Dock.tsx`).
 * Eight package slots with open (accent dot) / minimized (warning dot)
 * indicators, plus the theme-aware `VestaraMark` cap (never `<img src>`).
 *
 * Slot order comes from `desktopShellDockOrderFixture`; titles from
 * `desktopShellPackageTitles` — never hardcoded arrays in JSX.
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T2 Dock)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §4
 */

import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import { VestaraMark } from '../../components/branding/VestaraMark';
import type { WinData, WinType } from './types';
import { desktopShellDockOrderFixture, desktopShellPackageTitles } from './desktop-shell.fixtures';
import './desktop-shell.tokens.css';

export interface DockProps {
  readonly windows: readonly WinData[];
  readonly onOpen: (type: WinType) => void;
  readonly onRestore: (id: string) => void;
}

const DOCK_ICONS: Record<WinType, typeof DashboardRoundedIcon> = {
  overview: DashboardRoundedIcon,
  terminal: TerminalOutlinedIcon,
  activity: ForumRoundedIcon,
  marketplace: StorefrontRoundedIcon,
  agent: SmartToyOutlinedIcon,
  diagnostic: ScienceOutlinedIcon,
  settings: SettingsOutlinedIcon,
  files: FolderOpenOutlinedIcon,
  workspace: DesktopWindowsOutlinedIcon,
};

export function Dock({ windows, onOpen, onRestore }: DockProps) {
  return (
    <div
      role="toolbar"
      aria-label="Application dock"
      className="absolute bottom-[var(--vestara-spacing-3)] left-1/2 z-30 flex h-[var(--ds-dock-height)] -translate-x-1/2 items-center gap-[var(--vestara-spacing-1)] rounded-[var(--vestara-radius-lg)] border border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-2)] shadow-[var(--ds-window-shadow)]"
    >
      <div className="flex items-center gap-[var(--vestara-spacing-1)]">
        {desktopShellDockOrderFixture.map((type) => {
          const Icon = DOCK_ICONS[type];
          const isOpen = windows.some((win) => win.type === type && !win.minimized);
          const minimizedWin = windows.find((win) => win.type === type && win.minimized);
          const stateLabel = isOpen ? 'open' : minimizedWin ? 'minimized' : 'closed';
          return (
            <button
              key={type}
              type="button"
              onClick={() => {
                if (minimizedWin) onRestore(minimizedWin.id);
                else onOpen(type);
              }}
              aria-label={`${desktopShellPackageTitles[type]} (${stateLabel})`}
              aria-pressed={isOpen || Boolean(minimizedWin)}
              title={desktopShellPackageTitles[type]}
              className={`relative flex h-8 w-8 items-center justify-center rounded-[var(--vestara-radius-md)] border transition ${
                isOpen
                  ? 'border-[var(--ds-border-strong)] bg-[var(--ds-surface-raised)] text-[var(--ds-accent)]'
                  : 'border-transparent bg-transparent text-[var(--ds-text-secondary)] hover:border-[var(--ds-border)] hover:bg-[var(--ds-surface-bg)] hover:text-[var(--ds-text)]'
              }`}
            >
              <Icon fontSize="small" aria-hidden="true" />
              {(isOpen || minimizedWin) && (
                <span
                  aria-hidden="true"
                  data-testid={`dock-indicator-${type}`}
                  data-state={minimizedWin && !isOpen ? 'minimized' : 'open'}
                  className={`absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    minimizedWin && !isOpen ? 'bg-[var(--ds-warning)]' : 'bg-[var(--ds-accent)]'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
      <div aria-hidden="true" className="mx-[var(--vestara-spacing-1)] h-6 w-px bg-[var(--ds-border)]" />
      <div
        aria-hidden="true"
        className="flex h-6 w-6 items-center justify-center rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)]"
      >
        <VestaraMark size={14} />
      </div>
    </div>
  );
}
