import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { UnderstandingData } from '../useUnderstanding';

const LAYER_COLORS: Record<string, string> = {
  contracts: '#8b5cf6', infrastructure: '#3b82f6', services: '#10b981',
  tools: '#f59e0b', app: '#ef4444', ui: '#ec4899',
};

export function LayersBarChart({ data }: { data: UnderstandingData }) {
  const layerCounts: Record<string, number> = {};
  for (const l of data.architecture.layers) layerCounts[l.layer] = (layerCounts[l.layer] || 0) + 1;
  const chartData = Object.entries(layerCounts).map(([name, value]) => ({ name, value, fill: LAYER_COLORS[name] || '#6b7280' }));
  if (chartData.length === 0) return null;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Layer Distribution</h3>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'var(--vestara-text-2)' }} width={70} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 11 }}
            itemStyle={{ color: '#e4e4e7' }} labelStyle={{ color: '#a1a1aa' }} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={12}>
            {chartData.map((entry, index) => (<Cell key={index} fill={entry.fill} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
