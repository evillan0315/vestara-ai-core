import type { SprintData, TaskData } from './types';

interface SprintCarouselProps {
  sprints: SprintData[];
  tasks: TaskData[];
}

function ProgressBar({ pct, size }: { pct: number; size?: string }) {
  return (
    <div className={`w-full bg-(--vestara-accent-bg) rounded-full overflow-hidden ${size === 'sm' ? 'h-1' : 'h-1.5'}`}>
      <div className="h-full rounded-full bg-(--vestara-accent)" style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function SprintCarousel({ sprints, tasks }: SprintCarouselProps) {
  if (sprints.length === 0) return null;

  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1 h-3 rounded-full bg-cyan-500/60 shrink-0" />
        <h3 className="text-[9px] font-semibold text-(--vestara-text-muted) uppercase tracking-widest">Sprints</h3>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {sprints.map((s) => {
          const sprintTasks = tasks.filter((t) => t.sprintId === s.id);
          const sprintDone = sprintTasks.filter((t) => t.status === 'done').length;
          const sprintPct = sprintTasks.length > 0 ? Math.round((sprintDone / sprintTasks.length) * 100) : 0;
          const isActive = s.status === 'active';
          return (
            <div
              key={s.id}
              className="p-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg min-w-45 shrink-0 border-l-[3px] relative"
              style={{ borderLeftColor: isActive ? '#10b981' : s.status === 'completed' ? '#3b82f6' : '#6b7280' }}
            >
              {isActive && (
                <span className="absolute top-1.5 right-1.5 text-[7px] px-1 py-0.5 rounded bg-green-400/10 text-green-400 uppercase font-medium">Active</span>
              )}
              <div className="text-xs text-(--vestara-text) font-medium pr-10">{s.name}</div>
              <div className={`text-[8px] uppercase font-medium ${isActive ? 'text-green-400' : 'text-(--vestara-text-muted)'}`}>
                {s.status.replace('_', ' ')}
              </div>
              <div className="text-[8px] text-(--vestara-text-dim) mt-0.5">
                {new Date(s.startDate).toLocaleDateString()} – {new Date(s.endDate).toLocaleDateString()}
              </div>
              {s.goal && <div className="text-[8px] text-(--vestara-text-2) mt-1 truncate">{s.goal}</div>}
              {sprintTasks.length > 0 && (
                <div className="mt-1.5">
                  <ProgressBar pct={sprintPct} size="sm" />
                  <div className="text-[7px] text-(--vestara-text-dim) mt-0.5">{sprintDone}/{sprintTasks.length} tasks</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
