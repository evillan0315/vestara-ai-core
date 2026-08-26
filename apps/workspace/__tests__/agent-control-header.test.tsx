import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgentControlHeader from '../src/pages/Agents/AgentControlHeader.js';
import type { ExecutionSummary } from '../src/pages/Agents/types.js';

const execSummary: ExecutionSummary = { total: 10, completed: 7, failed: 2, running: 1, successRate: 70 };

function renderHeader(props: Partial<Parameters<typeof AgentControlHeader>[0]> = {}) {
  return render(
    <AgentControlHeader
      agentsCount={3}
      activeCount={2}
      totalSlots={16}
      teamsCount={4}
      executionsCount={10}
      execSummary={execSummary}
      onAddAgent={() => {}}
      onAddTeam={() => {}}
      onToggleWorkflow={() => {}}
      onRefresh={() => {}}
      {...props}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('AgentControlHeader', () => {
  it('renders the roster summary line and stat cards', () => {
    renderHeader();
    expect(screen.getByText('2 active · 3/16 registered · 4 teams · 10 executions')).toBeTruthy();
    expect(screen.getByText('Registered')).toBeTruthy();
    expect(screen.getByText('3/16')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Executions')).toBeTruthy();
    expect(screen.getByText('Success Rate')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
  });

  it('shows the running count as an active badge on the executions card', () => {
    renderHeader();
    expect(screen.getByText('1 active')).toBeTruthy();
  });

  it('invokes the header action handlers', () => {
    const onAddAgent = vi.fn();
    const onAddTeam = vi.fn();
    const onToggleWorkflow = vi.fn();
    const onRefresh = vi.fn();
    renderHeader({ onAddAgent, onAddTeam, onToggleWorkflow, onRefresh });

    fireEvent.click(screen.getByRole('button', { name: '+ Add Agent' }));
    expect(onAddAgent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '+ Team' }));
    expect(onAddTeam).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '⚡ Run Workflow' }));
    expect(onToggleWorkflow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: '↻' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('colors the success rate by threshold', () => {
    const { rerender } = renderHeader({ execSummary: { ...execSummary, successRate: 90 } });
    const green = screen.getByText('90%');
    expect(green.className).toContain('text-green-400');
    rerender(
      <AgentControlHeader
        agentsCount={3}
        activeCount={2}
        totalSlots={16}
        teamsCount={4}
        executionsCount={10}
        execSummary={{ ...execSummary, successRate: 30 }}
        onAddAgent={() => {}}
        onAddTeam={() => {}}
        onToggleWorkflow={() => {}}
        onRefresh={() => {}}
      />,
    );
    expect(screen.getByText('30%').className).toContain('text-red-400');
  });
});
