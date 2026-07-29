import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface BarItem {
  name: string;
  value: number;
  color?: string;
}
interface BarChartCardProps {
  data: BarItem[];
  height?: number;
  layout?: 'vertical' | 'horizontal';
  stacked?: boolean;
  stackKeys?: { key: string; fill: string; radius?: number[] }[];
}

export default function BarChartCard({ data, height = 16, layout = 'vertical' }: BarChartCardProps) {
  if (data.length === 0) return null;
  return (
    <div className={`h-${height} mb-1`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout={layout} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          {layout === 'vertical' ? (
            <>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--chart-text)' }} width={60} />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 9, fill: 'var(--chart-text)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
            </>
          )}
          <Bar dataKey="value" radius={[0, 3, 3, 0]} minPointSize={2} activeBar={false}>
            {data.map((d, i) => (
              <Cell key={d.name || i} fill={d.color || 'var(--vestara-accent)'} />
            ))}
          </Bar>
          <Tooltip
            contentStyle={{
              background: 'var(--chart-tooltip-bg)',
              border: '1px solid var(--chart-tooltip-border)',
              borderRadius: 6,
              fontSize: 11,
              color: 'var(--chart-tooltip-text)',
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
