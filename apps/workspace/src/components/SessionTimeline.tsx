import { Timeline, type TimelineTone } from '@vestara/ui';

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

const STATUS_TONE: Record<string, TimelineTone> = {
  completed: 'success',
  running: 'accent',
  failed: 'error',
  skipped: 'muted',
  pending: 'muted',
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
    <Timeline
      className="space-y-3"
      items={allEntries.map((entry: any, i: number) => {
        const icon = STATUS_ICONS[entry.status] || '○';
        const color = STATUS_COLORS[entry.status] || 'text-zinc-700';
        const label = STEP_LABELS[entry.step] || entry.step?.replace(/-/g, ' ') || 'Unknown Step';
        const time = formatTime(entry.timestamp);
        return {
          id: `${i}`,
          tone: STATUS_TONE[entry.status] ?? 'muted',
          title: (
            <div className="flex items-center gap-1.5">
              <span className={`text-[11px] font-medium ${color}`}>{icon}</span>
              <span
                className={`text-xs ${entry.status === 'completed' ? 'text-zinc-300' : entry.status === 'running' ? 'text-blue-300' : entry.status === 'failed' ? 'text-red-300' : 'text-zinc-500'}`}
              >
                {compact && i === 0 ? 'Started' : label}
              </span>
              <span className="text-[9px] text-zinc-700 ml-auto shrink-0">{time}</span>
            </div>
          ),
          meta:
            !compact && entry.agentId && entry.agentId !== 'system' ? (
              <div className="text-[9px] text-zinc-600 mt-0.5 ml-3.5">by {entry.agentId}</div>
            ) : undefined,
        };
      })}
    />
  );
}
