/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkflowNodeInspector } from './WorkflowNodeInspector';

describe('WorkflowNodeInspector', () => {
  it('shows only projected plan information', () => {
    render(
      <WorkflowNodeInspector
        node={{ id: 'workflow-plan:p1', kind: 'plan', label: 'Plan 1', status: 'approved', source: { kind: 'plan', id: 'p1' } }}
      />,
    );

    expect(screen.getByText('Plan 1')).toBeInTheDocument();
    expect(screen.getByText('p1')).toBeInTheDocument();
    expect(screen.queryByText(/runtime|session|execution|cost/i)).not.toBeInTheDocument();
  });

  it('shows authoritative task details and clears to an empty state on deselection', () => {
    const task = {
      id: 'workflow-task:t1',
      kind: 'task' as const,
      label: 'Implement graph',
      status: 'in-progress' as const,
      source: { kind: 'task' as const, id: 't1' },
    };
    const { rerender } = render(
      <WorkflowNodeInspector
        node={task}
        task={{ description: 'Build the renderer', planId: 'p1', dependencies: ['t0'] }}
      />,
    );

    expect(screen.getByText('Implement graph')).toBeInTheDocument();
    expect(screen.getByText('Build the renderer')).toBeInTheDocument();
    expect(screen.getByText('t0')).toBeInTheDocument();

    rerender(<WorkflowNodeInspector node={null} />);
    expect(screen.getByText(/select a plan or task/i)).toBeInTheDocument();
  });
});
