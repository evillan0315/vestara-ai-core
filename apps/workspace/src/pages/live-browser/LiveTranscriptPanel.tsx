/**
 * Live Transcript panel — voice commands and browser actions, coalesced and
 * timestamped. Matches the Live Browser right-rail design.
 */

import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import type { TranscriptEntry } from '../../hooks/useBrowserSession';

export interface LiveTranscriptPanelProps {
  entries: readonly TranscriptEntry[];
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LiveTranscriptPanel({ entries }: LiveTranscriptPanelProps) {
  return (
    <div className="rounded-xl border border-(--vestara-accent-border) bg-zinc-900 p-3">
      <div className="mb-2 flex items-center gap-2">
        <GraphicEqRoundedIcon fontSize="small" className="text-(--vestara-accent-text)" />
        <h2 className="text-sm font-semibold text-(--vestara-text)">Live Transcript</h2>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-(--vestara-text-dim)">No activity yet — say or type a command.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.slice(-8).map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${
                  entry.source === 'voice'
                    ? 'bg-(--vestara-accent-bg) text-(--vestara-accent-text)'
                    : 'bg-zinc-800 text-(--vestara-text-2)'
                }`}
              >
                {entry.source === 'voice' ? '🎙' : '▸'}
              </span>
              <span className="min-w-0 flex-1 break-words text-xs text-(--vestara-text-2)">{entry.text}</span>
              <span className="shrink-0 text-[10px] text-(--vestara-text-dim)">{timeLabel(entry.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
