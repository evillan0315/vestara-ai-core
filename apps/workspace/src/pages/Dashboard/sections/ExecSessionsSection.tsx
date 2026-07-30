import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface ExecSessionsSectionProps {
  execSessions: Record<string, unknown>[];
  dragSection: DragSectionProps;
}

export default function ExecSessionsSection({ execSessions, dragSection }: ExecSessionsSectionProps) {
  if (execSessions.length === 0) return null;

  return (
    <DashboardSection title="Execution Sessions" icon="▶" dragSection={dragSection}>
      <div className="space-y-1.5">
        {execSessions.slice(0, 5).map((s) => (
          <div
            key={s.id as string}
            className="flex items-center gap-3 p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-hover) transition-colors border-l-[3px]"
            style={{
              borderLeftColor: s.status === 'completed' ? '#10b981' : s.status === 'failed' ? '#ef4444' : '#f59e0b',
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-(--vestara-text) truncate font-medium">{s.goal as string}</div>
              <div className="flex gap-2 text-[9px] text-(--vestara-text-muted)">
                <span>
                  {(s.metrics as Record<string, number>)?.completedSteps ?? 0}/
                  {(s.metrics as Record<string, number>)?.totalSteps ?? 0} steps
                </span>
                <span>· {(s.assignedAgentIds as unknown[])?.length ?? 0} agents</span>
              </div>
            </div>
            <span
              className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${s.status === 'completed' ? 'bg-green-400/10 text-green-400' : s.status === 'failed' ? 'bg-red-400/10 text-red-400' : 'bg-amber-400/10 text-amber-400'}`}
            >
              {s.status as string}
            </span>
          </div>
        ))}
      </div>
    </DashboardSection>
  );
}
