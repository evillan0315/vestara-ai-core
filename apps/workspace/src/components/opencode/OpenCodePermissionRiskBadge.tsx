import type { OpenCodePermissionRisk } from '../../lib/opencode';

const STYLES: Record<OpenCodePermissionRisk, string> = {
  safe: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  sensitive: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  dangerous: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const LABELS: Record<OpenCodePermissionRisk, string> = {
  safe: 'Safe',
  sensitive: 'Sensitive',
  dangerous: 'Dangerous',
};

export function OpenCodePermissionRiskBadge({ risk }: { risk: OpenCodePermissionRisk }) {
  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border shrink-0 ${STYLES[risk]}`}>
      {LABELS[risk]}
    </span>
  );
}
