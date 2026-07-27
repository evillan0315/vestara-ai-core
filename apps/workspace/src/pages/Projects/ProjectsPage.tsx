import { useCallback, useEffect, useState } from 'react';
import { ProjectData, TaskData, SprintData } from './types';
import { BOARD_COLUMNS, PRIORITY_COLORS, STATUS_COLORS, STATUS_OPTIONS } from './contanst';

function progressColor(pct: number): string {
  if (pct >= 70) return '#10b981';
  if (pct >= 30) return '#f59e0b';
  return '#ef4444';
}

async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return r.ok ? r.json() : null;
}

function StatCard({
  label,
  value,
  sub,
  accent = '#52525b',
  compact,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`text-center bg-zinc-800/50 border border-zinc-700 rounded-lg border-l-2 ${compact ? 'p-1.5' : 'p-2'}`}
      style={{ borderLeftColor: accent }}
    >
      <div
        className={`font-bold ${compact ? 'text-xs' : 'text-lg'}`}
        style={{ color: Number(value) > 0 ? accent : '#52525b' }}
      >
        {value}
      </div>
      <div className="text-[9px] text-zinc-600">{label}</div>
      {sub && <div className="text-[8px] text-zinc-700 mt-0.5">{sub}</div>}
    </div>
  );
}

