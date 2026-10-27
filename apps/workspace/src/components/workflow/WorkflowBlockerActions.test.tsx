/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowBlockerActions, buildRetryCommand } from './WorkflowBlockerActions';
import { BLOCKED_TASK_FIXTURE } from './workflow-blocker-actions.fixtures';

function renderActions(overrides: Partial<{ busy: boolean }> = {}) {
  const onRetry = vi.fn();
  const onCancel = vi.fn();
  render(
    <WorkflowBlockerActions
      projectId={BLOCKED_TASK_FIXTURE.projectId}
      taskId={BLOCKED_TASK_FIXTURE.taskId}
      taskStatus={BLOCKED_TASK_FIXTURE.taskStatus}
      busy={overrides.busy ?? false}
      onRetry={onRetry}
      onCancel={onCancel}
    />,
  );
  return { onRetry, onCancel };
}

describe('WorkflowBlockerActions', () => {
  it('builds the retry command from the authoritative route', () => {
    expect(buildRetryCommand('p-1', 't-2')).toContain('/api/orchestration/projects/p-1/tasks/t-2/retry');
  });

  it('retries the blocked task via the page handler', () => {
    const { onRetry } = renderActions();
    fireEvent.click(screen.getByRole('button', { name: `Retry ${BLOCKED_TASK_FIXTURE.taskId}` }));
    expect(onRetry).toHaveBeenCalledWith(BLOCKED_TASK_FIXTURE.projectId, BLOCKED_TASK_FIXTURE.taskId);
  });

  it('shows and hides the retry command', () => {
    renderActions();
    expect(screen.queryByLabelText(`Retry command for ${BLOCKED_TASK_FIXTURE.taskId}`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Show retry command for ${BLOCKED_TASK_FIXTURE.taskId}` }));
    expect(screen.getByLabelText(`Retry command for ${BLOCKED_TASK_FIXTURE.taskId}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Hide retry command for ${BLOCKED_TASK_FIXTURE.taskId}` }));
    expect(screen.queryByLabelText(`Retry command for ${BLOCKED_TASK_FIXTURE.taskId}`)).not.toBeInTheDocument();
  });

  it('cancels recovery and notifies the page', () => {
    const { onCancel } = renderActions();
    fireEvent.click(screen.getByRole('button', { name: `Show retry command for ${BLOCKED_TASK_FIXTURE.taskId}` }));
    expect(screen.getByLabelText(`Retry command for ${BLOCKED_TASK_FIXTURE.taskId}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `Cancel recovery for ${BLOCKED_TASK_FIXTURE.taskId}` }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText(`Retry command for ${BLOCKED_TASK_FIXTURE.taskId}`)).not.toBeInTheDocument();
  });

  it('disables retry while busy', () => {
    renderActions({ busy: true });
    expect(screen.getByRole('button', { name: `Retry ${BLOCKED_TASK_FIXTURE.taskId}` })).toBeDisabled();
  });
});
