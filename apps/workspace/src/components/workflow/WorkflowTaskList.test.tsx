/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowTaskList, type WorkflowTaskItem } from './WorkflowTaskList';

const TASKS: WorkflowTaskItem[] = [
  {
    id: 't-blocked',
    summary: 'Fix the failing migration',
    description: 'Rollback guard trips on retry',
    status: 'blocked',
    dependencies: ['t-done'],
    files: ['src/migrate.ts', 'src/guard.ts', 'src/extra.ts'],
    revisionCount: 2,
    attemptCount: 3,
    artifactCount: 1,
  },
  {
    id: 't-running',
    summary: 'Ship the graph toolbar',
    description: '',
    status: 'in-progress',
    dependencies: [],
    files: [],
    revisionCount: 1,
    attemptCount: 1,
    artifactCount: 0,
  },
  {
    id: 't-done',
    summary: 'Draft the plan',
    description: 'Approved in review',
    status: 'completed',
    dependencies: [],
    files: ['plan.md'],
    revisionCount: 1,
    attemptCount: 1,
    artifactCount: 2,
  },
];

function renderList(onSelectTask: (taskId: string) => void = () => {}) {
  render(<WorkflowTaskList tasks={TASKS} onSelectTask={onSelectTask} />);
}

describe('WorkflowTaskList', () => {
  it('summarizes counts and completion from snapshot data only', () => {
    renderList();
    const summary = screen.getByRole('group', { name: 'Task summary' });
    expect(within(summary).getByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('1 / 3 · 33%')).toBeInTheDocument();
  });

  it('orders blockers before live work before completed', () => {
    renderList();
    const rows = screen.getAllByRole('button', { name: /, status / });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Fix the failing migration, status blocked',
      'Ship the graph toolbar, status in progress',
      'Draft the plan, status completed',
    ]);
  });

  it('surfaces file, revision, and artifact evidence on each row', () => {
    renderList();
    expect(screen.getByText('src/migrate.ts, src/guard.ts +1')).toBeInTheDocument();
    expect(screen.getByText('3 attempts')).toBeInTheDocument();
    expect(screen.getByText('2 revisions')).toBeInTheDocument();
    expect(screen.getByText('2 artifacts')).toBeInTheDocument();
  });

  it('filters by status bucket and clears back to all', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Completed/ }));
    expect(screen.getByRole('button', { name: 'Draft the plan, status completed' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Fix the failing migration, status blocked' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Queued/ }));
    expect(screen.getByText('No tasks match the current filters.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getAllByRole('button', { name: /, status / })).toHaveLength(3);
  });

  it('searches summaries, descriptions, statuses, and files', () => {
    renderList();
    fireEvent.change(screen.getByLabelText('Filter tasks'), { target: { value: 'plan.md' } });
    expect(screen.getByRole('button', { name: 'Draft the plan, status completed' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Ship the graph toolbar, status in progress' }),
    ).not.toBeInTheDocument();
  });

  it('hands the selected task id back to the page for graph focus', () => {
    const onSelectTask = vi.fn();
    renderList(onSelectTask);
    fireEvent.click(screen.getByRole('button', { name: 'Ship the graph toolbar, status in progress' }));
    expect(onSelectTask).toHaveBeenCalledWith('t-running');
  });

  it('explains an empty snapshot without filter chrome', () => {
    render(<WorkflowTaskList tasks={[]} onSelectTask={() => {}} />);
    expect(screen.getByText('No tasks are available in this snapshot.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Filter tasks')).not.toBeInTheDocument();
  });
});
