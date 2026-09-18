import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';

export interface HeaderConnectionProps {
  status?: 'connected' | 'connecting' | 'disconnected';
}

export default function HeaderConnection({ status = 'connected' }: HeaderConnectionProps) {
  const config = {
    connected: {
      icon: <CloudDoneRoundedIcon fontSize="small" />,
      label: 'Connected',
      color: 'text-(--vestara-status-success)',
      bg: 'bg-(--vestara-status-success-bg)',
    },
    connecting: {
      icon: <AutorenewRoundedIcon fontSize="small" className="animate-spin" />,
      label: 'Connecting',
      color: 'text-(--vestara-status-warning)',
      bg: 'bg-(--vestara-status-warning-bg)',
    },
    disconnected: {
      icon: <CloudOffRoundedIcon fontSize="small" />,
      label: 'Offline',
      color: 'text-(--vestara-status-error)',
      bg: 'bg-(--vestara-status-error-bg)',
    },
  }[status];

  return (
    <div className={`hidden lg:flex items-center gap-2 px-3 h-9 rounded-xl border border-(--vestara-accent-border) ${config.bg}`}>
      <div className={config.color}>{config.icon}</div>

      <div className="text-xs">
        <div className="text-(--vestara-text-2)">Workspace</div>
        <div className={`font-medium ${config.color}`}>{config.label}</div>
      </div>
    </div>
  );
}
