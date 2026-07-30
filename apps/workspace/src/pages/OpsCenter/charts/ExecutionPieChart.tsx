import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ExecutionPieChartProps {
  completed: number;
  failed: number;
  running: number;
}

const COLORS = { completed: '#10b981', failed: '#ef4444', running: '#f59e0b' };

export function ExecutionPieChart({ completed, failed, running }: ExecutionPieChartProps) {
  const data = [
    { name: 'Completed', value: completed, color: COLORS.completed },
    { name: 'Failed', value: failed, color: COLORS.failed },
    { name: 'Running', value: running, color: COLORS.running },
  ].filter((d) => d.value > 0);

  const total = completed + failed + running;

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Execution Breakdown</h3>
      {total === 0 ? (
        <div className="text-[10px] text-(--vestara-text-dim) text-center py-6">No execution data yet</div>
      ) : (
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={22} outerRadius={36} dataKey="value" paddingAngle={3}>
                {data.map((entry, i) => (<Cell key={i} fill={entry.color} stroke="none" />))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {data.map((d) => (
            <div key={d.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-[10px] text-(--vestara-text-2)">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-(--vestara-text)">{d.value}</span>
                <span className="text-[8px] text-(--vestara-text-dim)">({Math.round((d.value / total) * 100)}%)</span>
              </div>
            </div>
          ))}
          <div className="border-t border-(--vestara-accent-border) pt-1.5 mt-1.5 flex justify-between">
            <span className="text-[9px] text-(--vestara-text-muted)">Total</span>
            <span className="text-[10px] font-medium text-(--vestara-text)">{total}</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
