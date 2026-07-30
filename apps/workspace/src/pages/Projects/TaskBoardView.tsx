import { useState } from 'react';
import type { TaskData, SprintData } from './types';

export const BOARD_COLUMNS = [
  { key: 'backlog', label: 'Backlog', icon: '📋', color: '#6b7280' },
  { key: 'ready', label: 'Ready', icon: '🎯', color: '#3b82f6' },
  { key: 'in_progress', label: 'In Progress', icon: '⚡', color: '#f59e0b' },
  { key: 'review', label: 'Review', icon: '🔍', color: '#8b5cf6' },
  { key: 'done', label: 'Done', icon: '✅', color: '#10b981' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#6b7280',
};

interface TaskBoardViewProps {
  tasks: TaskData[];
  sprints: SprintData[];
  onUpdateStatus: (taskId: string, status: string) => void;
  onDeleteTask: (taskId: string) => void;
}

export default function TaskBoardView({ tasks, sprints, onUpdateStatus, onDeleteTask }: TaskBoardViewProps) {
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin" style={{ minHeight: 200 }}>
      {BOARD_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.key);
        const colDone = colTasks.filter((t) => t.status === 'done').length;
        return (
          <div
            key={col.key}
            className="min-w-57.5 w-57.5 shrink-0"
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/task-id');
              if (id) onUpdateStatus(id, col.key);
              setDragTaskId(null);
            }}
          >
            <div className="flex items-center justify-between mb-1.5 px-1">
              <div className="flex items-center gap-1.5">
                <span style={{ color: col.color }} className="text-sm">{col.icon}</span>
                <span className="text-[10px] text-(--vestara-text-2) font-medium">{col.label}</span>
              </div>
              <span className="text-[9px] text-(--vestara-text-muted) bg-(--vestara-accent-bg) rounded-full px-1.5">{colTasks.length}</span>
            </div>
            {colTasks.length > 0 && (
              <div className="w-full bg-(--vestara-accent-bg) rounded-full h-1 mb-1.5">
                <div className="h-1 rounded-full transition-all" style={{ width: `${(colDone / colTasks.length) * 100}%`, backgroundColor: col.color }} />
              </div>
            )}
            <div className="space-y-1.5 max-h-105 overflow-y-auto pr-1" style={{ minHeight: colTasks.length === 0 ? 60 : undefined }}>
              {colTasks.length === 0 && (
                <div className="flex items-center justify-center h-12 text-[9px] text-(--vestara-text-dim) border border-dashed border-(--vestara-accent-border) rounded-lg">Empty</div>
              )}
              {colTasks.map((t) => {
                const sprintName = sprints.find((s) => s.id === t.sprintId)?.name;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => { setDragTaskId(t.id); e.dataTransfer.setData('text/task-id', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragTaskId(null)}
                    className={`p-2 border border-(--vestara-accent-border) rounded-lg hover:border-(--vestara-accent-border-active) transition-colors group cursor-pointer border-l-[3px] ${dragTaskId === t.id ? 'opacity-50 border-zinc-500' : 'bg-(--vestara-accent-bg)'}`}
                    style={{ borderLeftColor: PRIORITY_COLORS[t.priority] || '#6b7280' }}
                    onClick={() => setExpandedTask(expandedTask === t.id ? null : t.id)}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className={`text-[10px] truncate ${t.status === 'done' ? 'text-(--vestara-text-muted) line-through' : 'text-(--vestara-text)'}`}>{t.title}</div>
                        <div className="flex items-center gap-1 text-[8px] mt-0.5 flex-wrap">
                          <span style={{ color: PRIORITY_COLORS[t.priority] || '#6b7280' }} className="uppercase font-medium">{t.priority}</span>
                          {t.description && <span className="text-(--vestara-text-dim)">· notes</span>}
                          {sprintName && <span className="text-cyan-500/70">· {sprintName}</span>}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); onDeleteTask(t.id); }} className="opacity-0 group-hover:opacity-100 text-[8px] text-(--vestara-text-dim) hover:text-red-400 transition-all shrink-0" title="Delete">✕</button>
                    </div>
                    {expandedTask === t.id && (
                      <div className="mt-1.5 pt-1.5 border-t border-(--vestara-accent-border)">
                        {t.description && <div className="text-[8px] text-(--vestara-text-2) mb-1">{t.description}</div>}
                        <div className="text-[7px] text-(--vestara-text-dim) mb-1">Created {new Date(t.createdAt).toLocaleDateString()}</div>
                        <div className="flex gap-1 flex-wrap">
                          {BOARD_COLUMNS.map((c) => {
                            if (c.key === t.status) return null;
                            return (
                              <button key={c.key} onClick={(e) => { e.stopPropagation(); onUpdateStatus(t.id, c.key); }}
                                className="text-[7px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer"
                                style={{ borderColor: c.color + '30', color: c.color, backgroundColor: c.color + '10' }}>
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
  );
}
