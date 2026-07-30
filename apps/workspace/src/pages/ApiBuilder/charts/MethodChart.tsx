import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import type { TabData } from '../types';

const METHOD_COLORS: Record<string, string> = {
  GET: '#10b981', POST: '#3b82f6', PUT: '#f59e0b',
  DELETE: '#ef4444', PATCH: '#8b5cf6',
};

interface MethodChartProps {
  tabs: TabData[];
}

export function MethodChart({ tabs }: MethodChartProps) {
  const counts: Record<string, number> = {};
  for (const t of tabs) counts[t.method] = (counts[t.method] || 0) + 1;
  const data = Object.entries(counts).map(([method, count]) => ({
    name: method, value: count, fill: METHOD_COLORS[method] || '#6b7280',
  }));
  if (data.length === 0) return null;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2">Method Usage</div>
      <ResponsiveContainer width="100%" height={60}>
        <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'var(--vestara-text-2)' }} />
          <YAxis hide />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} barSize={20}>
            {data.map((entry, i) => (<Cell key={i} fill={entry.fill} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
