import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';
import { SIZING } from '@vestara/ui-tokens';

export interface HeaderConnectionProps {
  status?: 'connected' | 'connecting' | 'disconnected';
  /**
   * Density for the 32px desktop top bar (`compact`) vs the legacy
   * 64px shell header (`cozy`, default). Compact renders an icon-only
   * 24px indicator with an accessible label; cozy keeps the labeled
   * Workspace status card untouched.
   */
  density?: 'cozy' | 'compact';
}

export default function HeaderConnection({ status = 'connected', density = 'cozy' }: HeaderConnectionProps) {
  const config = {
    connected: {
      Icon: CloudDoneRoundedIcon,
      spin: false,
      label: 'Connected',
      color: 'text-(--vestara-status-success)',
      bg: 'bg-(--vestara-status-success-bg)',
    },
    connecting: {
      Icon: AutorenewRoundedIcon,
      spin: true,
      label: 'Connecting',
      color: 'text-(--vestara-status-warning)',
      bg: 'bg-(--vestara-status-warning-bg)',
    },
    disconnected: {
      Icon: CloudOffRoundedIcon,
      spin: false,
      label: 'Offline',
      color: 'text-(--vestara-status-error)',
      bg: 'bg-(--vestara-status-error-bg)',
    },
  }[status];

  const { Icon, spin } = config;

  if (density === 'compact') {
    return (
      <div
        role="status"
        aria-label={`Workspace connection: ${config.label}`}
        title={`Workspace: ${config.label}`}
        className={`flex h-6 w-6 items-center justify-center rounded-md border border-(--vestara-accent-border) ${config.bg}`}
      >
        <span className={`flex ${config.color}`}>
          <Icon sx={{ fontSize: SIZING.icon.xs }} className={spin ? 'animate-spin' : undefined} />
        </span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={`Workspace connection: ${config.label}`}
      className={`hidden lg:flex items-center gap-2 px-3 h-9 rounded-xl border border-(--vestara-accent-border) ${config.bg}`}>
      <div className={config.color}>
        <Icon fontSize="small" className={spin ? 'animate-spin' : undefined} />
      </div>

      <div className="text-xs">
        <div className="text-(--vestara-text-2)">Workspace</div>
        <div className={`font-medium ${config.color}`}>{config.label}</div>
      </div>
    </div>
  );
}
