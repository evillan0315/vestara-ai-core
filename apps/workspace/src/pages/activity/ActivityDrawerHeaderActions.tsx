import EastOutlinedIcon from '@mui/icons-material/EastOutlined';
import NorthOutlinedIcon from '@mui/icons-material/NorthOutlined';
import SouthOutlinedIcon from '@mui/icons-material/SouthOutlined';
import WestOutlinedIcon from '@mui/icons-material/WestOutlined';
import { ActionIcon } from '@vestara/ui';
import { SIZING } from '@vestara/ui-tokens';
import type { ReactNode } from 'react';
import type { DrawerPosition } from '../../components/ui/Drawer';

const POSITION_CONFIG: Record<
  DrawerPosition,
  {
    readonly label: string;
    readonly icon: ReactNode;
  }
> = {
  left: {
    label: 'Dock to left',
    icon: <WestOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />,
  },
  right: {
    label: 'Dock to right',
    icon: <EastOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />,
  },
  bottom: {
    label: 'Dock to bottom',
    icon: <SouthOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />,
  },
  top: {
    label: 'Dock to top',
    icon: <NorthOutlinedIcon sx={{ fontSize: SIZING.icon.sm }} />,
  },
};

export function ActivityDrawerDockControls({
  current,
  positions,
  onDock,
  label = 'Drawer position',
}: {
  readonly current: DrawerPosition;
  readonly positions: readonly DrawerPosition[];
  onDock: (position: DrawerPosition) => void;
  readonly label?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      {positions.map((position) => {
        const config = POSITION_CONFIG[position];
        const active = current === position;
        return (
          <ActionIcon
            key={position}
            label={config.label}
            tooltip={active ? `${config.label} (current)` : config.label}
            icon={config.icon}
            tone={active ? 'accent' : 'muted'}
            size="sm"
            aria-pressed={active}
            disabled={active}
            onClick={() => onDock(position)}
          />
        );
      })}
    </div>
  );
}

export function ActivityDrawerHeaderActions({
  dockControls,
  children,
  label,
}: {
  readonly dockControls?: ReactNode;
  readonly children?: ReactNode;
  readonly label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      {dockControls}
      {dockControls && children && <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-[var(--vestara-border-subtle)]" />}
      {children}
    </div>
  );
}
