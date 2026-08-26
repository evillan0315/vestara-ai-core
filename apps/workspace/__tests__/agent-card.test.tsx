import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/Toast.js';
import { AgentCard } from '../src/pages/Agents/AgentCard.js';
import type { Agent, AgentStats, Execution } from '../src/pages/Agents/types.js';

function json(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-1',
    name: 'Planner',
    role: 'planner',
    agentType: 'workspace',
    description: 'Plans tasks',
    capabilities: ['planning', 'dependency-analysis'],
    permissions: [],
    status: 'active',
    color: '#6b7280',
    createdAt: '2026-08-06T00:00:00.000Z',
    ...overrides,
  };
}

const stats: AgentStats = { total: 2, completed: 1, failed: 1, running: 0, avgDuration: 5 };

const executions: Execution[] = [
  {
    id: 'e1',
    agentId: 'agent-1',
    task: 'Write plan',
    status: 'completed',
    startedAt: '2026-08-06T10:00:00.000Z',
    completedAt: '2026-08-06T10:01:00.000Z',
  },
  { id: 'e2', agentId: 'agent-1', task: 'Fix bug', status: 'failed', startedAt: '2026-08-06T10:02:00.000Z' },
];

interface CardProps {
  isExpanded?: boolean;
  onToggle?: () => void;
  onEdit?: () => void;
  onToggleStatus?: () => void;
  onDelete?: () => void;
  onOpenExecution?: (execution: Execution) => void;
}

function renderCard(props: CardProps = {}) {
  return render(
    <ToastProvider>
      <AgentCard
        agent={agent()}
        isExpanded={props.isExpanded ?? true}
        stats={stats}
        executions={executions}
        harnessSessions={[]}
        onToggle={props.onToggle ?? (() => {})}
        onEdit={props.onEdit ?? (() => {})}
        onToggleStatus={props.onToggleStatus ?? (() => {})}
        onDelete={props.onDelete ?? (() => {})}
        onOpenExecution={props.onOpenExecution ?? (() => {})}
        onLoad={() => {}}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/runs')) return json({ threadId: 'thread-1', runId: 'run-1', state: 'running' });
      if (u.includes('/api/agent-threads/')) {
        return json({ threadId: 'thread-1', runId: 'run-1', state: 'completed', session: { id: 's1' } });
      }
      return json({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AgentCard', () => {
  it('renders the agent identity, capabilities, and execution history when expanded', () => {
    renderCard();
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.getByText('planner')).toBeTruthy();
    expect(screen.getByText('planning')).toBeTruthy();
    expect(screen.getByText('Write plan')).toBeTruthy();
    expect(screen.getByText('Fix bug')).toBeTruthy();
  });

  it('collapses the expanded details when isExpanded is false', () => {
    renderCard({ isExpanded: false });
    expect(screen.getByText('Planner')).toBeTruthy();
    expect(screen.queryByText('Write plan')).toBeNull();
  });

  it('invokes the status toggle and delete handlers', () => {
    const onToggleStatus = vi.fn();
    const onDelete = vi.fn();
    renderCard({ onToggleStatus, onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
    expect(onToggleStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('opens an execution detail when a task row is clicked', () => {
    const onOpenExecution = vi.fn();
    renderCard({ onOpenExecution });
    fireEvent.click(screen.getByText('Write plan'));
    expect(onOpenExecution).toHaveBeenCalledWith(executions[0]);
  });

  it('runs a task through the harness and surfaces the outcome', async () => {
    renderCard();
    fireEvent.change(screen.getByPlaceholderText('Assign a task to this agent...'), {
      target: { value: 'Do the thing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() => expect(screen.getByText(/Harness run completed · session s1/)).toBeTruthy());
  });
});
