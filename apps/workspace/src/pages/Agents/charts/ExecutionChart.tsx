import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ExecutionChartProps {
  total: number;
  completed: number;
  failed: number;
  running: number;
}

const COLORS = { completed: '#10b981', failed: '#ef4444', running: '#f59e0b' };

export function ExecutionChart({ total, completed, failed, running }: ExecutionChartProps) {
  const data = [
    { name: 'Completed', value: completed, color: COLORS.completed },
    { name: 'Failed', value: failed, color: COLORS.failed },
    { name: 'Running', value: running, color: COLORS.running },
  ].filter((d) => d.value > 0);

  if (data.length === 0 || total === 0) return null;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-3">
      <div className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-2">Execution Distribution</div>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={18} outerRadius={28} dataKey="value" paddingAngle={2}>
                {data.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-1">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1.5 text-(--vestara-text-2)">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}
              </span>
              <span className="font-medium text-(--vestara-text)">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
