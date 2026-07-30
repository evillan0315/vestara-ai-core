import { useTelemetryStore } from '../../contexts/TelemetryContext';

const AGENT_COLORS: Record<string, string> = {
  context: '#6b7280', planner: '#3b82f6', engineer: '#10b981',
  reviewer: '#8b5cf6', verifier: '#f59e0b',
};

const AGENT_ICONS: Record<string, string> = {
  context: '🔍', planner: '📋', engineer: '💻', reviewer: '👁️', verifier: '✓',
};

const STATUS_ICONS: Record<string, { icon: string; color: string; animate: boolean }> = {
  idle:       { icon: '○', color: '#52525b', animate: false },
  thinking:   { icon: '◌', color: '#3b82f6', animate: true },
  working:    { icon: '●', color: '#10b981', animate: true },
  waiting:    { icon: '◉', color: '#f59e0b', animate: false },
  reviewing:  { icon: '◆', color: '#8b5cf6', animate: true },
  verifying:  { icon: '◆', color: '#f59e0b', animate: true },
  completed:  { icon: '✓', color: '#10b981', animate: false },
  failed:     { icon: '✗', color: '#ef4444', animate: false },
};

function ProgressBar({ pct, active }: { pct: number; active: boolean }) {
  const w = 14;
  const filled = Math.round((pct / 100) * w);
  const bg = active ? '#10b981' : '#27272a';
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="h-1.5 rounded-full flex-1" style={{ background: '#18181b' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: bg }} />
      </div>
      <span className="text-[9px] font-mono" style={{ color: active ? '#a1a1aa' : '#52525b' }}>{pct}%</span>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return '<1s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export default function AgentTelemetryCard({ agentId }: { agentId: string }) {
  const store = useTelemetryStore();
  const agent = store.getAgent(agentId);
  if (!agent) return null;

  const color = AGENT_COLORS[agent.id] || '#6b7280';
  const icon = AGENT_ICONS[agent.id] || '🤖';
  const statusMeta = STATUS_ICONS[agent.status] || STATUS_ICONS.idle;
  const isActive = agent.status === 'working' || agent.status === 'verifying' || agent.status === 'thinking' || agent.status === 'reviewing';
  const recentEvents = store.getEventsByAgent(agentId).slice(0, 3);

  return (
    <div
      className="bg-(--vestara-accent-bg) border rounded-lg overflow-hidden transition-all duration-300"
      style={{
        borderColor: isActive ? color : 'var(--vestara-accent-border)',
        borderLeftWidth: '3px',
        borderLeftColor: color,
      }}
    >
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-center gap-2.5 mb-2">
          <div className="relative shrink-0">
            <span className="text-base">{icon}</span>
            {isActive && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-pulse"
                style={{ background: statusMeta.color }}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-(--vestara-text)">{agent.name}</span>
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded"
                style={{
                  color: statusMeta.color,
                  background: `${statusMeta.color}15`,
                }}
              >
                {statusMeta.icon} {agent.status}
              </span>
            </div>
            {agent.currentTask && (
              <div className="text-[10px] text-(--vestara-text-muted) truncate mt-0.5">
                {agent.currentTask}
              </div>
            )}
          </div>
        </div>

        {/* Active file */}
        {agent.activeFilePath && (
          <div className="text-[9px] font-mono text-(--vestara-text-2) truncate mb-1.5 pl-7">
            {agent.activeFilePath}
          </div>
        )}

        {/* Progress bar */}
        {(isActive || agent.progress > 0) && (
          <div className="pl-7">
            <ProgressBar pct={agent.progress} active={isActive} />
          </div>
        )}

        {/* Phase + elapsed */}
        {(agent.phase || agent.elapsedMs > 0) && (
          <div className="flex items-center gap-3 mt-1.5 pl-7">
            {agent.phase && (
              <span className="text-[9px] text-(--vestara-text-dim) uppercase tracking-wider">
                {agent.phase}
              </span>
            )}
            {agent.elapsedMs > 0 && (
              <span className="text-[9px] font-mono text-(--vestara-text-dim)">
                {formatElapsed(agent.elapsedMs)}
              </span>
            )}
          </div>
        )}

        {/* Recent operations */}
        {recentEvents.length > 0 && !isActive && (
          <div className="mt-2 pt-2 border-t border-(--vestara-accent-border) space-y-1 pl-7">
            {recentEvents.map((ev, i) => (
              <div key={`${ev.id}-${i}`} className="flex items-center gap-1.5 text-[9px] text-(--vestara-text-muted)">
                <span className="w-1 h-1 rounded-full shrink-0" style={{ background: statusMeta.color }} />
                <span className="truncate">{ev.detail || ev.operation}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
