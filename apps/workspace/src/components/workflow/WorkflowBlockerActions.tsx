/**
 * WorkflowBlockerActions — per-task recovery for blocked / failed tasks.
 *
 * Presentation only for the command preview: `showCommand` toggle and copy
 * live here. Execution stays with the page — `onRetry` performs
 * `POST /api/orchestration/projects/:projectId/tasks/:taskId/retry` and
 * `onCancel` clears page-level action feedback. No direct fetch here.
 */

import { useState } from 'react';
import { Button } from '@vestara/ui';

export interface WorkflowBlockerActionIds {
  projectId: string;
  taskId: string;
}

export interface WorkflowBlockerActionsProps extends WorkflowBlockerActionIds {
  taskStatus: string;
  busy: boolean;
  onRetry: (projectId: string, taskId: string) => void;
  onCancel: () => void;
}

export function buildRetryCommand(projectId: string, taskId: string): string {
  return `curl -X POST '/api/orchestration/projects/${projectId}/tasks/${taskId}/retry' -H 'Content-Type: application/json' -d '{"reason":"manual retry from Orchestration UI"}'`;
}

export function WorkflowBlockerActions({
  projectId,
  taskId,
  taskStatus,
  busy,
  onRetry,
  onCancel,
}: WorkflowBlockerActionsProps) {
  const [showCommand, setShowCommand] = useState(false);
  const [copied, setCopied] = useState(false);
  const command = buildRetryCommand(projectId, taskId);
  const retryLabel = taskStatus === 'failed' ? 'Retry task' : 'Retry';

  const handleCancel = () => {
    setShowCommand(false);
    setCopied(false);
    onCancel();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[var(--vestara-spacing-2)]">
      <div className="flex flex-wrap gap-[var(--vestara-spacing-2)]" role="group" aria-label={`Recovery actions for ${taskId}`}>
        <Button
          variant="primary"
          size="sm"
          disabled={busy}
          loading={busy}
          onClick={() => onRetry(projectId, taskId)}
          aria-label={`${retryLabel} ${taskId}`}
        >
          {retryLabel}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowCommand((visible) => !visible)}
          aria-expanded={showCommand}
          aria-label={showCommand ? `Hide retry command for ${taskId}` : `Show retry command for ${taskId}`}
        >
          {showCommand ? 'Hide command' : 'Show command'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCancel} aria-label={`Cancel recovery for ${taskId}`}>
          Cancel
        </Button>
      </div>
      {showCommand && (
        <div
          className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-[var(--vestara-spacing-3)]"
          aria-label={`Retry command for ${taskId}`}
        >
          <pre className="overflow-x-auto font-mono text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-secondary)]">
            {command}
          </pre>
          <div className="mt-[var(--vestara-spacing-2)] flex flex-wrap gap-[var(--vestara-spacing-2)]">
            <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
