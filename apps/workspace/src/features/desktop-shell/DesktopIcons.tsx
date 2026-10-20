/**
 * VES-UI-001 T2: Desktop Icons
 *
 * Desktop launcher icons promoted from the v2 prototype
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/components/DesktopIcons.tsx`).
 * Double-click or Enter/Space opens the package; single click only selects.
 *
 * Icon set comes from `desktopShellDesktopIconsFixture` — never hardcoded
 * arrays in JSX. Visual roles bind to the scoped `--ds-*` layer.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T2 DesktopIcons)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §4
 */

import { useState } from 'react';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded';
import TerminalOutlinedIcon from '@mui/icons-material/TerminalOutlined';
import type { WinType } from './types';
import { desktopShellDesktopIconsFixture } from './desktop-shell.fixtures';
import './desktop-shell.tokens.css';

export interface DesktopIconsProps {
  readonly onOpen: (type: WinType) => void;
}

const DESKTOP_ICONS: Record<WinType, typeof DashboardRoundedIcon> = {
  overview: DashboardRoundedIcon,
  terminal: TerminalOutlinedIcon,
  activity: ForumRoundedIcon,
  marketplace: StorefrontRoundedIcon,
  files: FolderOpenOutlinedIcon,
  workspace: DesktopWindowsOutlinedIcon,
  settings: SettingsOutlinedIcon,
  agent: SmartToyOutlinedIcon,
  diagnostic: ScienceOutlinedIcon,
};

export function DesktopIcons({ onOpen }: DesktopIconsProps) {
  const [selected, setSelected] = useState<WinType | null>(null);

  return (
    <div
      aria-label="Desktop icons"
      className="absolute top-[calc(var(--ds-topbar-height)+var(--vestara-spacing-4))] left-[var(--vestara-spacing-3)] z-10 flex flex-col gap-[var(--vestara-spacing-3)]"
    >
      {desktopShellDesktopIconsFixture.map(({ type, label }) => {
        const Icon = DESKTOP_ICONS[type];
        const isSelected = selected === type;
        return (
          <button
            key={type}
            type="button"
            aria-label={`Open ${label}`}
            aria-pressed={isSelected}
            onClick={() => setSelected(type)}
            onDoubleClick={() => onOpen(type)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(type);
              }
            }}
            className="group flex w-[72px] flex-col items-center gap-[var(--vestara-spacing-1)]"
          >
            <span
              aria-hidden="true"
              className={`flex h-10 w-10 items-center justify-center rounded-[var(--vestara-radius-lg)] border backdrop-blur-sm transition ${
                isSelected
                  ? 'border-[var(--ds-border-strong)] bg-[var(--ds-surface-raised)] text-[var(--ds-text)]'
                  : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-secondary)] group-hover:border-[var(--ds-border-strong)] group-hover:bg-[var(--ds-surface-raised)] group-hover:text-[var(--ds-text)]'
              }`}
            >
              <Icon fontSize="small" />
            </span>
            <span className="text-center font-mono text-[length:var(--vestara-font-size-xs)] leading-tight text-[var(--ds-text-secondary)] group-hover:text-[var(--ds-text)]">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
