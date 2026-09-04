import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { UnderstandingData } from '../useUnderstanding';

const LAYER_COLORS: Record<string, string> = {
  contracts: 'var(--vestara-purple)',
  infrastructure: 'var(--vestara-blue)',
  services: 'var(--vestara-green)',
  tools: 'var(--vestara-amber)',
  app: 'var(--vestara-red)',
  ui: '#ec4899',
};

export function LayersBarChart({ data }: { data: UnderstandingData }) {
  const layerCounts: Record<string, number> = {};
  for (const l of data.architecture.layers)
    layerCounts[l.layer] = (layerCounts[l.layer] || 0) + 1;
  const chartData = Object.entries(layerCounts).map(([name, value]) => ({
    name,
    value,
    fill: LAYER_COLORS[name] || 'var(--vestara-text-dim)',
  }));
  if (chartData.length === 0) return null;

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-blue)] rounded-lg p-4 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h3 className="text-[9px] font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">
        Layer Distribution
      </h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 9, fill: 'var(--vestara-text-2)' }}
            width={70}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--chart-tooltip-bg)',
              border: '1px solid var(--chart-tooltip-border)',
              borderRadius: 8,
              fontSize: 11,
            }}
            itemStyle={{ color: 'var(--chart-tooltip-text)' }}
            labelStyle={{ color: 'var(--chart-text)' }}
          />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={12}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
