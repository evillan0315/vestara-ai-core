import { StatusIndicator } from '@vestara/ui';

interface ActivityRoomHeaderProps {
  readonly roomName: string;
  readonly state: 'connecting' | 'live' | 'reconnecting' | 'offline' | 'paused' | 'error';
  readonly paused: boolean;
  readonly recordCount: number;
  readonly cursor?: number;
  readonly onPause: () => void;
  readonly onClear: () => void;
  readonly onOpenSettings?: () => void;
}

export default function ActivityRoomHeader({
  roomName,
  state,
  paused,
  recordCount,
  cursor,
  onPause,
  onClear,
  onOpenSettings,
}: ActivityRoomHeaderProps) {
  const live = state === 'live' && !paused;

  return (
    <header className="ar-header" aria-label="Activity Room controls">
      <div className="ar-header__identity">
        <div className="ar-header__mark" aria-hidden="true">V</div>
        <div className="min-w-0">
          <p className="ar-kicker">Live operations</p>
          <h1 className="ar-header__title">{roomName}</h1>
          <p className="ar-header__subtitle">Real-time collaboration and AI activity in your workspace</p>
        </div>
      </div>
      <div className="ar-header__controls">
        <span className={`ar-status ${live ? 'ar-status--live' : 'ar-status--warn'}`}>
          <StatusIndicator variant={live ? 'live' : 'warn'} size="xs" pulse={live} ariaLabel={live ? 'Live' : state} />
          {live ? 'Live' : state}
        </span>
        <span className="ar-header__meta">{recordCount} records{cursor === undefined ? '' : ` · cursor ${cursor}`}</span>
        <button type="button" className="ar-control-button" onClick={onPause}>{paused ? '▶ Resume' : 'Ⅱ Pause'}</button>
        <button type="button" className="ar-control-button" onClick={onClear}>▣ Clear</button>
        <button type="button" className="ar-control-button ar-control-button--icon" aria-label="Fullscreen">↗</button>
        <button type="button" className="ar-control-button ar-control-button--icon" aria-label="Activity Room settings" onClick={onOpenSettings}>⚙</button>
      </div>
    </header>
  );
}
