import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentCategoryList } from '../src/pages/Agents/AgentCategoryList.js';
import type { Agent } from '../src/pages/Agents/types.js';

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: 'agent-1',
    name: 'Planner',
    role: 'planner',
    agentType: 'workspace',
    description: 'Plans tasks',
    capabilities: [],
    permissions: [],
    status: 'active',
    color: '#6b7280',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

function renderList(props: { agents?: Agent[]; onEditAgent?: (agent: Agent) => void } = {}) {
  return render(
    <AgentCategoryList
      agents={props.agents ?? [agent({})]}
      agentStats={{}}
      onEditAgent={props.onEditAgent ?? (() => {})}
      onToggleStatus={() => {}}
      onDeleteAgent={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('AgentCategoryList', () => {
  it('renders agents as uniform boxes with no category headers', () => {
    const { container } = renderList({
      agents: [agent({ id: 'a1', name: 'Planner', role: 'planner' }), agent({ id: 'a2', name: 'Coder', role: 'developer' })],
    });
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getByText('Coder')).toBeTruthy();
    expect(screen.queryByText('Development')).toBeNull();
    expect(container.querySelector('.grid-cols-1')).toBeTruthy();
  });

  it('shows the empty state when no agents match', () => {
    renderList({ agents: [] });
    expect(screen.getByText('No agents found')).toBeTruthy();
  });

  it('does not expand the card when its header is clicked', () => {
    renderList();
    fireEvent.click(screen.getByText('Planner'));
    // No tabs, run form, or detail content appears — the box stays static.
    expect(screen.queryByText('Run')).toBeNull();
    expect(screen.getByText('Planner')).toBeTruthy();
  });

  it('opens the editor when Edit is clicked', () => {
    const onEditAgent = vi.fn();
    renderList({ onEditAgent });
    fireEvent.click(screen.getByText('Edit'));
    expect(onEditAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-1' }));
  });
});
