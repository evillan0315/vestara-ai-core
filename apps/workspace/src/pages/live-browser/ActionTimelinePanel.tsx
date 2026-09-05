/**
 * Action Timeline panel — the voice → intent → browser pipeline phases, with
 * active/waiting indicators. Matches the Live Browser right-rail design.
 */

import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import type { TimelineEntry } from '../../hooks/useBrowserSession';

export interface ActionTimelinePanelProps {
  entries: readonly TimelineEntry[];
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function statusDot(status: TimelineEntry['status']): string {
  switch (status) {
    case 'active':
      return 'bg-(--vestara-accent-text) animate-pulse';
    case 'waiting':
      return 'bg-(--vestara-amber) animate-pulse';
    case 'error':
      return 'bg-(--vestara-red)';
    default:
      return 'bg-(--vestara-green)';
  }
}

function RowIcon({ status }: { status: TimelineEntry['status'] }) {
  if (status === 'active' || status === 'waiting') {
    return (
      <span className="h-3 w-3 animate-spin rounded-full border-2 border-(--vestara-accent-border) border-t-(--vestara-accent-text)" />
    );
  }
  if (status === 'error') return <span className="h-3 w-3 rounded-full bg-(--vestara-red)" />;
  return <span className="h-3 w-3 rounded-full bg-(--vestara-green)" />;
}

export function ActionTimelinePanel({ entries }: ActionTimelinePanelProps) {
  return (
    <div className="rounded-xl border border-(--vestara-accent-border) bg-zinc-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <GraphicEqRoundedIcon fontSize="small" className="text-(--vestara-accent-text)" />
        <h2 className="text-sm font-semibold text-(--vestara-text)">Action Timeline</h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-(--vestara-text-dim)">Pipeline activity will appear here.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {entries.slice(-8).map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                <RowIcon status={entry.status} />
              </span>
              <span className="min-w-0 flex-1 break-words text-xs text-(--vestara-text-2)">
                {entry.label}
                {entry.detail && <span className="text-(--vestara-text-dim)"> — {entry.detail}</span>}
              </span>
              <span className="shrink-0 text-[10px] text-(--vestara-text-dim)">{timeLabel(entry.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
