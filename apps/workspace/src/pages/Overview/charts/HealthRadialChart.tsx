import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import type { UnderstandingData } from '../useUnderstanding';

function scoreToPercent(label: string): number {
  if (label === 'high' || label === 'excellent') return 90;
  if (label === 'medium' || label === 'good') return 65;
  if (label === 'low' || label === 'fair') return 40;
  return 20;
}

export function HealthRadialChart({ data }: { data: UnderstandingData }) {
  const h = data.maturity;
  const items = [
    { name: 'Health', value: h.healthScore * 10, fill: 'var(--vestara-accent)' },
    { name: 'Test Coverage', value: scoreToPercent(h.testCoverage), fill: 'var(--vestara-green)' },
    { name: 'Code Quality', value: scoreToPercent(h.codeQuality), fill: 'var(--vestara-blue)' },
    { name: 'Documentation', value: scoreToPercent(h.documentationLevel), fill: 'var(--vestara-purple)' },
  ];

  return (
    <div className="bg-[var(--vestara-accent-bg)] border border-[var(--vestara-accent-border)] border-l-[3px] border-l-[var(--vestara-accent)] rounded-lg p-4 hover:border-[var(--vestara-accent-border-hover)] transition-colors">
      <h3 className="text-[9px] font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider mb-3">
        Health Metrics
      </h3>
      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <div className="relative w-12 h-12 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  cx="50%"
                  cy="50%"
                  innerRadius="70%"
                  outerRadius="100%"
                  barSize={6}
                  data={[{ ...item }]}
                  startAngle={180}
                  endAngle={0}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={3}
                    background={{ fill: 'var(--vestara-accent-border)' }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[9px] font-bold" style={{ color: item.fill }}>
                  {Math.round(item.value)}%
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-[var(--vestara-text)] truncate">
                {item.name}
              </div>
              <div className="text-[8px] text-[var(--vestara-text-muted)] capitalize">
                {(h as Record<string, string>)[item.name.toLowerCase().replace(' ', '')] || '\u2014'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
