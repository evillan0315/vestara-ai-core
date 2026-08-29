import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentExecutionHistory from '../src/pages/Agents/AgentExecutionHistory.js';
import type { Execution } from '../src/pages/Agents/types.js';

function execution(overrides: Partial<Execution>): Execution {
  return {
    id: 'e1',
    agentId: 'agent-1',
    task: 'Write plan',
    status: 'completed',
    startedAt: '2026-08-06T10:00:00.000Z',
    completedAt: '2026-08-06T10:01:00.000Z',
    ...overrides,
  };
}

const executions: Execution[] = [
  execution({ id: 'e1', task: 'Write plan', status: 'completed' }),
  execution({ id: 'e2', task: 'Fix bug', status: 'failed' }),
  execution({ id: 'e3', task: 'Deploy', status: 'running' }),
];

function renderHistory(props: { executions?: Execution[]; onOpenExecution?: (execution: Execution) => void } = {}) {
  return render(
    <AgentExecutionHistory
      executions={props.executions ?? executions}
      onOpenExecution={props.onOpenExecution ?? (() => {})}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('AgentExecutionHistory', () => {
  it('renders the task count and each execution row', () => {
    renderHistory();
    expect(screen.getByText('Tasks (3)')).toBeTruthy();
    expect(screen.getByText('Write plan')).toBeTruthy();
    expect(screen.getByText('Fix bug')).toBeTruthy();
    expect(screen.getByText('Deploy')).toBeTruthy();
  });

  it('shows the empty state when there are no executions', () => {
    renderHistory({ executions: [] });
    expect(screen.getByText('No executions')).toBeTruthy();
  });

  it('filters rows by the selected status', () => {
    renderHistory();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'completed' } });
    expect(screen.getByText('Write plan')).toBeTruthy();
    expect(screen.queryByText('Fix bug')).toBeNull();
  });

  it('invokes onOpenExecution when a row is clicked', () => {
    const onOpenExecution = vi.fn();
    renderHistory({ onOpenExecution });
    fireEvent.click(screen.getByText('Fix bug'));
    expect(onOpenExecution).toHaveBeenCalledWith(executions[1]);
  });

  it('paginates when more than one page of executions exists', () => {
    const many = Array.from({ length: 12 }, (_, i) => execution({ id: `e${i}`, task: `Task ${i}` }));
    renderHistory({ executions: many });
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Task 11')).toBeTruthy();
  });
});
