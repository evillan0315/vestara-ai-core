import { describe, expect, it } from 'vitest';
import { renderOpenCodeExecutionEvidence, summarizeOpenCodeExecution } from '../src/evidence/execution-evidence';

describe('summarizeOpenCodeExecution', () => {
  const diff = [
    { path: 'src/a.ts', operation: 'modified' as const, additions: 3, deletions: 1, hunks: [] },
    { path: 'src/b.ts', operation: 'added' as const, additions: 10, deletions: 0, hunks: [] },
  ];
  const todos = [
    { id: 't1', content: 'Implement x', status: 'pending' },
    { id: 't2', content: 'Done y', status: 'completed' },
  ];
  const messages = [
    { id: 'm1', role: 'user', text: 'do the thing' },
    { id: 'm2', role: 'assistant', text: 'done' },
  ];

  it('computes additions, deletions, and todo counts', () => {
    const evidence = summarizeOpenCodeExecution({
      sessionId: 'ses_1',
      executionId: 'exec_1',
      workspaceId: 'ws_1',
      diff,
      todos,
      messages,
    });
    expect(evidence.additions).toBe(13);
    expect(evidence.deletions).toBe(1);
    expect(evidence.completedTodos).toBe(1);
    expect(evidence.openTodos).toBe(1);
    expect(evidence.changedFiles).toHaveLength(2);
    expect(evidence.outcome).toBe('completed');
  });

  it('marks aborted executions as aborted', () => {
    const evidence = summarizeOpenCodeExecution({
      sessionId: 'ses_1',
      executionId: 'exec_1',
      aborted: true,
      diff,
      todos,
      messages,
    });
    expect(evidence.outcome).toBe('aborted');
  });

  it('defaults outcome to unknown when no assistant reply exists', () => {
    const evidence = summarizeOpenCodeExecution({
      sessionId: 'ses_1',
      messages: [{ id: 'm1', role: 'user', text: 'hello' }],
    });
    expect(evidence.outcome).toBe('unknown');
    expect(evidence.messageCount).toBe(1);
  });

  it('treats empty inputs as empty', () => {
    const evidence = summarizeOpenCodeExecution({ sessionId: 'ses_1' });
    expect(evidence.changedFiles).toEqual([]);
    expect(evidence.todos).toEqual([]);
    expect(evidence.messages).toEqual([]);
    expect(evidence.additions).toBe(0);
  });
});

describe('renderOpenCodeExecutionEvidence', () => {
  it('renders a compact verifier-readable block', () => {
    const evidence = summarizeOpenCodeExecution({
      sessionId: 'ses_1',
      executionId: 'exec_1',
      diff: [{ path: 'src/a.ts', operation: 'modified', additions: 3, deletions: 1, hunks: [] }],
      todos: [{ id: 't1', content: 'Implement x', status: 'pending' }],
      messages: [{ id: 'm2', role: 'assistant', text: 'done the work' }],
    });
    const rendered = renderOpenCodeExecutionEvidence(evidence);
    expect(rendered).toContain('exec_1');
    expect(rendered).toContain('modified src/a.ts (+3/-1)');
    expect(rendered).toContain('[pending] Implement x');
    expect(rendered).toContain('assistant: done the work');
  });
});
