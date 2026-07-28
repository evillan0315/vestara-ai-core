import type { Agent } from '../../pages/OpsCenter';

interface OpsRightSidebarProps {
  agentStatuses: any[];
  expandedAgent: string | null;
  setExpandedAgent: (role: string | null) => void;
  agentFilter: string;
  setAgentFilter: (filter: string) => void;
  activeAgentCount: number;
  totalRegistered: number;
  executions: any[];
}

const ROLE_COLORS: Record<string, string> = {
  conversation: '#6366f1',
  'planning-agent': '#3b82f6',
  'implementation-agent': '#10b981',
  verification: '#f59e0b',
  'release-agent': '#8b5cf6',
};

export default function OpsRightSidebar({ agentStatuses, expandedAgent, setExpandedAgent, agentFilter, setAgentFilter, activeAgentCount, totalRegistered, executions }: OpsRightSidebarProps) {
  return (
    <aside className="flex flex-col gap-6">
      <div className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-800)] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--vestara-text-muted)] uppercase tracking-wider">Agents</h3>
          <span className="text-[10px] text-[var(--vestara-green)]">{activeAgentCount} active</span>
        </div>
        <div className="flex gap-1 mb-3">
          {(['all', 'active', 'offline'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setAgentFilter(filter)}
              className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${agentFilter === filter ? 'bg-[var(--color-zinc-700)] text-[var(--color-zinc-200)] font-medium' : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text)]'}`}
            >
              {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Offline'}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {Object.entries(ROLE_COLORS).map(([role, color]) => {
            const agent = agentStatuses.find((a: any) => a.role === role);
            const present = !!agent;
            const running = agent?.isRunning;
            const isExpanded = expandedAgent === role;
            const execs = executions.filter((e: any) => e.agentId === agent?.id || agent?.id?.includes(e.agentId));
            return (
              <div key={role}>
                <div
                  className="bg-[var(--color-zinc-900)] border border-[var(--color-zinc-800)] rounded-lg overflow-hidden cursor-pointer hover:border-[var(--color-zinc-700)] transition-colors"
                  onClick={() => setExpandedAgent(isExpanded ? null : role)}
                  style={{ borderLeftColor: color, borderLeftWidth: '3px' }}
                >
                  <div className="p-3 flex items-center gap-3">
                    <div className="relative shrink-0">
                      <span
                        className={`w-3 h-3 rounded-full block ${running ? 'animate-pulse' : ''}`}
                        style={{ backgroundColor: running ? color : present ? `${color}88` : '#3f3f46' }}
                      />
                      {running && (
                        <span className="absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-40" style={{ backgroundColor: color }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-[var(--vestara-text)] truncate">{agent?.name || role}</div>
                      <div className="text-[10px] text-[var(--vestara-text-muted)]">
                        {running ? 'running' : present ? 'ready' : 'offline'} · {execs.length} execs
                      </div>
                    </div>
                    <span className="text-[10px] text-[var(--vestara-text-muted)]">{isExpanded ? '▼' : '▶'}</span>
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-[var(--color-zinc-800)]">
                    {execs.slice(0, 3).map((ex: any) => (
                      <div key={ex.id} className="flex items-center gap-2 text-[10px] py-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${ex.status === 'completed' ? 'bg-[var(--vestara-green)]' : ex.status === 'running' ? 'bg-amber-400' : 'bg-[var(--vestara-red)]'}`} />
                        <span className="text-[var(--vestara-text-2)] truncate flex-1">{ex.task}</span>
                        <span className="text-[var(--vestara-text-muted)]">{ex.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-3 pt-2 border-t border-[var(--color-zinc-800)] text-[10px] text-[var(--vestara-text-muted)]">
          {totalRegistered} agents registered · {activeAgentCount} active
        </div>
      </div>
    </aside>
  );
}