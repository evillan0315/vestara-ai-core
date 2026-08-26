import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentStatusBadge } from '../src/pages/Agents/AgentStatusBadge.js';

function renderBadge(status: string) {
  return render(<AgentStatusBadge status={status} />);
}

afterEach(() => {
  cleanup();
});

describe('AgentStatusBadge', () => {
  it('renders the status text', () => {
    renderBadge('active');
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('styles active as green', () => {
    const { container } = renderBadge('active');
    expect(container.querySelector('span')?.className).toContain('text-green-400');
  });

  it('styles disabled and unregistered distinctly', () => {
    const disabled = renderBadge('disabled');
    expect(disabled.container.querySelector('span')?.className).toContain('text-(--vestara-text-2)');
    const unregistered = renderBadge('unregistered');
    expect(unregistered.container.querySelector('span')?.className).toContain('text-zinc-700');
  });

  it('falls back to neutral styling for unknown statuses', () => {
    const { container } = renderBadge('queued');
    expect(container.querySelector('span')?.className).toContain('text-(--vestara-text-2)');
  });
});