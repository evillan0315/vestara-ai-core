import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ExecutionSummaryPanel from '../src/pages/Agents/ExecutionSummaryPanel.js';
import type { ExecutionSummary } from '../src/pages/Agents/types.js';

const execSummary: ExecutionSummary = { total: 10, completed: 7, failed: 2, running: 1, successRate: 70 };

function renderPanel(props: { execSummary?: ExecutionSummary; executionsCount?: number } = {}) {
  return render(
    <ExecutionSummaryPanel
      execSummary={props.execSummary ?? execSummary}
      executionsCount={props.executionsCount ?? 10}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('ExecutionSummaryPanel', () => {
  it('renders the execution totals and success rate', () => {
    renderPanel();
    expect(screen.getByText('Execution Summary')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('10 finished')).toBeTruthy();
    expect(screen.getByText('70% success')).toBeTruthy();
  });

  it('hides the progress breakdown when there are no executions', () => {
    renderPanel({ executionsCount: 0 });
    expect(screen.queryByText('10 finished')).toBeNull();
    expect(screen.queryByText('70% success')).toBeNull();
  });
});
