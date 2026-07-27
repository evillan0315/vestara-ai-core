export default function StatCard({
  label,
  value,
  sub,
  accent = '#52525b',
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors border-l-[3px]"
      style={{ borderLeftColor: accent }}
    >
      <div className="text-[9px] text-zinc-600 uppercase tracking-widest">{label}</div>
      <div className="text-lg font-bold text-zinc-100 mt-1">{value}</div>
      {sub && <div className="text-[9px] text-zinc-700">{sub}</div>}
    </div>
  );
}
