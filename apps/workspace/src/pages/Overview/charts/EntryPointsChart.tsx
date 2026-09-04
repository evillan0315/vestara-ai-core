import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { UnderstandingData } from '../useUnderstanding';

const ROLE_COLORS: Record<string, string> = {
  app: 'var(--vestara-red)',
  service: 'var(--vestara-blue)',
  tool: 'var(--vestara-amber)',
  ui: '#ec4899',
  contract: 'var(--vestara-purple)',
};

export function EntryPointsChart({ data }: { data: UnderstandingData }) {
  const chartData = data.architecture.entryPoints.slice(0, 10).map((ep) => ({
    name: ep.path.split('/').pop() || ep.path,
    confidence: Math.round(ep.confidence * 100),
    role: ep.role,
    fill: ROLE_COLORS[ep.role] || 'var(--vestara-text-dim)',
  }));
  if (chartData.length === 0) return null;

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-accent)] rounded-lg p-4 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h3 className="text-[9px] font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">
        Entry Point Confidence
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 24)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 10, bottom: 0, left: 0 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: 'var(--chart-text)' }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 8, fill: 'var(--vestara-text-2)' }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--chart-tooltip-bg)',
              border: '1px solid var(--chart-tooltip-border)',
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number) => [`${Math.round(value)}%`, 'Confidence']}
            itemStyle={{ color: 'var(--chart-tooltip-text)' }}
            labelStyle={{ color: 'var(--chart-text)' }}
          />
          <Bar dataKey="confidence" radius={[0, 3, 3, 0]} barSize={10}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
