import type { Agent, Execution } from '../../pages/OpsCenter';
import Pagination from '../Pagination';

interface OpsRightSidebarProps {
  agentStatuses: any[];
  expandedAgent: string | null;
  setExpandedAgent: (role: string | null) => void;
  agentFilter: string;
  setAgentFilter: (filter: string) => void;
  activeAgentCount: number;
  totalRegistered: number;
  executions: Execution[];
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

const ROLE_COLORS: Record<string, string> = {
  architect: '#8b5cf6', developer: '#3b82f6', verifier: '#10b981', documenter: '#f59e0b',
  analyst: '#a855f7', reviewer: '#14b8a6', tester: '#84cc16', conversation: '#6366f1',
  planning: '#eab308', 'security-agent': '#ef4444', 'performance-agent': '#f97316',
  'documentation-agent': '#22c55e', 'refactoring-agent': '#0ea5e9', 'release-agent': '#a78bfa',
  'dashboard-curator': '#06b6d4', frontend: '#ec4899',
};

const ROLE_ICONS: Record<string, string> = {
  architect: '🏛️', developer: '💻', verifier: '✓', documenter: '📝', analyst: '🔍',
  reviewer: '👁️', tester: '🧪', conversation: '💬', planning: '📋',
  'security-agent': '🛡️', 'performance-agent': '⚡', 'documentation-agent': '📄',
  'refactoring-agent': '🔄', 'release-agent': '📦', 'dashboard-curator': '📊', frontend: '🎨',
};

export default function OpsRightSidebar({
  agentStatuses, expandedAgent, setExpandedAgent, agentFilter, setAgentFilter,
  activeAgentCount, totalRegistered, executions,
  page = 1, pageSize = 20, onPageChange,
}: OpsRightSidebarProps) {
  const filtered = agentFilter === 'all' ? agentStatuses
    : agentFilter === 'active' ? agentStatuses.filter((a: any) => a.isRunning)
    : agentStatuses.filter((a: any) => !a.isRunning);

  return (
    <aside className="flex flex-col gap-6">
      <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-(--vestara-text-muted) uppercase tracking-wider">Agents</h3>
          <span className="text-[10px] text-(--vestara-green)">{activeAgentCount} active</span>
        </div>
        <div className="flex gap-1 mb-3">
          {(['all', 'active', 'offline'] as const).map((filter) => (
            <button key={filter} onClick={() => setAgentFilter(filter)}
              className={`text-[9px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                agentFilter === filter
                  ? 'bg-(--vestara-accent-bg) text-(--vestara-text) font-medium border border-(--vestara-accent-border)'
                  : 'text-(--vestara-text-muted) hover:text-(--vestara-text)'
              }`}>
              {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : 'Offline'}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-xs text-(--vestara-text-muted) text-center py-4">No agents match filter</div>
          )}
          {filtered.slice((page - 1) * pageSize, page * pageSize).map((agent: any) => {
            const color = ROLE_COLORS[agent.role] || agent.color || '#6b7280';
            const running = agent.isRunning;
            const isExpanded = expandedAgent === agent.role;
            const recentExecs = executions.filter((e: any) => e.agentId === agent.id || agent.id?.includes(e.agentId)).slice(0, 3);
            return (
              <div key={agent.id || agent.role}>
                <div className="bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg overflow-hidden cursor-pointer hover:border-(--vestara-accent-border-hover) transition-colors"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.role)}
                  style={{ borderLeftColor: color, borderLeftWidth: '3px' }}>
                  <div className="p-3 flex items-center gap-3">
                    <div className="relative shrink-0">
                      <span className="text-base">{ROLE_ICONS[agent.role] || '🤖'}</span>
                      {running && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-(--vestara-green) animate-pulse" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-(--vestara-text) truncate">{agent.name || agent.role}</div>
                      <div className="text-[9px] text-(--vestara-text-muted) capitalize">{agent.role}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] ${running ? 'text-(--vestara-green)' : 'text-(--vestara-text-muted)'}`}>
                        {running ? 'active' : agent.lastStatus || 'idle'}
                      </span>
                      <span className={`text-[9px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                    </div>
                  </div>
                </div>
                {isExpanded && recentExecs.length > 0 && (
                  <div className="border border-(--vestara-accent-border) border-t-0 rounded-b-lg bg-(--vestara-accent-bg) p-2 space-y-1.5">
                    {recentExecs.map((exec: any) => (
                      <div key={exec.id} className="flex items-center gap-2 text-[10px]">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${exec.status === 'completed' ? 'bg-(--vestara-green)' : exec.status === 'failed' ? 'bg-(--vestara-red)' : exec.status === 'running' ? 'bg-amber-400 animate-pulse' : 'bg-(--vestara-text-dim)'}`} />
                        <span className="text-(--vestara-text-2) truncate flex-1">{exec.task?.slice(0, 50)}</span>
                        <span className="text-(--vestara-text-dim)">{exec.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {filtered.length > pageSize && onPageChange && (
          <div className="border-t border-(--vestara-accent-border) pt-2 mt-2">
            <Pagination current={page} total={filtered.length} pageSize={pageSize} onChange={onPageChange} />
          </div>
        )}
      </div>
    </aside>
  );
}
