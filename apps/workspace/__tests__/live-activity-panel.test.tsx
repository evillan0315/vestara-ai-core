import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { LiveEvent } from '../src/lib/useEventStream.js';
import LiveActivityPanel from '../src/pages/Agents/LiveActivityPanel.js';

function event(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id: 'evt-1',
    type: 'agent.completed',
    category: 'agent',
    actor: { id: 'planner', name: 'Planner', type: 'agent' },
    resource: { type: 'agent', id: 'planner', name: 'Planner' },
    message: 'Finished a task',
    timestamp: '2026-08-06T10:00:00.000Z',
    metadata: {},
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
});

describe('LiveActivityPanel', () => {
  it('renders only agent-actor events with their messages', () => {
    render(
      <LiveActivityPanel
        events={[
          event(),
          event({ id: 'sys', actor: { id: 'system', name: 'System', type: 'system' }, message: 'heartbeat' }),
        ]}
      />,
    );
    expect(screen.getByText('Finished a task')).toBeTruthy();
    expect(screen.queryByText('heartbeat')).toBeNull();
  });

  it('shows the empty state when there is no agent activity', () => {
    render(<LiveActivityPanel events={[]} />);
    expect(screen.getByText('No agent activity yet')).toBeTruthy();
  });
});
