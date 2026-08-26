import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TeamsPanel from '../src/pages/Agents/TeamsPanel.js';
import type { Agent, Team } from '../src/pages/Agents/types.js';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    name: 'Planner',
    role: 'planner',
    agentType: 'workspace',
    capabilities: [],
    permissions: [],
    status: 'active',
    color: '#6b7280',
    createdAt: '',
    ...overrides,
  };
}

const teams: Team[] = [
  {
    id: 't1',
    name: 'Platform',
    description: 'Core platform',
    leaderAgentId: 'a1',
    memberIds: ['a1'],
    createdAt: '',
  },
];

function renderPanel(props: { onOpenTeamCreator?: () => void } = {}) {
  return render(
    <TeamsPanel
      teams={teams}
      agents={[agent()]}
      onLoad={() => {}}
      onOpenTeamCreator={props.onOpenTeamCreator ?? (() => {})}
    />,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TeamsPanel', () => {
  it('renders teams with their member and leader summary', () => {
    renderPanel();
    expect(screen.getByText('Platform')).toBeTruthy();
    expect(screen.getByText('1 members · leader: Planner')).toBeTruthy();
  });

  it('shows the empty state when there are no teams', () => {
    render(<TeamsPanel teams={[]} agents={[agent()]} onLoad={() => {}} onOpenTeamCreator={() => {}} />);
    expect(screen.getByText('No teams yet')).toBeTruthy();
  });

  it('expands a team to reveal its members', () => {
    renderPanel();
    fireEvent.click(screen.getByText('Platform'));
    expect(screen.getByText('Planner')).toBeTruthy();
  });

  it('opens the team creator from the + New button', () => {
    const onOpenTeamCreator = vi.fn();
    renderPanel({ onOpenTeamCreator });
    fireEvent.click(screen.getByRole('button', { name: '+ New' }));
    expect(onOpenTeamCreator).toHaveBeenCalledTimes(1);
  });

  it('adds an unassigned agent to the team through the member endpoint', async () => {
    render(
      <TeamsPanel
        teams={teams}
        agents={[agent({ id: 'a1', name: 'Planner' }), agent({ id: 'a2', name: 'Verifier', role: 'verifier' })]}
        onLoad={() => {}}
        onOpenTeamCreator={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Platform'));
    fireEvent.change(screen.getByPlaceholderText('Add agent...'), { target: { value: 'Verifier' } });
    const add = screen.getByRole('button', { name: 'Verifier+' });
    expect(add).toBeTruthy();
    fireEvent.click(add);
    await waitFor(() => {
      const fetchMock = fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledWith('/api/teams/t1/members', expect.any(Object));
    });
  });
});
