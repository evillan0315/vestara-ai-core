/**
 * CI-UI-003 — Continuous Integration Settings surface.
 *
 * Clean production Settings presentation over the provider-neutral CI read
 * boundary (`GET /api/ci/status`). Live data is surfaced where an authoritative
 * read authority exists; everything else stays an explicit HOLD under Advanced
 * diagnostics — never fabricated.
 *
 * Layout: canonical Settings primitives (`SettingsSection`, `SettingsRow`) own
 * card chrome, gutters, and section spacing. CI components are content blocks
 * (no CI-specific panel/spacing primitives). No inline CSS, no raw palette
 * utilities — every visual value maps to a `--vestara-*` token.
 *
 * Authority: read/configuration presentation only. Settings UI ≠ CI authority;
 * GitHub CI status ≠ Vestara verification; CI PASS ≠ objective verification.
 *
 * @see docs/governance/UI-UX-GOVERNANCE.md
 */

import { useCallback, useState } from 'react';
import {
  CIAvailabilityNotice,
  CICorrelationDetails,
  CIGitHubConnection,
  CIGitHubStatus,
  CIStatusSeparationNote,
  CIVerificationWaitList,
  CIVestaraVerification,
  CIWebhookHealth,
  type CIGitHubCIView,
  type CIGitHubConnectionView,
  type CIStatusResult,
  type CIVestaraVerificationView,
  type CIWaitView,
  type CIWebhookHealthView,
  type GitHubConnectionStatus,
  useCIStatus,
  waitToView,
} from '../../../components/ci/index.js';
import { Button, FactRow, SettingsRow, SettingsSection, Status, Toggle } from '../settings-ui.js';

export type { GitHubConnectionStatus } from '../../../components/ci/index.js';

// ─── Local configuration state (no persistence authority) ───────────

/** CI observation health. */
export type CIObservationHealth = 'healthy' | 'degraded' | 'unavailable';

/** Snapshot of CI integration configuration state. */
export interface CISettingsState {
  readonly observationEnabled: boolean;
  readonly repositories: readonly string[];
  readonly workflowFilters: readonly string[];
  readonly branchFilters: readonly string[];
  readonly adapterHealth: CIObservationHealth;
}

const STATIC_DEFAULTS: CISettingsState = {
  observationEnabled: false,
  repositories: [],
  workflowFilters: [],
  branchFilters: [],
  adapterHealth: 'unavailable',
};

export function useCISettings(): { state: CISettingsState; loading: boolean; refresh: () => void } {
  const [state, setState] = useState<CISettingsState>(STATIC_DEFAULTS);
  const [loading] = useState(false);
  const refresh = useCallback(() => setState({ ...STATIC_DEFAULTS }), []);
  return { state, loading, refresh };
}

// ─── Fallback view (explicit HOLD when the read boundary is down) ───

function fallbackStatus(detail: string | undefined): {
  connection: CIGitHubConnectionView;
  github: CIGitHubCIView;
  verification: CIVestaraVerificationView;
  webhook: CIWebhookHealthView;
} {
  const reason = detail ?? 'The CI read boundary is unavailable';
  return {
    connection: { status: 'unknown', tokenConfigured: false },
    github: { availability: 'unavailable', reason },
    verification: { availability: 'unavailable', disposition: 'unavailable', reason },
    webhook: { state: 'unknown', detail: reason },
  };
}

// ─── Verification policy content ────────────────────────────────────

function RepositoryPolicyRows({ state }: { state: CISettingsState }) {
  return (
    <>
      {state.repositories.length > 0 ? (
        state.repositories.map((repo) => <SettingsRow key={repo} label={repo} value={<Status value="Mapped" />} />)
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
            No repositories configured. Repository mapping is not yet persisted.
          </p>
        </div>
      )}
    </>
  );
}

function VerificationPolicy({
  state,
  onAddRepository,
}: {
  state: CISettingsState;
  onAddRepository?: () => void;
}) {
  return (
    <SettingsSection
      title="Verification Policy"
      description="Which repositories, workflows and branches are observed. Configuration management is not yet persisted."
    >
      <RepositoryPolicyRows state={state} />
      <SettingsRow
        label="Workflows"
        description="Filter CI observation by workflow name (empty = all workflows)"
        value={
          state.workflowFilters.length > 0 ? (
            <span className="font-mono text-[var(--vestara-font-size-sm)]">{state.workflowFilters.join(', ')}</span>
          ) : (
            <span className="text-[var(--vestara-text-muted)]">All workflows</span>
          )
        }
      />
      <SettingsRow
        label="Branches"
        description="Filter CI observation by branch name (empty = all branches)"
        value={
          state.branchFilters.length > 0 ? (
            <span className="font-mono text-[var(--vestara-font-size-sm)]">{state.branchFilters.join(', ')}</span>
          ) : (
            <span className="text-[var(--vestara-text-muted)]">All branches</span>
          )
        }
      />
      <SettingsRow
        label="Observation enabled"
        description="Poll GitHub Actions for CI state on pushes"
        value={
          <fieldset disabled className="m-0 min-w-0 border-0 p-0 disabled:opacity-40">
            <Toggle
              label="CI observation"
              checked={state.observationEnabled}
              onChange={() => {
                /* Inert: the disabled fieldset blocks interaction. */
              }}
            />
          </fieldset>
        }
      />
      <SettingsRow
        label="Control state"
        description="Why the observation toggle cannot be changed"
        value={
          <span className="text-[var(--vestara-text-muted)]">
            Disabled — persistence unavailable (/api/ci/config does not exist)
          </span>
        }
      />
      <div className="border-t border-[var(--vestara-border-subtle)] px-4 py-3 sm:px-5">
        <Button disabled onClick={onAddRepository}>
          Add repository
        </Button>
        <Button disabled>Edit filters</Button>
        <span className="ml-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          Policy management not available yet
        </span>
      </div>
    </SettingsSection>
  );
}

