import { BarChart, Bar, XAxis, ResponsiveContainer } from 'recharts';
import type { HistoryItem } from '../types';

interface LatencyChartProps {
  history: HistoryItem[];
}

export function LatencyChart({ history }: LatencyChartProps) {
  const recent = history.slice(0, 20).reverse();
  if (recent.length < 2) return null;

  const maxLatency = Math.max(...recent.map((h) => h.latency), 1);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3 mt-3">
      <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2">
        Response Times ({recent.length} requests)
      </div>
      <div className="flex items-end gap-[2px] h-12">
        {recent.slice(-30).map((item, i) => {
          const height = Math.max(3, (item.latency / maxLatency) * 44);
          const color = item.status === 'success' ? 'var(--vestara-green)' : 'var(--vestara-red)';
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div className="w-full rounded-t-sm transition-all" style={{ height: `${height}px`, backgroundColor: color, opacity: 0.6 }} />
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-zinc-900 border border-(--vestara-accent-border) rounded px-1.5 py-0.5 text-[8px] text-(--vestara-text) whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                {item.latency}ms · {item.status}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[7px] text-(--vestara-text-dim) mt-1">
        <span>Latest</span>
        <span>max: {maxLatency}ms</span>
      </div>
    </div>
  );
}
