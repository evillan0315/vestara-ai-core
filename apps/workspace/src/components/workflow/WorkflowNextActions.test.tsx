/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowNextActionsPanel } from './WorkflowNextActions';

const ACTIONS = [
  {
    kind: 'task-approval' as const,
    projectId: 'p1',
    projectName: 'Alpha',
    title: 'Approval waiting',
    detail: '2 approvals block downstream tasks',
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

describe('WorkflowNextActionsPanel', () => {
  it('renders empty state with no actions', () => {
    render(<WorkflowNextActionsPanel actions={[]} onSelect={() => {}} />);
    expect(screen.getByText('No recommended actions across workflows.')).toBeInTheDocument();
  });

  it('splits actionable from suggested and keeps queue rank', () => {
    const onSelect = vi.fn();
    render(<WorkflowNextActionsPanel actions={ACTIONS} onSelect={onSelect} />);
    expect(screen.getByText('Action needed · 1')).toBeInTheDocument();
    expect(screen.getByText('Suggested · 1')).toBeInTheDocument();
    expect(screen.getByText('#1 of 2 · Approvals block downstream tasks, so they outrank everything else.')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Review approvals' })[0]);
    expect(onSelect).toHaveBeenCalledWith('p1', 'task-approval');
  });
});
