export default function StatCard({
  label, value, sub, accent,
}: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div
      className="p-3 bg-(--vestara-surface) border border-(--vestara-accent-border) rounded-lg transition-all border-l-[3px] hover:border-(--vestara-accent-border-hover) hover:shadow-[0_0_20px_color-mix(in_srgb,var(--vestara-accent)_16%,transparent)]"
      style={{ borderLeftColor: accent ?? 'var(--vestara-accent)' }}
    >
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
      {sub && <div className="text-[9px] text-(--vestara-text-dim)">{sub}</div>}
    </div>
  );
}
