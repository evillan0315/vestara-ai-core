import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkflowPanel from '../src/pages/Agents/WorkflowPanel.js';

afterEach(() => {
  cleanup();
});

describe('WorkflowPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<WorkflowPanel open={false} onStart={async () => true} />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps the start button disabled until a goal is provided', () => {
    render(<WorkflowPanel open onStart={async () => true} />);
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByPlaceholderText('Describe the goal for the workflow...'), {
      target: { value: 'Refactor the workspace' },
    });
    expect(screen.getByRole('button', { name: 'Start' })).toHaveProperty('disabled', false);
  });

  it('calls onStart with the goal and selected template, then clears the goal on success', async () => {
    const onStart = vi.fn().mockResolvedValue(true);
    render(<WorkflowPanel open onStart={onStart} />);
    fireEvent.change(screen.getByPlaceholderText('Describe the goal for the workflow...'), {
      target: { value: 'Refactor the workspace' },
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'agent-control-restructure' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(onStart).toHaveBeenCalledWith('Refactor the workspace', 'agent-control-restructure'));
    await waitFor(() =>
      expect(screen.getByPlaceholderText('Describe the goal for the workflow...')).toHaveProperty('value', ''),
    );
  });
});
