import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { UnderstandingData } from '../useUnderstanding';

const ROLE_COLORS: Record<string, string> = {
  app: '#ef4444', service: '#3b82f6', tool: '#f59e0b', ui: '#ec4899', contract: '#8b5cf6',
};

export function EntryPointsChart({ data }: { data: UnderstandingData }) {
  const chartData = data.architecture.entryPoints.slice(0, 10).map((ep) => ({
    name: ep.path.split('/').pop() || ep.path,
    confidence: Math.round(ep.confidence * 100),
    role: ep.role,
    fill: ROLE_COLORS[ep.role] || '#6b7280',
  }));
  if (chartData.length === 0) return null;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Entry Point Confidence</h3>
      <ResponsiveContainer width="100%" height={Math.max(80, chartData.length * 24)}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: 'var(--vestara-text-dim)' }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: 'var(--vestara-text-2)' }} width={60} />
          <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 11 }}
            formatter={(value: any) => [`${Math.round(value)}%`, 'Confidence']}
            itemStyle={{ color: '#e4e4e7' }} labelStyle={{ color: '#a1a1aa' }} />
          <Bar dataKey="confidence" radius={[0, 3, 3, 0]} barSize={10}>
            {chartData.map((entry, index) => (<Cell key={index} fill={entry.fill} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
