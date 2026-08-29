import type { OpenCodeSessionViewStatus } from '../../lib/opencode';

const STYLES: Record<OpenCodeSessionViewStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  idle: 'bg-zinc-800 text-(--vestara-text-muted) border-(--vestara-accent-border)',
  failed: 'bg-red-500/10 text-red-400 border-red-500/20',
  unknown: 'bg-zinc-900 text-(--vestara-text-dim) border-(--vestara-accent-border)',
};

const LABELS: Record<OpenCodeSessionViewStatus, string> = {
  active: 'Active',
  idle: 'Idle',
  failed: 'Failed',
  unknown: 'Unknown',
};

export function OpenCodeSessionStatusBadge({ status }: { status: OpenCodeSessionViewStatus }) {
  return (
    <span
      className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
