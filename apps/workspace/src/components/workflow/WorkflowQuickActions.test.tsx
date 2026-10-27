/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowQuickActions } from './WorkflowQuickActions';

describe('WorkflowQuickActions', () => {
  it('renders every action label and blocks disabled tiles', () => {
    const onNew = vi.fn();
    const onApprovals = vi.fn();
    render(
      <WorkflowQuickActions
        actions={[
          { id: 'new', label: 'New project', sub: 'Start building', tile: 'var(--vestara-accent)', glyph: '✚', onSelect: onNew },
          {
            id: 'approvals',
            label: 'Review approvals',
            sub: 'None pending',
            tile: 'var(--vestara-status-warning)',
            glyph: '!',
            disabled: true,
            onSelect: onApprovals,
          },
        ]}
      />,
    );
    expect(screen.getByText('New project')).toBeInTheDocument();
    expect(screen.getByText('Review approvals')).toBeInTheDocument();
    fireEvent.click(screen.getByText('New project'));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Review approvals/ })).toBeDisabled();
  });
});
