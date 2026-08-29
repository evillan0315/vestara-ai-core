// OpenCode execution evidence — renderer-free normalization of an OpenCode
// session's execution into a verifier-readable summary. Consumes the typed
// message history, diff, and todos already normalized by the client, plus the
// session binding for execution correlation. Never touches the renderer or the
// upstream server; unit-testable without one.

import type { OpenCodeDiffFile, OpenCodeMessage, OpenCodeTodo } from '../client/opencode-types';

export interface OpenCodeEvidenceTodoSummary {
  readonly id?: string;
  readonly content: string;
  readonly status?: string;
}

export interface OpenCodeEvidenceDiffSummary {
  readonly path: string;
  readonly operation?: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly additions?: number;
  readonly deletions?: number;
}

export interface OpenCodeEvidenceMessageSummary {
  readonly id?: string;
  readonly role?: string;
  readonly text: string;
}

export interface OpenCodeExecutionEvidence {
  readonly sessionId: string;
  readonly executionId?: string;
  readonly workspaceId?: string;
  readonly messageCount: number;
  readonly messages: readonly OpenCodeEvidenceMessageSummary[];
  readonly changedFiles: readonly OpenCodeEvidenceDiffSummary[];
  readonly additions: number;
  readonly deletions: number;
  readonly todos: readonly OpenCodeEvidenceTodoSummary[];
  readonly openTodos: number;
  readonly completedTodos: number;
  /** Agent-interpreted conclusion: 'completed' | 'aborted' | 'error' | 'unknown'. */
  readonly outcome: 'completed' | 'aborted' | 'error' | 'unknown';
}

export interface SummarizeOpenCodeExecutionInput {
  readonly sessionId: string;
  readonly executionId?: string;
  readonly workspaceId?: string;
  readonly messages?: readonly OpenCodeMessage[];
  readonly diff?: readonly OpenCodeDiffFile[];
  readonly todos?: readonly OpenCodeTodo[];
  readonly aborted?: boolean;
}

/** Summarize a session execution into verifier-readable evidence. */
export function summarizeOpenCodeExecution(input: SummarizeOpenCodeExecutionInput): OpenCodeExecutionEvidence {
  const messages = input.messages ?? [];
  const diff = input.diff ?? [];
  const todos = input.todos ?? [];
  const additions = diff.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = diff.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  const openTodos = todos.filter(
    (todo) => !todo.status || /(^|[-_\s])(pending|open|in-progress|todo)$/i.test(todo.status),
  ).length;
  const completedTodos = todos.length - openTodos;
  const outcome: OpenCodeExecutionEvidence['outcome'] = input.aborted
    ? 'aborted'
    : messages.some((message) => message.role === 'assistant' && message.text.length > 0)
      ? 'completed'
      : 'unknown';
  return {
    sessionId: input.sessionId,
    executionId: input.executionId,
    workspaceId: input.workspaceId,
    messageCount: messages.length,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
    })),
    changedFiles: diff.map((file) => ({
      path: file.path,
      operation: file.operation,
      additions: file.additions,
      deletions: file.deletions,
    })),
    additions,
    deletions,
    todos: todos.map((todo) => ({ id: todo.id, content: todo.content, status: todo.status })),
    openTodos,
    completedTodos,
    outcome,
  };
}

/** Render an evidence summary into a compact verifier-readable text block. */
export function renderOpenCodeExecutionEvidence(evidence: OpenCodeExecutionEvidence): string {
  const lines = [
    `OpenCode execution ${evidence.executionId ?? evidence.sessionId}`,
    `Session: ${evidence.sessionId}`,
    `Outcome: ${evidence.outcome}`,
    `Messages: ${evidence.messageCount}`,
    `Changed files: ${evidence.changedFiles.length} (+${evidence.additions}/-${evidence.deletions})`,
    `Todos: ${evidence.completedTodos}/${evidence.todos.length} complete (${evidence.openTodos} open)`,
    '',
    ...evidence.changedFiles.map(
      (file) => `  ${file.operation ?? 'modified'} ${file.path} (+${file.additions ?? 0}/-${file.deletions ?? 0})`,
    ),
    '',
    ...evidence.todos.map((todo) => `  [${todo.status ?? 'pending'}] ${todo.content}`),
    '',
    ...evidence.messages
      .filter((message) => message.text.length > 0)
      .slice(-6)
      .map((message) => `  ${message.role}: ${message.text.slice(0, 200)}`),
  ];
  return lines.join('\n');
}