function ProgressBar({ pct, size = 'sm' }: { pct: number; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 'h-2' : size === 'md' ? 'h-1.5' : 'h-1';
  const color = progressColor(pct);
  return (
    <div className={`w-full bg-zinc-800 rounded-full ${h}`}>
      <div
        className={`${h} rounded-full transition-all`}
        style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [selected, setSelected] = useState<ProjectData | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [sprints, setSprints] = useState<SprintData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [taskFilter, setTaskFilter] = useState('active');
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskSprint, setNewTaskSprint] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');

  const load = useCallback(async () => {
    const d = await api('/api/projects');
    if (d) setProjects(d.projects ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectProject = async (p: ProjectData) => {
    setSelected(p);
    setShowNewTask(false);
    setExpandedTask(null);
    setShowDone(false);
    setNewTaskSprint('');
    setNewTaskDescription('');
    const d = await api(`/api/projects/${p.id}`);
    if (d) {
      setTasks(d.tasks ?? []);
      setSprints(d.sprints ?? []);
    }
  };

  const createProject = async () => {
    if (!newName.trim()) return;
    const d = await api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({ name: newName, description: newDescription }),
    });
    if (d) {
      setShowNew(false);
      setNewName('');
      setNewDescription('');
      load();
    }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    await api(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (selected) selectProject(selected);
  };

  const deleteTask = async (taskId: string) => {
    if (!window.confirm('Delete this task?')) return;
    await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (selected) selectProject(selected);
  };

  const createTask = async () => {
    if (!newTaskTitle.trim() || !selected) return;
    const body: Record<string, string> = {
      title: newTaskTitle,
      priority: newTaskPriority,
    };
    if (newTaskSprint) body.sprintId = newTaskSprint;
    if (newTaskDescription) body.description = newTaskDescription;
    await api(`/api/projects/${selected.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    setNewTaskTitle('');
    setNewTaskPriority('medium');
    setNewTaskSprint('');
    setNewTaskDescription('');
    setShowNewTask(false);
    if (selected) selectProject(selected);
  };

  const changeProjectStatus = async (status: string) => {
    if (!selected) return;
    await fetch(`/api/projects/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    load();
    setSelected({ ...selected, status });
  };

  const saveProjectEdit = async () => {
    if (!selected) return;
    const tags = editTags
      ? editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
      : [];
    await fetch(`/api/projects/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editName,
        description: editDescription,
        tags,
      }),
    });
    setEditingProject(false);
    load();
    setSelected({
      ...selected,
      name: editName,
      description: editDescription,
      tags,
    });
  };

  const activeFiltered = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'active') return t.status !== 'done' && t.status !== 'cancelled';
    if (taskFilter === 'done') return t.status === 'done';
    if (taskFilter === 'all') return true;
    return t.status === taskFilter;
  });
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const pct = selected?.stats?.total ? Math.round(((selected.stats?.done ?? 0) / selected.stats.total) * 100) : 0;

  const totalTasks = projects.reduce((s, p) => s + (p.stats?.total ?? 0), 0);
  const totalDone = projects.reduce((s, p) => s + (p.stats?.done ?? 0), 0);
  const totalActive = projects.reduce((s, p) => s + (p.stats?.inProgress ?? 0), 0);
  const overallPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  const filteredProjects = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags?.some((t) => t.toLowerCase().includes(q))
    );
  });

  if (loading)
    return (
      <div className="w-full px-4 animate-pulse">
        <div className="mb-4">
          <div className="h-8 w-56 bg-zinc-800 rounded mb-2" />
          <div className="h-4 w-40 bg-zinc-800/50 rounded" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-zinc-800/30 rounded-lg" />
            ))}
          </div>
          <div className="lg:col-span-2">
            <div className="h-64 bg-zinc-800/20 rounded-lg" />
          </div>
        </div>
      </div>
    );

  return (
    <div className="w-full px-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Projects</h1>
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {projects.length} projects · {projects.filter((p) => p.status === 'active').length} active · {totalTasks}{' '}
            tasks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-700 text-[9px]">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter projects..."
              className="w-40 bg-zinc-800 border border-zinc-700 rounded-lg pl-6 pr-2 py-1.5 text-[10px] text-zinc-300 placeholder-zinc-700 outline-none focus:border-zinc-500"
            />
          </div>
          <button onClick={load} className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm" title="Refresh">
            ↻
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="text-[10px] px-3 py-1.5 accent-btn rounded-lg cursor-pointer flex items-center gap-1"
          >
            <span>+</span> New Project
          </button>
        </div>
      </div>

      {/* Aggregate stats */}
      {projects.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          <StatCard label="Total Projects" value={projects.length} accent="#8b5cf6" compact />
          <StatCard
            label="Active"
            value={projects.filter((p) => p.status === 'active').length}
            accent="#10b981"
            compact
          />
          <StatCard
            label="On Hold"
            value={projects.filter((p) => p.status === 'on_hold').length}
            accent="#ef4444"
            compact
          />
          <StatCard label="Total Tasks" value={totalTasks} accent="#3b82f6" compact />
          <StatCard
            label="Completion"
            value={`${overallPct}%`}
            sub={`${totalDone}/${totalTasks} tasks`}
            accent={progressColor(overallPct)}
            compact
          />
        </div>
      )}

      {/* New project modal */}
      {showNew && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowNew(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-7xl mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <span className="text-accent">+</span> New Project
              </h2>
              <button
                onClick={() => setShowNew(false)}
                className="text-zinc-600 hover:text-zinc-400 cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Project name..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 outline-none focus:border-accent"
                  onKeyDown={(e) => e.key === 'Enter' && createProject()}
                />
              </div>
              <div>
                <label className="text-[9px] text-zinc-500 uppercase tracking-widest mb-1 block">Description</label>
                <input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Optional description..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-zinc-800">
              <button
                onClick={createProject}
                disabled={!newName.trim()}
                className="flex-1 text-[10px] px-3 py-1.5 accent-btn rounded-lg disabled:opacity-30 cursor-pointer"
              >
                Create
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="text-[10px] px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-700 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {projects.length === 0 && !showNew && (
        <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center">
          <div className="text-3xl mb-3 opacity-10">◈</div>
          <p className="text-sm text-zinc-600 mb-1">No projects yet</p>
          <p className="text-[10px] text-zinc-700 mb-4">Create your first project to start tracking work</p>
          <button
            onClick={() => setShowNew(true)}
            className="text-[10px] px-4 py-1.5 accent-btn rounded-lg cursor-pointer"
          >
            + Create Project
          </button>
        </div>
      )}

      {projects.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Project list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[9px] text-zinc-600 mb-1 px-1">
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-3 rounded-full bg-zinc-500/60" />
                Projects ({filteredProjects.length})
              </span>
            </div>
            {filteredProjects.map((p) => {
              const s = p.stats || {
                total: 0,
                done: 0,
                inProgress: 0,
                backlog: 0,
              };
              const ppct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
              const activeCount = s.inProgress + s.backlog;
              const isSelected = selected?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => selectProject(p)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer border-l-[3px] ${isSelected ? 'bg-zinc-800 border-zinc-600' : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600'}`}
                  style={{
                    borderLeftColor: STATUS_COLORS[p.status] || '#6b7280',
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-zinc-200 font-medium truncate flex-1">{p.name}</span>
                    {p.priority === 'high' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-red-400/10 text-red-400 uppercase font-medium">
                        High
                      </span>
                    )}
                    {p.priority === 'critical' && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-red-400/20 text-red-400 uppercase font-medium">
                        Critical
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 text-[9px] text-zinc-600 mb-1.5 flex-wrap">
                    <span>{s.total} tasks</span>
                    {activeCount > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-amber-400">{activeCount} active</span>
                      </>
                    )}
                    {ppct > 0 && (
                      <>
                        <span>·</span>
                        <span className="text-green-400">{ppct}%</span>
                      </>
                    )}
                    <span
                      className="ml-auto text-[8px] uppercase px-1 py-0.5 rounded"
                      style={{
                        backgroundColor: `${STATUS_COLORS[p.status]}15`,
                        color: STATUS_COLORS[p.status] || '#6b7280',
                      }}
                    >
                      {p.status.replace('_', ' ')}
                    </span>
                  </div>
                  {p.tags && p.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-1.5">
                      {p.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[7px] px-1 py-0.5 bg-zinc-800 border border-zinc-700/50 rounded text-zinc-500"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <ProgressBar pct={ppct} />
                  <div className="text-[7px] text-zinc-700 mt-1">{new Date(p.createdAt).toLocaleDateString()}</div>
                </div>
              );
            })}
            {filteredProjects.length === 0 && search.trim() && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <div className="text-lg mb-1 opacity-20">🔍</div>
                <p className="text-[10px] text-zinc-700">No matching projects</p>
              </div>
            )}
          </div>

          {/* Detail view */}
          <div className="lg:col-span-2">
            {!selected && (
              <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/30 border border-zinc-800 rounded-lg text-center">
                <div className="text-3xl mb-3 opacity-10">◈</div>
                <p className="text-xs text-zinc-600">Select a project to view details</p>
              </div>
            )}
            {selected && (
              <div className="space-y-4">
                {/* Project header */}
                <div
                  className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg border-l-[3px]"
                  style={{
                    borderLeftColor: STATUS_COLORS[selected.status] || '#6b7280',
                  }}
                >
                  {editingProject ? (
                    <div className="space-y-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 outline-none focus:border-accent"
                      />
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-[10px] text-zinc-300 outline-none focus:border-accent resize-none"
                        placeholder="Description..."
                      />
                      <div>
                        <label className="text-[8px] text-zinc-600 uppercase tracking-widest block mb-0.5">
                          Tags (comma separated)
                        </label>
                        <input
                          value={editTags}
                          onChange={(e) => setEditTags(e.target.value)}
                          placeholder="frontend, api, ux"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-300 outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={saveProjectEdit}
                          className="text-[9px] px-2 py-1 accent-btn rounded cursor-pointer"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingProject(false)}
                          className="text-[9px] px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-700 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-lg font-semibold text-zinc-100 flex-1">{selected.name}</h2>
                        <div className="relative flex items-center">
                          <span
                            className="w-2 h-2 rounded-full absolute left-1.5"
                            style={{
                              backgroundColor: STATUS_COLORS[selected.status] || '#6b7280',
                            }}
                          />
                          <select
                            value={selected.status}
                            onChange={(e) => changeProjectStatus(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[9px] pl-4 pr-1.5 py-0.5 outline-none cursor-pointer appearance-none"
                          >
                            <option value="planning">Planning</option>
                            <option value="active">Active</option>
                            <option value="on_hold">On Hold</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                        <button
                          onClick={() => {
                            setEditingProject(true);
                            setEditName(selected.name);
                            setEditDescription(selected.description || '');
                            setEditTags((selected.tags ?? []).join(', '));
                          }}
                          className="text-[9px] text-zinc-600 hover:text-zinc-400 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                      {selected.description && <p className="text-[10px] text-zinc-500 mb-2">{selected.description}</p>}
                      {selected.tags?.length > 0 && (
                        <div className="flex gap-1 flex-wrap mb-2">
                          {selected.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[8px] px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded text-zinc-500"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-3 text-[9px] text-zinc-700 mb-2">
                        <span>Created {new Date(selected.createdAt).toLocaleDateString()}</span>
                        {selected.updatedAt && (
                          <span>· Updated {new Date(selected.updatedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                      {/* Stat cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3">
                        {[
                          {
                            label: 'Tasks',
                            value: selected.stats?.total ?? 0,
                            accent: '#52525b',
                          },
                          {
                            label: 'Done',
                            value: selected.stats?.done ?? 0,
                            accent: '#10b981',
                          },
                          {
                            label: 'Active',
                            value: selected.stats?.inProgress ?? 0,
                            accent: '#f59e0b',
                          },
                          {
                            label: 'Backlog',
                            value: selected.stats?.backlog ?? 0,
                            accent: '#6b7280',
                          },
                        ].map(({ label, value, accent }) => (
                          <StatCard key={label} label={label} value={value} accent={accent} />
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar pct={pct} size="md" />
                        <span className="text-[9px] text-zinc-600 shrink-0">{pct}%</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Sprints */}
                {sprints.length > 0 && (
                  <div className="p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-1 h-3 rounded-full bg-cyan-500/60 shrink-0" />
                      <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-widest">Sprints</h3>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                      {sprints.map((s) => {
                        const sprintTasks = tasks.filter((t) => t.sprintId === s.id);
                        const sprintDone = sprintTasks.filter((t) => t.status === 'done').length;
                        const sprintPct =
                          sprintTasks.length > 0 ? Math.round((sprintDone / sprintTasks.length) * 100) : 0;
                        const isActive = s.status === 'active';
                        return (
                          <div
                            key={s.id}
                            className="p-2.5 bg-zinc-800/50 border border-zinc-700 rounded-lg min-w-45 shrink-0 border-l-[3px] relative"
                            style={{
                              borderLeftColor: isActive ? '#10b981' : s.status === 'completed' ? '#3b82f6' : '#6b7280',
                            }}
                          >
                            {isActive && (
                              <span className="absolute top-1.5 right-1.5 text-[7px] px-1 py-0.5 rounded bg-green-400/10 text-green-400 uppercase font-medium">
                                Active
                              </span>
                            )}
                            <div className="text-xs text-zinc-300 font-medium pr-10">{s.name}</div>
                            <div
                              className={`text-[8px] uppercase font-medium ${isActive ? 'text-green-400' : 'text-zinc-600'}`}
                            >
                              {s.status.replace('_', ' ')}
                            </div>
                            <div className="text-[8px] text-zinc-700 mt-0.5">
                              {new Date(s.startDate).toLocaleDateString()} – {new Date(s.endDate).toLocaleDateString()}
                            </div>
                            {s.goal && <div className="text-[8px] text-zinc-600 mt-1 truncate">{s.goal}</div>}
                            {sprintTasks.length > 0 && (
                              <div className="mt-1.5">
                                <ProgressBar pct={sprintPct} size="sm" />
                                <div className="text-[7px] text-zinc-700 mt-0.5">
                                  {sprintDone}/{sprintTasks.length} tasks
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Task board */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1 h-3 rounded-full bg-amber-500/60 shrink-0" />
                      <h3 className="text-[9px] font-semibold text-zinc-600 uppercase tracking-widest">
                        Tasks ({filteredTasks.length})
                        {taskFilter === 'active' && doneTasks.length > 0 && (
                          <span className="text-zinc-700 font-normal ml-1">· {doneTasks.length} done</span>
                        )}
                      </h3>
                    </div>
                    <div className="flex gap-1">
                      {viewMode === 'list' && (
                        <select
                          value={taskFilter}
                          onChange={(e) => setTaskFilter(e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[9px] px-1.5 py-0.5 outline-none cursor-pointer"
                        >
                          <option value="active">Active ({activeFiltered.length})</option>
                          <option value="backlog">
                            Backlog ({tasks.filter((t) => t.status === 'backlog').length})
                          </option>
                          <option value="ready">Ready ({tasks.filter((t) => t.status === 'ready').length})</option>
                          <option value="in_progress">
                            Doing ({tasks.filter((t) => t.status === 'in_progress').length})
                          </option>
                          <option value="review">Review ({tasks.filter((t) => t.status === 'review').length})</option>
                          <option value="done">Done ({doneTasks.length})</option>
                          <option value="all">All ({tasks.length})</option>
                        </select>
                      )}
                      <button
                        onClick={() => setViewMode(viewMode === 'list' ? 'board' : 'list')}
                        className={`text-[9px] px-2 py-0.5 rounded cursor-pointer border transition-colors ${viewMode === 'board' ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}
                      >
                        {viewMode === 'list' ? '⊞ Board' : '☰ List'}
                      </button>
                      <button
                        onClick={() => setShowNewTask(true)}
                        className="text-[9px] px-2 py-0.5 accent-btn rounded cursor-pointer flex items-center gap-0.5"
                      >
                        <span>+</span> Add
                      </button>
                    </div>
                  </div>

                  {showNewTask && (
                    <div className="flex gap-2 mb-2 p-2 bg-zinc-800/30 border border-zinc-700 rounded-lg border-l-[3px] border-l-amber-500/30">
                      <div className="flex-1 space-y-1">
                        <input
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          placeholder="Task title..."
                          className="w-full bg-zinc-800 border border-zinc-700 rounded text-[10px] px-2 py-1.5 text-zinc-300 outline-none focus:border-accent"
                          onKeyDown={(e) => e.key === 'Enter' && createTask()}
                        />
                        <div className="flex gap-1.5 flex-wrap">
                          <select
                            value={newTaskPriority}
                            onChange={(e) => setNewTaskPriority(e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                          {sprints.length > 0 && (
                            <select
                              value={newTaskSprint}
                              onChange={(e) => setNewTaskSprint(e.target.value)}
                              className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer"
                            >
                              <option value="">No sprint</option>
                              {sprints.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <input
                          value={newTaskDescription}
                          onChange={(e) => setNewTaskDescription(e.target.value)}
                          placeholder="Description (optional)..."
                          className="w-full bg-zinc-800 border border-zinc-700 rounded text-[9px] px-2 py-1 text-zinc-400 outline-none focus:border-accent"
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={createTask}
                          disabled={!newTaskTitle.trim()}
                          className="text-[9px] px-2 py-1 accent-btn rounded disabled:opacity-30 cursor-pointer"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setShowNewTask(false);
                            setNewTaskDescription('');
                            setNewTaskSprint('');
                          }}
                          className="text-[9px] px-2 py-1 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-700 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  {/* List view */}
                  {viewMode === 'list' && (
                    <>
                      <div className="space-y-1">
                        {filteredTasks.map((t) => {
                          const isExpanded = expandedTask === t.id;
                          const sprintName = sprints.find((s) => s.id === t.sprintId)?.name;
                          return (
                            <div key={t.id}>
                              <div
                                className="flex items-center gap-2 p-2 bg-zinc-900/30 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors group cursor-pointer border-l-[3px]"
                                style={{
                                  borderLeftColor:
                                    t.status === 'done'
                                      ? '#10b981'
                                      : t.status === 'in_progress'
                                        ? '#f59e0b'
                                        : t.status === 'review'
                                          ? '#a78bfa'
                                          : t.status === 'ready'
                                            ? '#3b82f6'
                                            : '#52525b',
                                }}
                                onClick={() => setExpandedTask(isExpanded ? null : t.id)}
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{
                                    backgroundColor: PRIORITY_COLORS[t.priority] || '#6b7280',
                                  }}
                                />
                                <div className="flex-1 min-w-0">
                                  <div
                                    className={`text-[10px] truncate ${t.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}
                                  >
                                    {t.title}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[8px]">
                                    <span
                                      style={{
                                        color: PRIORITY_COLORS[t.priority] || '#6b7280',
                                      }}
                                      className="uppercase font-medium"
                                    >
                                      {t.priority}
                                    </span>
                                    <span className="text-zinc-700">·</span>
                                    <span className="text-zinc-500">{t.status.replace('_', ' ')}</span>
                                    {sprintName && (
                                      <>
                                        <span className="text-zinc-700">·</span>
                                        <span className="text-cyan-500/80">{sprintName}</span>
                                      </>
                                    )}
                                    {t.description && (
                                      <>
                                        <span className="text-zinc-700">·</span>
                                        <span className="text-zinc-600">notes</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <select
                                  value={t.status}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    updateTaskStatus(t.id, e.target.value);
                                  }}
                                  className="bg-zinc-800 border border-zinc-700 text-zinc-400 rounded text-[8px] px-1 py-0.5 outline-none cursor-pointer opacity-60 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>
                                      {s.replace('_', ' ')}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteTask(t.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 text-[9px] text-zinc-700 hover:text-red-400 transition-all cursor-pointer"
                                  title="Delete"
                                >
                                  ✕
                                </button>
                              </div>
                              {isExpanded && (
                                <div className="ml-5 mt-0.5 p-2 bg-zinc-800/40 border border-zinc-700/50 rounded space-y-1">
                                  {t.description && <div className="text-[9px] text-zinc-400">{t.description}</div>}
                                  <div className="text-[8px] text-zinc-700">
                                    Created {new Date(t.createdAt).toLocaleDateString()}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {filteredTasks.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-6 text-center">
                            <div className="text-lg mb-1 opacity-20">○</div>
                            <p className="text-[10px] text-zinc-700">
                              {taskFilter === 'active' ? 'No active tasks' : `No ${taskFilter} tasks`}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Done tasks collapsible */}
                      {doneTasks.length > 0 && taskFilter !== 'done' && (
                        <div className="mt-2 border border-zinc-800 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setShowDone(!showDone)}
                            className="flex items-center gap-1.5 w-full text-[9px] text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/20 transition-colors px-2 py-1 cursor-pointer"
                          >
                            <span className={`transition-transform ${showDone ? 'rotate-90' : ''}`}>▸</span>
                            {doneTasks.length} completed
                          </button>
                          {showDone && (
                            <div className="pb-1 space-y-0.5 px-2">
                              {doneTasks.slice(0, 10).map((t) => (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 p-1.5 bg-zinc-900/20 border border-zinc-800/50 rounded border-l-2 border-l-green-500/40"
                                >
                                  <span className="text-green-500 text-[9px] shrink-0">✔</span>
                                  <span className="text-[10px] text-zinc-500 line-through truncate">{t.title}</span>
                                  <span
                                    className="text-[7px] text-zinc-700 ml-auto uppercase"
                                    style={{
                                      color: PRIORITY_COLORS[t.priority],
                                    }}
                                  >
                                    {t.priority}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Board view */}
                  {viewMode === 'board' && (
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin" style={{ minHeight: 200 }}>
                      {BOARD_COLUMNS.map((col) => {
                        const colTasks = tasks.filter((t) => t.status === col.key);
                        const colDone = colTasks.filter((t) => t.status === 'done').length;
                        return (
                          <div key={col.key} className="min-w-57.5 w-57.5 shrink-0">
                            <div className="flex items-center justify-between mb-1.5 px-1">
                              <div className="flex items-center gap-1.5">
                                <span style={{ color: col.color }} className="text-sm">
                                  {col.icon}
                                </span>
                                <span className="text-[10px] text-zinc-400 font-medium">{col.label}</span>
                              </div>
                              <span className="text-[9px] text-zinc-600 bg-zinc-800 rounded-full px-1.5">
                                {colTasks.length}
                              </span>
                            </div>
                            {colTasks.length > 0 && (
                              <div className="w-full bg-zinc-800/50 rounded-full h-1 mb-1.5">
                                <div
                                  className="h-1 rounded-full transition-all"
                                  style={{
                                    width: `${(colDone / colTasks.length) * 100}%`,
                                    backgroundColor: col.color,
                                  }}
                                />
                              </div>
                            )}
                            <div
                              className="space-y-1.5 max-h-105 overflow-y-auto pr-1"
                              style={{
                                minHeight: colTasks.length === 0 ? 60 : undefined,
                              }}
                            >
                              {colTasks.length === 0 && (
                                <div className="flex items-center justify-center h-12 text-[9px] text-zinc-700 border border-dashed border-zinc-800 rounded-lg">
                                  Empty
                                </div>
                              )}
                              {colTasks.map((t) => {
                                const sprintName = sprints.find((s) => s.id === t.sprintId)?.name;
                                return (
                                  <div
                                    key={t.id}
                                    className="p-2 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors group cursor-pointer border-l-[3px]"
                                    style={{
                                      borderLeftColor: PRIORITY_COLORS[t.priority] || '#6b7280',
                                    }}
                                    onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <div className="flex-1 min-w-0">
                                        <div
                                          className={`text-[10px] truncate ${t.status === 'done' ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}
                                        >
                                          {t.title}
                                        </div>
                                        <div className="flex items-center gap-1 text-[8px] mt-0.5 flex-wrap">
                                          <span
                                            style={{
                                              color: PRIORITY_COLORS[t.priority] || '#6b7280',
                                            }}
                                            className="uppercase font-medium"
                                          >
                                            {t.priority}
                                          </span>
                                          {t.description && <span className="text-zinc-700">· notes</span>}
                                          {sprintName && <span className="text-cyan-500/70">· {sprintName}</span>}
                                        </div>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteTask(t.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-[8px] text-zinc-700 hover:text-red-400 transition-all shrink-0"
                                        title="Delete"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                    {expandedTask === t.id && (
                                      <div className="mt-1.5 pt-1.5 border-t border-zinc-800">
                                        {t.description && (
                                          <div className="text-[8px] text-zinc-500 mb-1">{t.description}</div>
                                        )}
                                        <div className="text-[7px] text-zinc-700 mb-1">
                                          Created {new Date(t.createdAt).toLocaleDateString()}
                                        </div>
                                        <div className="flex gap-1 flex-wrap">
                                          {BOARD_COLUMNS.map((c) => {
                                            if (c.key === t.status) return null;
                                            return (
                                              <button
                                                key={c.key}
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  updateTaskStatus(t.id, c.key);
                                                }}
                                                className="text-[7px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer"
                                                style={{
                                                  borderColor: c.color + '30',
                                                  color: c.color,
                                                  backgroundColor: c.color + '10',
                                                }}
                                              >
                                                {c.icon} {c.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
