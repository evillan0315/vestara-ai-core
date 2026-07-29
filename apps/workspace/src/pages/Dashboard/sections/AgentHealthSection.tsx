import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface AgentHealthSectionProps {
  execStats: { total: number; completed: number; failed: number; running: number };
  dragSection: DragSectionProps;
}

export default function AgentHealthSection({ execStats, dragSection }: AgentHealthSectionProps) {
  if (execStats.total === 0) return null;

  return (
    <DashboardSection title="Agent Health" icon="☰" dragSection={dragSection}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg">
          <div className="w-14 h-14 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Completed', value: execStats.completed, color: 'var(--vestara-accent)' },
                    { name: 'Failed', value: execStats.failed, color: '#ef4444' },
                    { name: 'Running', value: execStats.running, color: '#f59e0b' },
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={16}
                  outerRadius={26}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                >
                  {[
                    <Cell key="c" style={{ fill: 'var(--vestara-accent)' }} />,
                    <Cell key="f" fill={execStats.failed > 0 ? '#ef4444' : '#27272a'} />,
                    <Cell key="r" fill={execStats.running > 0 ? '#f59e0b' : '#27272a'} />,
                  ]}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 text-[10px]">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--vestara-accent)' }} />
              <span className="text-zinc-500">{execStats.completed} completed</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: execStats.failed > 0 ? '#ef4444' : '#27272a' }}
              />
              <span className="text-zinc-500">
                {execStats.failed > 0 ? `${execStats.failed} failed` : 'No failures'}
              </span>
            </div>
            {execStats.running > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-amber-400">{execStats.running} running</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-lg font-bold" style={{ color: 'var(--vestara-accent)' }}>
              {execStats.total > 0 ? Math.round((execStats.completed / execStats.total) * 100) : 0}%
            </div>
            <div className="text-[9px] text-zinc-700">success</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-zinc-900/50 border border-zinc-800 rounded text-center border-l-[2px] border-l-accent">
            <div className="text-sm font-bold text-accent">{execStats.total}</div>
            <div className="text-[9px] text-zinc-600">Total</div>
          </div>
          <div
            className="p-2 bg-zinc-900/50 border border-zinc-800 rounded text-center border-l-[2px]"
            style={{ borderLeftColor: '#10b981' }}
          >
            <div className="text-sm font-bold text-green-400">{execStats.completed}</div>
            <div className="text-[9px] text-zinc-600">Done</div>
          </div>
          <div
            className="p-2 bg-zinc-900/50 border border-zinc-800 rounded text-center border-l-[2px]"
            style={{ borderLeftColor: '#f59e0b' }}
          >
            <div className="text-sm font-bold text-amber-400">{execStats.running}</div>
            <div className="text-[9px] text-zinc-600">Running</div>
          </div>
          <div
            className="p-2 bg-zinc-900/50 border border-zinc-800 rounded text-center border-l-[2px]"
            style={{ borderLeftColor: '#ef4444' }}
          >
            <div className="text-sm font-bold text-red-400">{execStats.failed}</div>
            <div className="text-[9px] text-zinc-600">Failed</div>
          </div>
        </div>
      </div>
    </DashboardSection>
  );
}
