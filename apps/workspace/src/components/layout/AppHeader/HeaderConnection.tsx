import CloudDoneRoundedIcon from '@mui/icons-material/CloudDoneRounded';
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';

export interface HeaderConnectionProps {
  status?: 'connected' | 'connecting' | 'disconnected';
}

export default function HeaderConnection({ status = 'connected' }: HeaderConnectionProps) {
  const config = {
    connected: {
      icon: <CloudDoneRoundedIcon fontSize="small" />,
      label: 'Connected',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    connecting: {
      icon: <AutorenewRoundedIcon fontSize="small" className="animate-spin" />,
      label: 'Connecting',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
    },
    disconnected: {
      icon: <CloudOffRoundedIcon fontSize="small" />,
      label: 'Offline',
      color: 'text-red-400',
      bg: 'bg-red-500/10',
    },
  }[status];

  return (
    <div className={`hidden lg:flex items-center gap-2 px-3 h-9 rounded-xl border border-zinc-800 ${config.bg}`}>
      <div className={config.color}>{config.icon}</div>

      <div className="text-xs">
        <div className="text-zinc-500">Workspace</div>
        <div className={`font-medium ${config.color}`}>{config.label}</div>
      </div>
    </div>
  );
}
