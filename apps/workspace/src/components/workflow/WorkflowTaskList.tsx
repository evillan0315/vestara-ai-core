/**
 * WorkflowTaskList — filterable task board for the Orchestration Tasks tab.
 *
 * Presentation only: every task field comes from the authoritative workflow
 * snapshot. Selection hands the task id back to the page, which owns the graph
 * selection and tab transition. No execution, mutation, or retry paths here.
 */

import { useMemo, useState } from 'react';
import { Button, Input } from '@vestara/ui';
import { ProgressBar } from '@vestara/ui-components';
import {
  taskMatchesFilter,
  taskStatusPriority,
  taskStatusTone,
  type TaskStatusFilter,
  type TaskTone,
} from '../../lib/task-status';

export interface WorkflowTaskItem {
  id: string;
  summary: string;
  description: string;
  status: string;
  dependencies: readonly string[];
  files: readonly string[];
  revisionCount: number;
  attemptCount: number;
  artifactCount: number;
}

export interface WorkflowTaskListProps {
  tasks: readonly WorkflowTaskItem[];
  onSelectTask: (taskId: string) => void;
}

const FILTERS: ReadonlyArray<{ id: TaskStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'queued', label: 'Queued' },
  { id: 'completed', label: 'Completed' },
];

const GLYPH: Record<TaskTone, string> = {
  success: '✓',
  info: '●',
  warning: '!',
  error: '!',
  muted: '○',
};

function pretty(status: string): string {
  return status.replaceAll('-', ' ');
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function fileSummary(files: readonly string[]): string | null {
  if (files.length === 0) return null;
  const visible = files.slice(0, 2).join(', ');
  return files.length > 2 ? `${visible} +${files.length - 2}` : visible;
}

function TaskRow({ task, onSelect }: { task: WorkflowTaskItem; onSelect: () => void }) {
  const tone = taskStatusTone(task.status);
  const files = fileSummary(task.files);
  return (
    <button
      type="button"
      className="workflow-task-row"
      data-tone={tone}
      onClick={onSelect}
      aria-label={`${task.summary}, status ${pretty(task.status)}`}
    >
      <span className="workflow-task-row-glyph" data-tone={tone} aria-hidden="true">
        {GLYPH[tone]}
      </span>
      <span className="workflow-task-row-main">
        <span className="workflow-task-row-title">
          <strong>{task.summary}</strong>
          <span className="workflow-status-chip" data-status={task.status}>
            {pretty(task.status)}
          </span>
        </span>
        {task.description && <small>{task.description}</small>}
        <span className="workflow-task-row-meta">
          <span>{plural(task.dependencies.length, 'prerequisite')}</span>
          <span>{plural(task.artifactCount, 'artifact')}</span>
          {files && <span className="workflow-task-row-files">{files}</span>}
          {task.revisionCount > 1 && <span>{plural(task.revisionCount, 'revision')}</span>}
          {task.attemptCount > 1 && <span>{plural(task.attemptCount, 'attempt')}</span>}
        </span>
      </span>
      <span className="workflow-task-row-cta" aria-hidden="true">
        Open graph ›
      </span>
    </button>
  );
}

export function WorkflowTaskList({ tasks, onSelectTask }: WorkflowTaskListProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TaskStatusFilter>('all');

  const counts = useMemo(() => {
    const result: Record<TaskStatusFilter, number> = {
      all: tasks.length,
      active: 0,
      attention: 0,
      completed: 0,
      queued: 0,
    };
    for (const task of tasks) {
      for (const id of ['active', 'attention', 'completed', 'queued'] as const) {
        if (taskMatchesFilter(task.status, id)) result[id] += 1;
      }
    }
    const completed = tasks.filter((task) => taskMatchesFilter(task.status, 'completed')).length;
    return { ...result, pct: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0 };
  }, [tasks]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tasks
      .filter((task) => taskMatchesFilter(task.status, filter))
      .filter((task) => {
        if (!needle) return true;
        return `${task.summary} ${task.description} ${task.status} ${task.files.join(' ')}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((left, right) => taskStatusPriority(left.status) - taskStatusPriority(right.status));
  }, [tasks, filter, query]);

  if (tasks.length === 0) {
    return (
      <div className="workflow-task-empty">
        <p>No tasks are available in this snapshot.</p>
        <p className="workflow-task-empty__hint">Tasks appear once the workflow plan is created.</p>
      </div>
    );
  }

  const filtering = query.trim() !== '' || filter !== 'all';

  return (
    <div className="workflow-task-surface">
      <div className="workflow-task-summary" role="group" aria-label="Task summary">
        <div className="workflow-task-summary__metrics">
          <div className="workflow-task-summary__metric" data-tone="info">
            <span className="workflow-task-summary__value">{counts.active}</span>
            <span className="workflow-task-summary__label">Active</span>
          </div>
          <div className="workflow-task-summary__metric" data-tone="warning">
            <span className="workflow-task-summary__value">{counts.attention}</span>
            <span className="workflow-task-summary__label">Needs attention</span>
          </div>
          <div className="workflow-task-summary__metric" data-tone="success">
            <span className="workflow-task-summary__value">{counts.completed}</span>
            <span className="workflow-task-summary__label">Completed</span>
          </div>
          <div className="workflow-task-summary__metric" data-tone="muted">
            <span className="workflow-task-summary__value">{counts.queued}</span>
            <span className="workflow-task-summary__label">Queued</span>
          </div>
        </div>
        <div className="workflow-task-summary__progress">
          <div className="workflow-task-summary__progress-head">
            <span>Completion</span>
            <span>
              {counts.completed} / {tasks.length} · {counts.pct}%
            </span>
          </div>
          <ProgressBar pct={counts.pct} size="sm" />
        </div>
      </div>

      <div className="workflow-task-toolbar" role="toolbar" aria-label="Task filters">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter tasks…"
          aria-label="Filter tasks"
          className="min-w-48 flex-1"
        />
        <div className="workflow-task-filters" role="group" aria-label="Task status filter">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setFilter(entry.id)}
              aria-pressed={filter === entry.id}
              className="workflow-task-filter"
            >
              {entry.label}
              <span className="workflow-task-filter__count">{counts[entry.id]}</span>
            </button>
          ))}
        </div>
        {filtering && (
          <span className="workflow-task-toolbar__count">
            {visible.length} of {tasks.length}
          </span>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="workflow-task-empty">
          <p>No tasks match the current filters.</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setQuery('');
              setFilter('all');
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="workflow-task-list" aria-label="Workflow tasks">
          {visible.map((task) => (
            <TaskRow key={task.id} task={task} onSelect={() => onSelectTask(task.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
