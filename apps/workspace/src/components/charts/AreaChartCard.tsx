import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

interface AreaChartCardProps {
  data: { hour: string; events: number }[];
  accent?: string;
  height?: number;
}

export default function AreaChartCard({ data, height = 14 }: AreaChartCardProps) {
  if (data.length === 0) return null;
  return (
    <div className={`h-${height} mb-2`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <Area
            type="monotone"
            dataKey="events"
            stroke="var(--vestara-accent)"
            strokeWidth={1.5}
            fill="var(--vestara-accent)"
            fillOpacity={0.08}
            dot={false}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--chart-tooltip-bg)',
              border: '1px solid var(--chart-tooltip-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--chart-tooltip-text)',
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
