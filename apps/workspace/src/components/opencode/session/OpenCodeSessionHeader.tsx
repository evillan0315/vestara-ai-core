import StopCircleRoundedIcon from '@mui/icons-material/StopCircleRounded';
import type { OpenCodeSessionDetail } from '../../../lib/opencode';
import type { OpenCodeStreamStatus } from '../../../lib/opencode-events';
import { OpenCodeSessionStatusBadge } from '../OpenCodeSessionStatusBadge';
import { OpenCodeStreamStatus as StreamStatus } from './OpenCodeStreamStatus';

interface OpenCodeSessionHeaderProps {
  session: OpenCodeSessionDetail;
  streamStatus: OpenCodeStreamStatus;
  active: boolean;
  onAbort: () => void;
}

export function OpenCodeSessionHeader({ session, streamStatus, active, onAbort }: OpenCodeSessionHeaderProps) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-[15px] font-bold text-(--vestara-text) truncate">{session.title}</h1>
        <OpenCodeSessionStatusBadge status={session.status} />
        <span className="text-[10px] text-(--vestara-text-muted)">
          {session.agent ?? 'agent'}
          {session.model?.id ? ` · ${session.model.id}` : ''}
        </span>
        {active && (
          <button
            type="button"
            onClick={onAbort}
            className="ml-auto flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:text-amber-300 cursor-pointer"
          >
            <StopCircleRoundedIcon fontSize="inherit" /> Abort
          </button>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono text-(--vestara-text-muted) flex-wrap">
        <span>{session.id}</span>
        <StreamStatus status={streamStatus} />
      </div>
    </div>
  );
}
