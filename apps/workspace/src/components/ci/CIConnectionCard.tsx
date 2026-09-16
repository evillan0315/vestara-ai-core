/**
 * CI-UI-003 — GitHub integration/connection status (content block).
 *
 * Reusable across Settings, Activity Room, Execution, and Workflow. The host
 * owns card chrome/padding; this renders facts only.
 *
 * Displays configuration status only; credential values are never rendered.
 * Credential presence yields `configured` — never `connected`, which requires
 * an actual verified connectivity signal.
 */

import type { ReactNode } from 'react';
import { CIAuthorityNote, CIAvailabilityNotice, CIFact, CIToneChip } from './ci-chrome.js';
import type { CITone } from './ci-view-model.js';

/**
 * GitHub connection status.
 *
 * `connected` is only emitted when connectivity has been verified. The read
 * boundary emits `configured`/`unconfigured` from credential presence today.
 */
export type GitHubConnectionStatus = 'connected' | 'configured' | 'unconfigured' | 'unknown' | 'error';

const STATE: Record<GitHubConnectionStatus, { tone: CITone; label: string }> = {
  connected: { tone: 'positive', label: 'Connected' },
  configured: { tone: 'info', label: 'Configured' },
  unconfigured: { tone: 'unknown', label: 'Not configured' },
  unknown: { tone: 'unknown', label: 'Unknown' },
  error: { tone: 'negative', label: 'Error' },
};

export interface CIGitHubConnectionView {
  readonly status: GitHubConnectionStatus;
  readonly tokenConfigured: boolean;
  readonly webhookConfigured?: boolean;
  readonly provider?: string;
  readonly adapterVersion?: string;
  /** Repository identities observed from authoritative CI waits. */
  readonly repositories?: readonly string[];
}

export function CIGitHubConnection({
  connection,
  actions,
}: {
  connection: CIGitHubConnectionView;
  actions?: ReactNode;
}) {
  const state = STATE[connection.status];
  return (
    <div>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <p className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            {connection.provider ?? 'github-actions'}
          </p>
        </div>
        <CIToneChip tone={state.tone}>{state.label}</CIToneChip>
      </div>
      <div className="mt-2">
        <CIFact label="Connection status" value={state.label} tone={state.tone} />
        <CIFact
          label="Credential"
          value={connection.tokenConfigured ? 'Configured' : 'Not configured'}
          tone={connection.tokenConfigured ? 'positive' : 'unknown'}
        />
        <CIFact
          label="Webhook"
          value={
            connection.webhookConfigured === undefined
              ? 'Unknown'
              : connection.webhookConfigured
                ? 'Configured'
                : 'Not configured'
          }
        />
        <CIFact
          label="Repositories"
          value={
            connection.repositories && connection.repositories.length > 0
              ? connection.repositories.join(', ')
              : 'None observed'
          }
        />
        <CIFact label="Adapter version" value={connection.adapterVersion ?? 'Unknown'} mono />
      </div>
      {connection.status === 'configured' && (
        <CIAvailabilityNotice
          availability="unknown"
          label="Connectivity not verified"
          reason="A credential is configured; GitHub reachability has not been confirmed"
        />
      )}
      {connection.status === 'unconfigured' && (
        <CIAvailabilityNotice
          availability="unavailable"
          label="CI observation is offline"
          reason="No GitHub credential is configured"
        />
      )}
      {actions && <div className="border-t border-[var(--vestara-border-subtle)] px-4 py-3 sm:px-5">{actions}</div>}
      <CIAuthorityNote>
        Connection status ≠ CI status, and configuration ≠ authorization. Credential values are never displayed.
      </CIAuthorityNote>
    </div>
  );
}
