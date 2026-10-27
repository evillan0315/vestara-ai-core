/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowNextLane } from './WorkflowNextLane';

const ACTIONS = [
  {
    kind: 'task-approval' as const,
    projectId: 'p1',
    projectName: 'Alpha',
    title: 'Approval waiting',
    detail: 'blocks downstream',
    ctaLabel: 'Review',
    actionable: true,
  },
  {
    kind: 'progress' as const,
    projectId: 'p2',
    projectName: 'Beta',
    title: 'Running normally',
    detail: 'watch',
    ctaLabel: 'Open',
    actionable: false,
  },
];

describe('WorkflowNextLane', () => {
  it('renders nothing without actions and owns pager state', () => {
    const { container } = render(<WorkflowNextLane actions={[]} projectsById={{}} busyProjectId={null} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('pages through the queue without touching the page', () => {
    const onSelect = vi.fn();
    render(
      <WorkflowNextLane
        actions={ACTIONS}
        projectsById={{ p1: { id: 'p1', name: 'Alpha', goal: '', phase: 'executing', status: 'running', createdAt: '' } }}
        busyProjectId={null}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('Approval waiting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next recommended action' }));
    expect(screen.getByText('Running normally')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(onSelect).toHaveBeenCalledWith('p2', 'progress');
  });
});
