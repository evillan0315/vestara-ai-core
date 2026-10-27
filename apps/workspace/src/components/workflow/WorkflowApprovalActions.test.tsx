/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowApprovalActions } from './WorkflowApprovalActions';

describe('WorkflowApprovalActions', () => {
  it('renders nothing without approvals', () => {
    const { container } = render(<WorkflowApprovalActions projectId="p1" approvals={[]} busy={null} onResolve={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('routes approve and deny with project + task ids', () => {
    const onResolve = vi.fn();
    render(
      <WorkflowApprovalActions
        projectId="p1"
        approvals={[{ id: 't1', summary: 'Ship migration', files: [] }]}
        busy={null}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Approve Ship migration' }));
    expect(onResolve).toHaveBeenCalledWith('p1', 't1', true);
    fireEvent.click(screen.getByRole('button', { name: 'Deny Ship migration' }));
    expect(onResolve).toHaveBeenCalledWith('p1', 't1', false);
  });

  it('disables the busy approval task', () => {
    render(
      <WorkflowApprovalActions
        projectId="p1"
        approvals={[{ id: 't1', summary: 'Ship migration', files: [] }]}
        busy="t1"
        onResolve={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Approve Ship migration' })).toBeDisabled();
  });
});
