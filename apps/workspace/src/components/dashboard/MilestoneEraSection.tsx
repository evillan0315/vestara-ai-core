import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Section from './Section';
import { ERA_COLORS, ERA_ORDER, type MilestoneResponse } from './constants';

interface MilestoneEraSectionProps {
  milestones: MilestoneResponse | null;
  expandedEra: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onToggleEra: (era: string) => void;
  dragSection?: {
    id: string;
    isDragOver: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  style?: React.CSSProperties;
}

export default function MilestoneEraSection({
  milestones,
  expandedEra,
  collapsed,
  onToggle,
  onToggleEra,
  dragSection,
  style,
}: MilestoneEraSectionProps) {
  if (!milestones) return null;

  const eraCadence = ERA_ORDER.filter((era) => milestones.byEra[era]).map((era) => {
    const items = milestones.byEra[era];
    return {
      era,
      total: items.length,
      completed: items.filter((m) => m.status === 'completed').length,
      color: ERA_COLORS[era] || '#6b7280',
    };
  });

  return (
    <Section
      title="Milestones by Era"
      icon="🎯"
      collapsible
      collapsed={collapsed}
      onToggle={onToggle}
      dragSection={dragSection}
      style={style}
    >
      {eraCadence.length > 0 && (
        <div className="space-y-2">
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={eraCadence.map((e) => ({
                  name: e.era.split(' ')[0],
                  completed: e.completed,
                  pending: e.total - e.completed,
                }))}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: 'var(--chart-text)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Bar
                  dataKey="completed"
                  stackId="a"
                  fill="var(--vestara-accent)"
                  radius={[0, 0, 0, 0]}
                  activeBar={false}
                />
                <Bar
                  dataKey="pending"
                  stackId="a"
                  fill="var(--color-zinc-700)"
                  radius={[4, 4, 0, 0]}
                  activeBar={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--chart-tooltip-bg)',
                    border: '1px solid var(--chart-tooltip-border)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: 'var(--chart-tooltip-text)',
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {eraCadence.map((e) => (
            <div key={e.era}>
              <button
                onClick={() => onToggleEra(expandedEra === e.era ? '' : e.era)}
                className="w-full flex items-center gap-2 text-left py-1 px-1 rounded hover:bg-zinc-800/30 transition-colors cursor-pointer"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                <span className="text-[9px] text-zinc-400 font-medium flex-1">{e.era}</span>
                <span className="text-[9px] text-zinc-600">
                  {e.completed}/{e.total}
                </span>
                <span
                  className={`text-[8px] text-zinc-700 transition-transform ${expandedEra === e.era ? 'rotate-180' : ''}`}
                >
                  ▾
                </span>
              </button>
              {expandedEra === e.era && (
                <div className="ml-4 space-y-0.5 mt-0.5">
                  {milestones.byEra[e.era]?.map((m) => (
                    <div key={m.version} className="flex items-center gap-2 py-0.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.status === 'completed' ? 'bg-green-500' : m.status === 'in_progress' ? 'bg-amber-500' : 'bg-zinc-700'}`}
                      />
                      <span className="text-[9px] text-zinc-500">{m.version}</span>
                      <span className="text-[9px] text-zinc-400 truncate flex-1">{m.name}</span>
                      <span className="text-[8px] text-zinc-700">{m.status.replace('_', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
