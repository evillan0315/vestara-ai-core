import type { OpenCodeActivityEvent } from './openCodeEventNormalizer';

interface OpenCodeActivityItemProps {
  event: OpenCodeActivityEvent;
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString();
}

export function OpenCodeActivityItem({ event }: OpenCodeActivityItemProps) {
  const time = timeLabel(event.timestamp);
  return (
    <div
      className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-[11px] text-(--vestara-text-2)"
      data-testid="activity-item"
    >
      <div className="flex items-center gap-2">
        <EventBadge event={event} />
        <span className="text-[9px] text-(--vestara-text-dim) shrink-0">{time}</span>
        {event.agentId && <span className="text-[9px] text-(--vestara-text-muted) shrink-0">{event.agentId}</span>}
      </div>
      <div className="mt-1">
        <EventBody event={event} />
      </div>
    </div>
  );
}

function EventBadge({ event }: { event: OpenCodeActivityEvent }) {
  const badge =
    event.kind === 'message'
      ? event.role === 'user'
        ? 'bg-zinc-800 text-(--vestara-text)'
        : 'bg-(--vestara-accent-bg) text-(--vestara-accent)'
      : event.kind === 'tool'
        ? 'bg-purple-500/10 text-purple-400'
        : event.kind === 'file'
          ? 'bg-emerald-500/10 text-emerald-400'
          : event.kind === 'error'
            ? 'bg-red-500/10 text-red-400'
            : event.kind === 'status'
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-zinc-800 text-(--vestara-text-muted)';
  const label =
    event.kind === 'message'
      ? event.role === 'user'
        ? 'User'
        : 'Assistant'
      : event.kind === 'tool'
        ? event.tool
        : event.kind === 'status'
          ? 'Status'
          : event.kind;
  return <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badge}`}>{label}</span>;
}

function EventBody({ event }: { event: OpenCodeActivityEvent }) {
  switch (event.kind) {
    case 'message':
      return <p className="text-(--vestara-text-2) whitespace-pre-wrap">{event.text || '…'}</p>;
    case 'tool':
      return (
        <p className="text-(--vestara-text-muted)">
          {event.phase === 'started' ? `Invoked ${event.tool}` : `Completed ${event.tool}`}
          {event.phase === 'completed' && event.output ? ` — ${event.output.slice(0, 120)}` : ''}
        </p>
      );
    case 'file':
      return (
        <p className="text-(--vestara-text-muted">
          {event.path ? `${event.path} ${event.operation}` : event.operation}
        </p>
      );
    case 'status':
      return <p className="text-(--vestara-text-muted)">Status: {event.status}</p>;
    case 'error':
      return <p className="text-(--vestara-red)">{event.message}</p>;
    case 'system':
      return <p className="text-(--vestara-text-muted)">{event.summary}</p>;
    case 'unknown':
      return <p className="text-(--vestara-text-dim) font-mono">event: {event.rawType}</p>;
    default:
      return null;
  }
}
