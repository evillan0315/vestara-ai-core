const STAGES = [
  { id: 'workspace', label: 'Workspace', icon: '◈' },
  { id: 'explanation', label: 'Explanation', icon: '?' },
  { id: 'plan', label: 'Plan', icon: '△' },
  { id: 'changeset', label: 'Change Set', icon: '◇' },
  { id: 'verification', label: 'Verification', icon: '✓' },
  { id: 'evidence', label: 'Evidence', icon: '⟐' },
];

const STATUS_COLORS: Record<string, string> = {
  completed: '#22c55e',
  running: '#3b82f6',
  failed: '#ef4444',
  pending: '#27272a',
};

const STATUS_BG: Record<string, string> = {
  completed: 'rgba(34, 197, 94, 0.1)',
  running: 'rgba(59, 130, 246, 0.1)',
  failed: 'rgba(239, 68, 68, 0.1)',
  pending: 'transparent',
};

function matchStageStatus(stageId: string, session: any): string {
  if (!session || !session.timeline) return 'pending';
  const stageMap: Record<string, string[]> = {
    workspace: ['repository', 'workspace'],
    explanation: ['explain', 'analyst', 'analysis'],
    plan: ['plan', 'architect', 'planner'],
    changeset: ['implement', 'developer', 'refactoring-agent'],
    verification: ['verify', 'tester', 'reviewer', 'verifier'],
    evidence: ['release', 'release-agent', 'documentation-agent'],
  };
  const matchingRoles = stageMap[stageId] || [stageId];
  for (const role of matchingRoles) {
    const entry = session.timeline.find(
      (t: any) => t.step?.toLowerCase().includes(role) || role.includes(t.step?.toLowerCase() || ''),
    );
    if (entry) return entry.status;
  }
  const lastCompleted = session.timeline.filter((t: any) => t.status === 'completed');
  const stageIndex = STAGES.findIndex((s) => s.id === stageId);
  const lastCompletedIndex = STAGES.findIndex((s) =>
    lastCompleted.some((t: any) => {
      const roles = stageMap[s.id] || [s.id];
      return roles.some((r: string) => t.step?.toLowerCase().includes(r) || r.includes(t.step?.toLowerCase() || ''));
    }),
  );
  if (stageIndex <= lastCompletedIndex) return 'completed';
  return 'pending';
}

export default function WorkflowPipeline({ session, compact }: { session?: any; compact?: boolean }) {
  if (!session) return null;
  const stepCount = session.metrics ? `${session.metrics.completedSteps}/${session.metrics.totalSteps}` : '';

  return (
    <div className={`bg-zinc-900/50 border border-zinc-800 rounded-lg ${compact ? 'p-2' : 'p-3'} mb-4`}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[10px] text-zinc-600 min-w-0">
            {session.goal && <span className="text-zinc-300 font-medium text-xs truncate">{session.goal}</span>}
            {session.status && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-semibold shrink-0 ${
                  session.status === 'completed'
                    ? 'bg-green-400/10 text-green-400'
                    : session.status === 'running'
                      ? 'bg-blue-400/10 text-blue-400 animate-pulse'
                      : session.status === 'failed'
                        ? 'bg-red-400/10 text-red-400'
                        : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {session.status}
              </span>
            )}
          </div>
          {stepCount && <div className="text-[9px] text-zinc-700 shrink-0">{stepCount} steps</div>}
        </div>
      )}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const status = matchStageStatus(stage.id, session);
          const color = STATUS_COLORS[status];
          const bg = STATUS_BG[status];
          return (
            <div key={stage.id} className="flex items-center flex-1 min-w-0">
              <div
                className="flex items-center gap-1 px-2 py-1.5 rounded text-[10px] transition-all flex-1 justify-center"
                style={{ backgroundColor: bg, border: `1px solid ${status === 'pending' ? '#27272a' : color}` }}
              >
                <span style={{ color }}>{stage.icon}</span>
                {!compact && (
                  <span
                    className="hidden sm:inline truncate"
                    style={{ color: status === 'pending' ? '#52525b' : color }}
                  >
                    {stage.label}
                  </span>
                )}
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className="w-2 h-px shrink-0"
                  style={{ backgroundColor: status === 'pending' ? '#27272a' : color }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { matchStageStatus, STAGES };
