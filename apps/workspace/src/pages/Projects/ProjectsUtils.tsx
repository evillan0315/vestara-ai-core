export function progressColor(pct: number): string {
  if (pct >= 70) return '#10b981';
  if (pct >= 30) return '#f59e0b';
  return '#ef4444';
}
export async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  return r.ok ? r.json() : null;
}
export function StatCard({
  label,
  value,
  sub,
  accent = '#52525b',
  compact,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`text-center bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg border-l-2 ${compact ? 'p-1.5' : 'p-2'}`}
      style={{ borderLeftColor: accent }}
    >
      <div
        className={`font-bold ${compact ? 'text-xs' : 'text-lg'}`}
        style={{ color: Number(value) > 0 ? accent : '#52525b' }}
      >
        {value}
      </div>
      <div className="text-[9px] text-zinc-600">{label}</div>
      {sub && <div className="text-[8px] text-zinc-700 mt-0.5">{sub}</div>}
    </div>
  );
}
export function ProgressBar({ pct, size = 'sm' }: { pct: number; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 'h-2' : size === 'md' ? 'h-1.5' : 'h-1';
  const color = progressColor(pct);
  return (
    <div className={`w-full bg-(--vestara-accent-bg) rounded-full ${h}`}>
      <div
        className={`${h} rounded-full transition-all`}
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}
