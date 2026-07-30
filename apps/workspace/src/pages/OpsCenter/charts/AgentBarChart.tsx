import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';
import type { Agent, Execution } from '../../OpsCenter';

interface AgentBarChartProps {
  agents: Agent[];
  executions: Execution[];
}

export function AgentBarChart({ agents, executions }: AgentBarChartProps) {
  const data = agents.slice(0, 12).map((a) => {
    const count = executions.filter((e) => e.agentId === a.id).length;
    return { name: a.name || a.role, value: count, color: a.color || '#6b7280' };
  }).filter((d) => d.value > 0);

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
      <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-wider mb-3">Agent Executions</h3>
      {data.length === 0 ? (
        <div className="text-[10px] text-(--vestara-text-dim) text-center py-6">No execution data yet</div>
      ) : (
      <ResponsiveContainer width="100%" height={Math.max(80, data.length * 28)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, maxVal]} tick={{ fontSize: 8, fill: 'var(--vestara-text-dim)' }} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: 'var(--vestara-text-2)' }} width={65} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={10}>
            {data.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
