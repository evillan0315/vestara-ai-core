import { useState } from 'react';
import { MarketplaceEmptyState } from '../../Marketplace/MarketplaceLayout-components.js';
import type { DragSectionProps } from '../DashboardSection';
import DashboardSection from '../DashboardSection';
import { DashPill, DashProgress, DashTile, enterDelay } from '../dashPremium';

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
        <MarketplaceEmptyState message="No projects yet." />
      ) : (
        <ul className="space-y-1">
          {projects.slice(0, 4).map((p, i) => {
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
            const accent = statusColors[p.status as string] || '#6b7280';
            return (
              <li key={p.id as string} className="mpg-enter" style={enterDelay(i)}>
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
                  className="mpg-category-row group cursor-pointer"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-3">
                    <DashTile accent={accent}>▤</DashTile>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--vestara-text-primary)]">
                        {p.name as string}
                      </span>
                      <span className="block truncate text-[11px] text-[var(--vestara-text-muted)]">
                        {sc.total} tasks · {sc.done} done
                      </span>
                      <span className="mt-1 block">
                        <DashProgress value={pct} color={accent} />
                      </span>
                    </span>
                  </span>
                  <DashPill dot={accent}>{p.status as string}</DashPill>
                </div>
                {isExpanded && tasks.length > 0 && (
                  <div className="ml-3 mt-1 border-l-2 border-(--vestara-accent-border) pl-3 space-y-0.5">
                    {tasks
                      .filter((t) => t.status !== 'done')
                      .slice(0, 5)
                      .map((t) => (
                        <div key={t.id as string} className="flex items-center gap-2 text-[10px] py-0.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.priority === 'high' || t.priority === 'critical' ? 'bg-red-400' : t.priority === 'medium' ? 'bg-amber-400' : 'bg-zinc-600'}`}
                          />
                          <span className="text-(--vestara-text-2) truncate flex-1">{t.title as string}</span>
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
                            className="bg-zinc-800 border border-zinc-700 text-(--vestara-text-2) rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
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
              </li>
            );
          })}
        </ul>
      )}
      {projects.length > 0 && (
        <div className="mt-2 text-center">
          <a href="/projects" className="mpg-link">
            All Projects<span aria-hidden="true"> ›</span>
          </a>
        </div>
      )}
    </DashboardSection>
  );
}
