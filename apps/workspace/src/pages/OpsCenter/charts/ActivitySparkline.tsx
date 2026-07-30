import { AreaChart, Area, ResponsiveContainer } from 'recharts';

interface ActivitySparklineProps {
  events: any[];
}

export function ActivitySparkline({ events }: ActivitySparklineProps) {
  // Group events into 10 time buckets
  const now = Date.now();
  const buckets = 10;
  const interval = 60000; // 1 minute per bucket
  const data = Array.from({ length: buckets }, (_, i) => {
    const start = now - (buckets - i) * interval;
    const end = start + interval;
    const count = events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t < end;
    }).length;
    return { value: count };
  });

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2">Event Activity (last 10m)</div>
      <ResponsiveContainer width="100%" height={48}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--vestara-accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--vestara-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="value" stroke="var(--vestara-accent)" strokeWidth={1.5} fill="url(#activityGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between text-[7px] text-(--vestara-text-dim) mt-1">
        <span>-10m</span>
        <span>{data.reduce((a, b) => a + b.value, 0)} events</span>
        <span>now</span>
      </div>
    </div>
  );
}
