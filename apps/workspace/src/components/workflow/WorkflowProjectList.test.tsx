/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowProjectCardBody, WorkflowProjectList, workflowRowStatusVariant } from './WorkflowProjectList';

const PROJECT = { id: 'p1', name: 'Alpha', goal: 'Ship it', phase: 'executing', status: 'running', createdAt: '' };
const METRICS = {
  projectId: 'p1',
  status: 'running',
  tasks: { total: 4, completed: 1, failed: 0, blocked: 0, awaitingApproval: 0, running: 1 },
  retries: 0,
  revisions: 0,
  artifacts: 2,
  elapsedMs: 1000,
};

describe('workflowRowStatusVariant', () => {
  it('ranks blockers above approvals above phase', () => {
    expect(workflowRowStatusVariant({ status: 'running', phase: 'executing' }, { tasks: { failed: 1, blocked: 0 } }, 0)).toBe('error');
    expect(workflowRowStatusVariant({ status: 'running', phase: 'executing' }, undefined, 1)).toBe('warn');
    expect(workflowRowStatusVariant({ status: 'running', phase: 'executing' }, undefined, 0)).toBe('live');
  });
});

describe('WorkflowProjectCardBody', () => {
  it('renders goal and progress from metrics only', () => {
    render(<WorkflowProjectCardBody project={PROJECT} metrics={METRICS} />);
    expect(screen.getByText('Ship it')).toBeInTheDocument();
    expect(screen.getByText('Task progress 1/4 25%')).toBeInTheDocument();
  });
});

describe('WorkflowProjectList', () => {
  function renderList(overrides: Partial<Parameters<typeof WorkflowProjectList>[0]> = {}) {
    const props: Parameters<typeof WorkflowProjectList>[0] = {
      projects: [PROJECT],
      metricsByProject: { p1: METRICS },
      approvalsByProject: { p1: [] },
      projectActions: {},
      nextProjectId: 'p1',
      expandedId: null,
      busy: null,
      onToggle: () => {},
      onOpenGraph: () => {},
      onRerun: () => {},
      onArchive: () => {},
      onDelete: () => {},
      ...overrides,
    };
    return render(<WorkflowProjectList {...props} />);
  }

  it('marks the recommended row with Next', () => {
    renderList();
    expect(screen.getByLabelText('Next recommended workflow: Alpha')).toBeInTheDocument();
  });

  it('surfaces blocked and approval badges side by side so blockers are never hidden', () => {
    const stuckMetrics = {
      ...METRICS,
      tasks: { total: 5, completed: 1, failed: 1, blocked: 1, awaitingApproval: 0, running: 1 },
    };
    renderList({
      metricsByProject: { p1: stuckMetrics },
      approvalsByProject: { p1: [{ id: 'a1', summary: 'Risky migration', files: [] }] },
      projectActions: {
        p1: {
          kind: 'task-approval',
          projectId: 'p1',
          projectName: 'Alpha',
          title: 'Approve 1 task in Alpha',
          detail: 'Risky migration',
          ctaLabel: 'Review approvals',
          actionable: true,
        },
      },
    });
    expect(screen.getByLabelText('2 blocked in Alpha')).toBeInTheDocument();
    expect(screen.getByLabelText('1 approval in Alpha')).toBeInTheDocument();
  });

  it('requires two clicks to confirm delete', () => {
    const onDelete = vi.fn();
    renderList({ onDelete });
    fireEvent.click(screen.getByRole('button', { name: /Alpha — executing/ }));
    // Hover tooltip renders in a portal; open via focus then click delete twice.
    const row = screen.getByRole('button', { name: /Alpha — executing/ });
    fireEvent.focus(row);
    const deleteBtn = screen.getByRole('button', { name: 'Delete Alpha' });
    fireEvent.click(deleteBtn);
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /confirm deleting Alpha/ }));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });
});
