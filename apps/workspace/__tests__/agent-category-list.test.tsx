import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/Toast.js';
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

function renderList(props: { agents?: Agent[]; onSelectAgent?: (agent: Agent | null) => void } = {}) {
  return render(
    <ToastProvider>
      <AgentCategoryList
        agents={props.agents ?? [agent({})]}
        teams={[]}
        executions={[]}
        agentStats={{}}
        selectedAgent={null}
        harnessSessions={[]}
        onSelectAgent={props.onSelectAgent ?? (() => {})}
        onEditAgent={() => {}}
        onToggleStatus={() => {}}
        onDeleteAgent={() => {}}
        onOpenExecution={() => {}}
        onLoad={() => {}}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('AgentCategoryList', () => {
  it('groups agents under their role category', () => {
    renderList({ agents: [agent({ id: 'a1', name: 'Planner', role: 'planner' })] });
    expect(screen.getByText('Development')).toBeTruthy();
    expect(screen.getByText('1 · 1 active')).toBeTruthy();
    expect(screen.getByText('Planner')).toBeTruthy();
  });

  it('shows the empty state when no agents match', () => {
    renderList({ agents: [] });
    expect(screen.getByText('No agents found')).toBeTruthy();
  });

  it('collapses a category and hides its agents', () => {
    renderList();
    fireEvent.click(screen.getByText('Development'));
    expect(screen.queryByText('Planner')).toBeNull();
    fireEvent.click(screen.getByText('Development'));
    expect(screen.getByText('Planner')).toBeTruthy();
  });

  it('selects an agent when its card header is clicked', () => {
    const onSelectAgent = vi.fn();
    renderList({ onSelectAgent });
    fireEvent.click(screen.getByText('Planner'));
    expect(onSelectAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'agent-1' }));
  });
});
