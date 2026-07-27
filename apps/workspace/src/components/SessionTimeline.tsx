const STATUS_ICONS: Record<string, string> = {
  completed: '✔',
  running: '◉',
  failed: '✗',
  skipped: '○',
  pending: '○',
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-500',
  running: 'text-blue-400',
  failed: 'text-red-400',
  skipped: 'text-zinc-600',
  pending: 'text-zinc-700',
};

const STEP_LABELS: Record<string, string> = {
  repository: 'Repository Opened',
  workspace: 'Workspace Analyzed',
  explain: 'Architecture Explained',
  analyst: 'Repository Analysis',
  architect: 'Architecture Designed',
  planner: 'Plan Generated',
  plan: 'Plan Created',
  developer: 'Implementation Started',
  tester: 'Test Generation',
  reviewer: 'Code Review',
  verifier: 'Verification',
  'security-agent': 'Security Scan',
  'performance-agent': 'Performance Benchmark',
  'documentation-agent': 'Documentation Updated',
  documenter: 'Documentation Generated',
  'refactoring-agent': 'Refactoring Applied',
  'release-agent': 'Release Prepared',
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function SessionTimeline({ session, compact }: { session?: any; compact?: boolean }) {
  if (!session) return null;
  const entries = session.timeline || [];

  if (entries.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-[10px] text-zinc-600">No timeline entries yet</p>
        <p className="text-[9px] text-zinc-700 mt-0.5">Timeline will populate as agents execute</p>
      </div>
    );
  }

  // Add session start as first entry
  const allEntries = [
    { step: 'session', status: 'completed', timestamp: session.createdAt, agentId: 'system' } as any,
    ...entries,
  ];

  return (
    <div className="space-y-0">
      {allEntries.map((entry: any, i: number) => {
        const icon = STATUS_ICONS[entry.status] || '○';
        const color = STATUS_COLORS[entry.status] || 'text-zinc-700';
        const label = STEP_LABELS[entry.step] || entry.step?.replace(/-/g, ' ') || 'Unknown Step';
        const time = formatTime(entry.timestamp);

        return (
          <div key={i} className="flex gap-3">
            {/* Timeline bar */}
            <div className="flex flex-col items-center w-4 shrink-0">
              <div
                className={`w-2 h-2 rounded-full mt-1.5 ${entry.status === 'completed' ? 'bg-green-500' : entry.status === 'running' ? 'bg-blue-400 animate-pulse' : entry.status === 'failed' ? 'bg-red-500' : 'bg-zinc-700'}`}
              />
              {i < allEntries.length - 1 && <div className="w-px flex-1 bg-zinc-800 min-h-[20px]" />}
            </div>
            {/* Content */}
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-medium ${color}`}>{icon}</span>
                <span
                  className={`text-xs ${entry.status === 'completed' ? 'text-zinc-300' : entry.status === 'running' ? 'text-blue-300' : entry.status === 'failed' ? 'text-red-300' : 'text-zinc-500'}`}
                >
                  {compact && i === 0 ? 'Started' : label}
                </span>
                <span className="text-[9px] text-zinc-700 ml-auto shrink-0">{time}</span>
              </div>
              {!compact && entry.agentId && entry.agentId !== 'system' && (
                <div className="text-[9px] text-zinc-600 mt-0.5 ml-3.5">by {entry.agentId}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
