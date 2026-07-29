import { useState } from 'react';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';

interface ProjectsSectionProps {
  projects: Record<string, unknown>[];
  dragSection: DragSectionProps;
  onRefresh: () => void;
}

export default function ProjectsSection({ projects, dragSection, onRefresh }: ProjectsSectionProps) {
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [projectTasks, setProjectTasks] = useState<Record<string, Record<string, unknown>[]>>({});

  return (
    <DashboardSection title="Projects" icon="▤" dragSection={dragSection}>
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-5 bg-primary-900/50 border border-zinc-800 rounded-lg text-center">
          <div className="text-lg mb-1 opacity-20">▤</div>
          <p className="text-[10px] text-zinc-700">No projects</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projects.slice(0, 4).map((p) => {
            const sc = (p.stats as { total: number; done: number; inProgress: number }) || {
              total: 0,
              done: 0,
              inProgress: 0,
            };
            const pct = sc.total > 0 ? Math.round((sc.done / sc.total) * 100) : 0;
            const statusColors: Record<string, string> = {
              active: '#10b981',
              planning: '#f59e0b',
              completed: '#3b82f6',
            };
            const isExpanded = expandedProject === p.id;
            const tasks = projectTasks[p.id as string] || [];
            return (
              <div key={p.id as string}>
                <div
                  onClick={async () => {
                    if (isExpanded) {
                      setExpandedProject(null);
                      return;
                    }
                    setExpandedProject(p.id as string);
                    if (!projectTasks[p.id as string]) {
                      const d = await fetch(`/api/projects/${p.id}`).then((r) => (r.ok ? r.json() : null));
                      if (d) setProjectTasks((prev) => ({ ...prev, [p.id as string]: d.tasks || [] }));
                    }
                  }}
                  className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors cursor-pointer border-l-[3px]"
                  style={{ borderLeftColor: statusColors[p.status as string] || '#6b7280' }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-zinc-200 truncate font-medium flex-1">{p.name as string}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-zinc-600">
                        {sc.total} tasks · {sc.done} done
                      </span>
                      <span
                        className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-medium ${(p.status as string) === 'active' ? 'bg-green-400/10 text-green-400' : (p.status as string) === 'planning' ? 'bg-amber-400/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}
                      >
                        {p.status as string}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-1">
                    <div className="h-1 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {isExpanded && tasks.length > 0 && (
                  <div className="ml-3 mt-1 border-l-2 border-zinc-800 pl-3 space-y-0.5">
                    {tasks
                      .filter((t) => t.status !== 'done')
                      .slice(0, 5)
                      .map((t) => (
                        <div key={t.id as string} className="flex items-center gap-2 text-[10px] py-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === 'high' || t.priority === 'critical' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-zinc-600'}`}
                          />
                          <span className="text-zinc-400 truncate flex-1">{t.title as string}</span>
                          <select
                            value={t.status as string}
                            onChange={async (e) => {
                              await fetch(`/api/tasks/${t.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: e.target.value }),
                              });
                              onRefresh();
                            }}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-500 rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
                          >
                            <option value="backlog">Backlog</option>
                            <option value="ready">Ready</option>
                            <option value="in_progress">Doing</option>
                            <option value="review">Review</option>
                            <option value="done">Done</option>
                          </select>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
          <a
            href="/projects"
            className="block text-[10px] text-zinc-600 text-center py-1.5 hover:text-zinc-400 transition-colors rounded-lg bg-zinc-900/30 border border-zinc-800"
          >
            All Projects →
          </a>
        </div>
      )}
    </DashboardSection>
  );
}
