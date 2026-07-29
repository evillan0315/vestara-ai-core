import type { MilestoneResponse } from '../../../components/dashboard/constants';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface ActiveDevSectionProps {
  activeMilestones: MilestoneResponse['milestones'];
  upcomingMilestones: MilestoneResponse['milestones'];
  updateMilestoneStatus: (version: string, status: string) => Promise<void>;
  dragSection: DragSectionProps;
}

export default function ActiveDevSection({
  activeMilestones,
  upcomingMilestones,
  updateMilestoneStatus,
  dragSection,
}: ActiveDevSectionProps) {
  if (activeMilestones.length === 0 && upcomingMilestones.length === 0) {
    return (
      <DashboardSection title="Active Development" icon="△" dragSection={dragSection}>
        <div className="flex flex-col items-center justify-center p-5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
          <div className="text-lg mb-1 opacity-20">🎯</div>
          <p className="text-[10px] text-zinc-700">All milestones completed</p>
        </div>
      </DashboardSection>
    );
  }

  return (
    <DashboardSection title="Active Development" icon="△" dragSection={dragSection}>
      <div className="space-y-2">
        {activeMilestones.map((m) => (
          <div
            key={m.version}
            className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-l-[3px] rounded-lg"
            style={{ borderLeftColor: '#f59e0b', borderColor: '#27272a' }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-xs font-semibold text-amber-400">{m.version}</span>
                <span className="text-sm text-zinc-200">{m.name}</span>
                <select
                  value={m.status}
                  onChange={(e) => updateMilestoneStatus(m.version, e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{m.description}</div>
            </div>
          </div>
        ))}
        {upcomingMilestones.length > 0 && (
          <>
            <div className="text-[9px] text-zinc-600 uppercase tracking-widest pt-1 px-1">Next Up</div>
            <div className="space-y-1">
              {upcomingMilestones.map((m) => (
                <div
                  key={m.version}
                  className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-zinc-800/20 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
                  <span className="text-[9px] font-mono text-zinc-600 w-14">{m.version}</span>
                  <span className="text-[10px] text-zinc-500 flex-1 truncate">{m.name}</span>
                  <select
                    value={m.status}
                    onChange={(e) => updateMilestoneStatus(m.version, e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-500 rounded text-[7px] px-1 py-0.5 outline-none cursor-pointer"
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                  <span className="text-[8px] text-zinc-700 bg-zinc-800/50 rounded px-1 py-0.5">{m.era}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </DashboardSection>
  );
}
