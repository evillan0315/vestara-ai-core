/**
 * CI-UI-003 — GitHub CI status vs Vestara verification (content blocks).
 *
 * Two adjacent, deliberately separate blocks. The Vestara block never renders
 * "verified" from a green GitHub run: a passing CI run only moves the objective
 * to *pending Vestara verification*.
 */

import type { ReactNode } from 'react';
import { CIAuthorityNote, CIAvailabilityNotice, CIFact, CISubHeading, CIToneChip } from './ci-chrome.js';
import type { CIGitHubCIView, CIVerificationDisposition, CIVestaraVerificationView } from './ci-view-model.js';
import {
  labelForAction,
  labelForConclusion,
  labelForDisposition,
  labelForStatus,
  labelForVerdict,
  relativeTime,
  toneForConclusion,
  toneForDisposition,
  toneForStatus,
} from './ci-view-model.js';

// ─── GitHub CI status ───────────────────────────────────────────────

export function CIGitHubStatus({ state }: { state: CIGitHubCIView }) {
  const available = state.availability === 'available';
  return (
    <div className="flex h-full min-w-0 flex-col">
      <CISubHeading
        title="GitHub CI Status"
        actions={
          available ? (
            <CIToneChip tone={state.conclusion ? toneForConclusion(state.conclusion) : toneForStatus(state.status)}>
              {state.conclusion && state.status === 'completed'
                ? labelForConclusion(state.conclusion)
                : labelForStatus(state.status)}
            </CIToneChip>
          ) : (
            <CIToneChip tone="unknown">No observation</CIToneChip>
          )
        }
      />
      <div className="flex-1">
        {!available ? (
          <CIAvailabilityNotice
            availability={state.availability}
            label="No CI observation is available"
            reason={state.reason ?? 'No CI observation read authority is exposed by the backend'}
          />
        ) : (
          <>
            <CIFact label="Canonical status" value={labelForStatus(state.status)} tone={toneForStatus(state.status)} />
            <CIFact
              label="Conclusion"
              value={labelForConclusion(state.conclusion)}
              tone={toneForConclusion(state.conclusion)}
            />
            <CIFact label="Workflow" value={state.workflowName ?? 'Not reported'} />
            <CIFact label="Run identity" value={state.runId ?? 'Not observed'} mono />
            <CIFact label="Commit" value={state.commitSha ?? 'Not observed'} mono />
            <CIFact label="Observed" value={relativeTime(state.observedAt)} />
          </>
        )}
        {available && state.retrievalFailure && (
          <CIAvailabilityNotice
            availability="unknown"
            label="Retrieval failure"
            reason={
              state.retrievalError
                ? `${state.retrievalError} — retrieval failure, not a CI failure`
                : 'Adapter could not retrieve CI state — this is not a CI failure'
            }
          />
        )}
      </div>
      <CIAuthorityNote>
        GitHub executes. GitHub CI status ≠ Vestara verification.
      </CIAuthorityNote>
    </div>
  );
}

// ─── Vestara verification decision ──────────────────────────────────

export function CIVestaraVerification({ state }: { state: CIVestaraVerificationView }) {
  const available = state.availability === 'available' && state.disposition !== 'unavailable';
  return (
    <div className="flex h-full min-w-0 flex-col">
      <CISubHeading
        title="Vestara Verification"
        actions={
          available ? (
            <CIToneChip tone={toneForDisposition(state.disposition)}>{verdictBadge(state)}</CIToneChip>
          ) : (
            <CIToneChip tone="unknown">No decision</CIToneChip>
          )
        }
      />
      <div className="flex-1">
        {!available ? (
          <CIAvailabilityNotice
            availability={state.availability}
            label="No Vestara verification decision is available"
            reason={state.reason ?? 'Reviewer decisions are not persisted by an accepted read authority'}
          />
        ) : (
          <>
            <CIFact
              label="Disposition"
              value={labelForDisposition(state.disposition)}
              tone={toneForDisposition(state.disposition)}
            />
            <CIFact label="Workflow action" value={labelForAction(state.action)} />
            <CIFact label="Reviewer verdict" value={labelForVerdict(state.verdict)} />
            <CIFact label="Classification (finding)" value={state.classification ?? 'Not recorded'} mono />
            <CIFact
              label="Decision reference"
              value={state.decisionRef ?? 'Not cited'}
              mono
              title="Cited exactly-once on resume"
            />
            <CIFact label="Decided" value={relativeTime(state.decidedAt)} />
          </>
        )}
      </div>
      <CIAuthorityNote>
        {state.disposition === 'pending-verification'
          ? 'GitHub CI passed. The objective is pending Vestara verification — CI PASS ≠ objective verification.'
          : 'A verification decision is a record, not a mutation. Observation ≠ authorization.'}
      </CIAuthorityNote>
    </div>
  );
}

function verdictBadge(state: CIVestaraVerificationView): ReactNode {
  if (state.disposition === 'pending-verification') return 'CI passed · verification pending';
  return labelForDisposition(state.disposition);
}

// ─── Separation banner ──────────────────────────────────────────────

/**
 * Explicit separation statement, safe to render wherever both statuses are
 * shown (Settings, Activity Room, Execution, Workflow).
 */
export function CIStatusSeparationNote({ githubPassed }: { githubPassed: boolean }) {
  return (
    <div className="mx-4 my-4 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-status-info-border)] bg-[var(--vestara-status-info-bg)] px-4 py-3 sm:mx-5">
      <p className="text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-secondary)]">
        <span className="font-semibold text-[var(--vestara-status-info)]">Authority boundary.</span>{' '}
        {githubPassed
          ? 'GitHub CI PASS ≠ objective verification. Vestara verification remains pending until the reviewer/verifier decides.'
          : 'GitHub CI status and the Vestara verification decision are independent authorities. Neither implies the other.'}{' '}
        CI PASS ≠ objective verification; observation ≠ authorization.
      </p>
    </div>
  );
}
