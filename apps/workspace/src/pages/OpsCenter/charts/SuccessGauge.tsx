import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface SuccessGaugeProps {
  rate: number;
  total: number;
}

export function SuccessGauge({ rate, total }: SuccessGaugeProps) {
  const data = [{ name: 'Success Rate', value: rate, fill: 'var(--vestara-green)' }];
  const color = rate >= 80 ? 'var(--vestara-green)' : rate >= 50 ? 'var(--vestara-amber)' : 'var(--vestara-red)';

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Success Rate</h3>
      {rate === 0 ? (
        <div className="text-[10px] text-(--vestara-text-dim) text-center py-6">No data yet</div>
      ) : (
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" barSize={8} data={data} startAngle={180} endAngle={0}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'var(--vestara-accent-border)' }} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1">
          <div className="text-2xl font-bold" style={{ color }}>{rate}%</div>
          <div className="text-[9px] text-(--vestara-text-muted)">{total} total executions</div>
        </div>
      </div>
      )}
    </div>
  );
}
