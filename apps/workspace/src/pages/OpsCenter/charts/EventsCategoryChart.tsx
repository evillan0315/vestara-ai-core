import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  system: '#6b7280', agent: '#3b82f6', conversation: '#6366f1',
  workspace: '#10b981', planning: '#f59e0b', implementation: '#ef4444',
  verification: '#8b5cf6', collaboration: '#ec4899', memory: '#06b6d4',
  profile: '#14b8a6',
};

interface EventsCategoryChartProps {
  events: any[];
}

export function EventsCategoryChart({ events }: EventsCategoryChartProps) {
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.category] = (counts[e.category] || 0) + 1;
  const data = Object.entries(counts).map(([name, value]) => ({
    name, value, color: CATEGORY_COLORS[name] || '#6b7280',
  })).sort((a, b) => b.value - a.value).slice(0, 6);

  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Events by Category</h3>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={16} outerRadius={28} dataKey="value" paddingAngle={2}>
                {data.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1 min-w-0">
          {data.slice(0, 4).map((d) => (
            <div key={d.name} className="flex items-center justify-between text-[9px]">
              <span className="flex items-center gap-1.5 text-(--vestara-text-2) truncate">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                {d.name}
              </span>
              <span className="text-(--vestara-text-muted) shrink-0">{Math.round((d.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
