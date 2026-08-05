import { describe, expect, it } from 'vitest';
import { projectExecutionOutcome, summarizeOutcome } from '../src/state/execution-outcome.js';
import type { ConversationEntry, ToolCard } from '../src/types.js';

const ASSISTANT: ConversationEntry = {
  id: 'assistant-1',
  role: 'assistant',
  content: [
    'Implemented the change.',
    '',
    'Observations',
    '- Tests pass',
    '- No regressions found',
    '',
    'Unresolved',
    '- Flaky e2e on CI',
    '',
    'Next',
    '- Open a pull request',
  ].join('\n'),
};

const TOOLS: readonly ToolCard[] = [
  { id: 'tool-1', tool: 'shell', label: 'Run tests', status: 'completed', startedAt: '2026-08-04T00:00:00Z' },
];

describe('execution outcome projection', () => {
  it('projects a completed outcome with sections', () => {
    const outcome = projectExecutionOutcome({
      executionId: 'exec-1',
      assistantMessage: ASSISTANT,
      tools: TOOLS,
      cancelled: false,
    });
    expect(outcome.status).toBe('completed');
    expect(outcome.conclusion).toContain('Implemented the change');
    expect(outcome.observations).toEqual(
      expect.arrayContaining(['Tests pass', 'No regressions found', 'Tool Run tests completed']),
    );
    expect(outcome.unresolved).toContain('Flaky e2e on CI');
    expect(outcome.nextActions).toContain('Open a pull request');
  });

  it('marks cancellation', () => {
    const outcome = projectExecutionOutcome({ executionId: 'exec-1', tools: [], cancelled: true });
    expect(outcome.status).toBe('cancelled');
    expect(summarizeOutcome(outcome)).toBe('Execution cancelled.');
  });

  it('records a failure reason', () => {
    const outcome = projectExecutionOutcome({
      executionId: 'exec-1',
      tools: [],
      cancelled: false,
      failed: 'Provider timed out',
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.conclusion).toBe('Provider timed out');
    expect(summarizeOutcome(outcome)).toBe('Provider timed out');
  });

  it('handles an empty assistant message', () => {
    const outcome = projectExecutionOutcome({ executionId: 'exec-1', tools: [], cancelled: false });
    expect(outcome.status).toBe('completed');
    expect(outcome.conclusion).toBe('');
    expect(outcome.observations).toEqual([]);
    expect(outcome.evidence).toEqual([]);
  });
});
