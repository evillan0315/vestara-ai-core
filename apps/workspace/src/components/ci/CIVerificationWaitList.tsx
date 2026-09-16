/**
 * CI-UI-003 — Authoritative external-verification waits (content list).
 *
 * Source: the workflow-orchestrator `TaskStore` projection (`externalWait`,
 * CI-OBS-002B2). The task store owns task/`awaiting-verification` authority;
 * this component only renders it.
 */

import { CIAuthorityNote, CIFact, CIToneChip } from './ci-chrome.js';
import { CILifecycleStages } from './CILifecycleTrace.js';
import type { CIGitHubCIView, CIVestaraVerificationView, CIWaitView } from './ci-view-model.js';
import { buildLifecycle, relativeTime, shortSha } from './ci-view-model.js';

const UNAVAILABLE_GITHUB: CIGitHubCIView = { availability: 'unavailable' };
const UNAVAILABLE_VERIFICATION: CIVestaraVerificationView = {
  availability: 'unavailable',
  disposition: 'unavailable',
};

function statusTone(status: string): 'info' | 'positive' | 'unknown' {
  if (status === 'awaiting-verification') return 'info';
  if (status === 'in-progress') return 'positive';
  return 'unknown';
}

function WaitCard({
  wait,
  github,
  verification,
}: {
  wait: CIWaitView;
  github: CIGitHubCIView;
  verification: CIVestaraVerificationView;
}) {
  const resumed = wait.correlation.resumedAt.availability === 'available';
  const runRef = wait.correlation.workflowRunId;
  return (
    <article className="overflow-hidden rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vestara-border-subtle)] px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h4 className="truncate text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">
            {wait.taskSummary}
          </h4>
          <p className="truncate text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            {wait.taskId} · {wait.correlation.repository}:{wait.correlation.branch} @{' '}
            {shortSha(wait.correlation.commitSha)}
          </p>
        </div>
        <CIToneChip tone={statusTone(wait.taskStatus)}>{wait.taskStatus}</CIToneChip>
      </header>
      <CIFact label="Correlation ID" value={wait.correlation.correlationId} mono />
      <CIFact
        label="Provider run"
        value={runRef.availability === 'available' ? runRef.value : (runRef.reason ?? 'Not observed')}
        mono={runRef.availability === 'available'}
        tone={runRef.availability === 'available' ? undefined : 'unknown'}
      />
      <CIFact label="Suspended" value={relativeTime(available(wait.correlation.suspendedAt))} />
      <CIFact
        label="Resumed"
        value={resumed ? relativeTime(available(wait.correlation.resumedAt)) : 'Not resumed'}
        tone={resumed ? 'positive' : 'unknown'}
      />
      <CILifecycleStages stages={buildLifecycle(wait, github, verification)} />
      <CIAuthorityNote>
        The workflow task store is authoritative for this wait. This view reads it; it cannot mutate task state or
        resume a wait.
      </CIAuthorityNote>
    </article>
  );
}

function available(
  field: { availability: 'available'; value: string } | { availability: 'unavailable' },
): string | undefined {
  return field.availability === 'available' ? field.value : undefined;
}

export function CIVerificationWaitList({
  waits,
  githubFor,
  verificationFor,
  emptyMessage = 'No external-verification waits are recorded.',
}: {
  waits: readonly CIWaitView[];
  githubFor?: (wait: CIWaitView) => CIGitHubCIView;
  verificationFor?: (wait: CIWaitView) => CIVestaraVerificationView;
  emptyMessage?: string;
}) {
  return (
    <div className="px-4 py-4 sm:px-5">
      {waits.length === 0 ? (
        <p className="py-6 text-center text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
          {emptyMessage}
        </p>
      ) : (
        <div className="space-y-3">
          {waits.map((wait) => (
            <WaitCard
              key={wait.correlation.correlationId}
              wait={wait}
              github={githubFor?.(wait) ?? UNAVAILABLE_GITHUB}
              verification={verificationFor?.(wait) ?? UNAVAILABLE_VERIFICATION}
            />
          ))}
        </div>
      )}
    </div>
  );
}
