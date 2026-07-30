export default function StatCard({
  label, value, sub, accent = '#52525b',
}: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors border-l-[3px]" style={{ borderLeftColor: accent }}>
      <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
      {sub && <div className="text-[9px] text-(--vestara-text-dim)">{sub}</div>}
    </div>
  );
}
