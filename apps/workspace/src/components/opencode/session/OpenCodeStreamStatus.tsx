import type { OpenCodeStreamStatus as OpenCodeStreamStatusValue } from '../../../lib/opencode-events';

const LABELS: Record<OpenCodeStreamStatusValue, string> = {
  connecting: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  disconnected: 'Disconnected',
  failed: 'Failed',
};

const TONES: Record<OpenCodeStreamStatusValue, string> = {
  connecting: 'text-(--vestara-amber)',
  connected: 'text-(--vestara-green)',
  reconnecting: 'text-(--vestara-amber)',
  disconnected: 'text-(--vestara-text-muted)',
  failed: 'text-(--vestara-red)',
};

const DOTS: Record<OpenCodeStreamStatusValue, string> = {
  connecting: 'bg-(--vestara-amber)',
  connected: 'bg-(--vestara-green)',
  reconnecting: 'bg-(--vestara-amber)',
  disconnected: 'bg-zinc-600',
  failed: 'bg-(--vestara-red)',
};

export function OpenCodeStreamStatus({ status }: { status: OpenCodeStreamStatusValue }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${TONES[status]}`} data-testid="stream-status">
      <span className={`w-1.5 h-1.5 rounded-full ${DOTS[status]}`} />
      {LABELS[status]}
    </span>
  );
}