// ─── Advanced / diagnostics ─────────────────────────────────────────

const AUTHORITY_BOUNDARIES: readonly (readonly [string, string])[] = [
  ['Settings UI ≠ CI authority', 'Configuration and diagnostics only'],
  ['GitHub status ≠ Vestara verification', 'Two independent decisions'],
  ['CI PASS ≠ objective verification', 'CI pass proceeds to the verification gate'],
  ['Observation ≠ authorization', 'Seeing state grants no mutation'],
  ['CI failure ≠ repair authority', 'Failure yields a candidate at most'],
  ['Push authority ≠ merge authority', 'Distinct grants; no automated merge'],
];

const DATA_GAPS: readonly string[] = [
  'CI observation body (status/conclusion/provider payload) — not persisted by an accepted store.',
  'Reviewer verdict/classification — decisions are transient and not persisted.',
  'Webhook delivery history — no delivery read boundary exists.',
  'Configured workflows/checks and repository mapping — no /api/ci/config boundary exists.',
  'Observation enable/disable persistence — no /api/ci/config boundary exists.',
];

function PolicyHeader({ title }: { title: string }) {
  return (
    <h4 className="text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-text-primary)]">{title}</h4>
  );
}

function AdvancedDiagnostics({
  webhook,
  wait,
}: {
  webhook: CIWebhookHealthView;
  wait: CIWaitView | undefined;
}) {
  return (
    <details className="st-panel overflow-hidden">
      <summary className="cursor-pointer px-4 py-4 text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-text-primary)] sm:px-5">
        Advanced — diagnostics
      </summary>
      <div className="border-t border-[var(--vestara-border-subtle)]">
        <CIWebhookHealth health={webhook} />
        {wait && <CICorrelationDetails correlation={wait.correlation} />}
        <div className="border-t border-[var(--vestara-border-subtle)] px-4 py-4 sm:px-5">
          <PolicyHeader title="Authority Boundaries" />
          <div className="mt-2">
            {AUTHORITY_BOUNDARIES.map(([label, value]) => (
              <FactRow
                key={label}
                label={label}
                value={<span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{value}</span>}
              />
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--vestara-border-subtle)] px-4 py-4 sm:px-5">
          <PolicyHeader title="Backend Data Gaps" />
          <p className="mt-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            Elements held (not fabricated) until an authoritative read source exists.
          </p>
          <div className="mt-2">
            {DATA_GAPS.map((gap) => (
              <FactRow
                key={gap}
                label={gap}
                value={<span className="font-medium text-[var(--vestara-status-warning)]">HOLD</span>}
              />
            ))}
          </div>
        </div>
        <div className="border-t border-[var(--vestara-border-subtle)] px-4 py-4 sm:px-5">
          <PolicyHeader title="Raw Provider Diagnostics" />
          <p className="mt-1 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            Canonical CI state is provider-neutral; raw provider payloads stay behind the adapter boundary and are not
            exposed to this surface.
          </p>
        </div>
      </div>
    </details>
  );
}

// ─── Main ───────────────────────────────────────────────────────────

export function CISettings({ statusOverride }: { statusOverride?: CIStatusResult } = {}) {
  const { state, loading } = useCISettings();
  const live = useCIStatus();
  const status = statusOverride ?? live;

  if (loading) {
    return (
      <div className="space-y-[var(--vestara-spacing-section)]">
        <div className="mpg-skeleton h-40" />
        <div className="mpg-skeleton h-32" />
        <div className="mpg-skeleton h-32" />
      </div>
    );
  }

  const fallback = fallbackStatus(status.detail);
  const view = status.view;
  const connection = view?.connection ?? fallback.connection;
  const github = view?.github ?? fallback.github;
  const verification = view?.verification ?? fallback.verification;
  const webhook = view?.webhook ?? fallback.webhook;
  const waits: readonly CIWaitView[] = view ? view.waits.map(waitToView) : [];

  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <SettingsSection
        title="GitHub Connection"
        description="GitHub Actions integration status. Credential values are never displayed."
      >
        <CIGitHubConnection
          connection={connection}
          actions={
            <>
              <Button disabled>Test connection</Button>
              <span className="ml-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                Connectivity verification is not available yet
              </span>
            </>
          }
        />
      </SettingsSection>

      <SettingsSection
        title="Continuous Integration"
        description="GitHub CI status and the Vestara verification decision — independent authorities."
      >
        <div className="grid grid-cols-1 divide-y divide-[var(--vestara-border-subtle)] md:grid-cols-2 md:divide-x md:divide-y-0">
          <CIGitHubStatus state={github} />
          <CIVestaraVerification state={verification} />
        </div>
        <CIStatusSeparationNote githubPassed={github.conclusion === 'passed'} />
      </SettingsSection>

      <SettingsSection
        title="Verification Waits"
        description="Authoritative task state and correlation for governed pushes awaiting GitHub CI (CI-OBS-002B2)."
      >
        {view ? (
          <CIVerificationWaitList waits={waits} />
        ) : (
          <CIAvailabilityNotice
            availability="unavailable"
            label="The CI read boundary is unavailable"
            reason={status.detail ?? 'CI waits cannot be displayed'}
          />
        )}
      </SettingsSection>

      <VerificationPolicy state={state} />

      <AdvancedDiagnostics webhook={webhook} wait={waits[0]} />
    </div>
  );
}
