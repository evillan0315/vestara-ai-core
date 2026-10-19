/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowApprovalGate } from './WorkflowApprovalGate';

const gate = {
  kind: 'architecture' as const,
  title: 'Architecture review',
  detail: 'Approve or request changes.',
  approveLabel: 'Approve architecture',
  rejectLabel: 'Request changes',
  rejectConsequence: 'Moves the project back to planning.',
};

describe('WorkflowApprovalGate', () => {
  it('exposes both the approve and reject decisions', () => {
    render(
      <WorkflowApprovalGate gate={gate} busy={false} error={null} onApprove={vi.fn()} onReject={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Approve architecture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeInTheDocument();
    expect(screen.getByText('Awaiting your decision')).toBeInTheDocument();
  });

  it('invokes the selected decision', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<WorkflowApprovalGate gate={gate} busy={false} error={null} onApprove={onApprove} onReject={onReject} />);

    fireEvent.click(screen.getByRole('button', { name: 'Approve architecture' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }));

    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error and blocks both decisions while busy', () => {
    render(<WorkflowApprovalGate gate={gate} busy error="Authentication is required." onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Authentication is required.');
    expect(screen.getByRole('button', { name: 'Approve architecture' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled();
  });
});
