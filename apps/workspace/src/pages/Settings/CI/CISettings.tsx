/**
 * CI-UI-001 — Continuous Integration Settings Surface.
 *
 * First Vestara Settings UI for the CI integration established by
 * frozen CI-OBS-001B (contracts) and CI-OBS-001C (GitHub adapter).
 *
 * Architectural boundary:
 *   Settings UI → configuration/integration boundary → CI runtime
 *   Settings must NOT become the source of truth for CI runs, jobs,
 *   checks, observations, findings, or evidence.
 *
 * State of this surface:
 *   - No CI API endpoints exist; every interactive control renders an
 *     honest disabled state. The UI neither persists nor invents authority.
 *   - Canonical CIStatus is consumed from @vestara/ci-contracts — the UI
 *     defines no CI vocabulary of its own.
 *   - All visual values use canonical Vestara tokens
 *     (packages/ui-tokens → generated-tokens.css). No hardcode.
 *
 * @see docs/governance/UI-UX-GOVERNANCE.md
 */

import type { CIStatus } from '@vestara/ci-contracts';
import { useCallback, useState } from 'react';
import { Button, FactRow, SettingsRow, SettingsSection, Status, Toggle } from '../settings-ui.js';

// ─── Types ──────────────────────────────────────────────────────────

/** GitHub connection status. */
export type GitHubConnectionStatus = 'connected' | 'disconnected' | 'rate-limited' | 'error';

/** CI observation health. */
export type CIObservationHealth = 'healthy' | 'degraded' | 'unavailable';

/** Snapshot of CI integration state. */
export interface CISettingsState {
  /** GitHub connection status. */
  readonly githubConnection: GitHubConnectionStatus;
  /** Whether CI observation is enabled. */
  readonly observationEnabled: boolean;
  /** Repositories being observed. */
  readonly repositories: readonly string[];
  /** Active workflow filters (empty = all). */
  readonly workflowFilters: readonly string[];
  /** Active branch filters (empty = all). */
  readonly branchFilters: readonly string[];
  /** Adapter health. */
  readonly adapterHealth: CIObservationHealth;
  /** ISO timestamp of last successful observation, if any. */
  readonly lastSuccessfulObservation?: string;
  /** ISO timestamp of last retrieval/error, if any. */
  readonly lastRetrievalError?: string;
  /** Last retrieval error message, if any. */
  readonly lastRetrievalErrorMessage?: string;
  /** Last observed canonical status, if any. */
  readonly lastCanonicalStatus?: CIStatus;
  /** Last observed provider-native status (for diagnostics). */
  readonly lastProviderStatus?: string;
  /** GitHub token configured. */
  readonly tokenConfigured: boolean;
  /** Adapter version string. */
  readonly adapterVersion?: string;
}

/** Static defaults shown while no CI API boundary exists. */
const STATIC_DEFAULTS: CISettingsState = {
  githubConnection: 'disconnected',
  observationEnabled: false,
  repositories: [],
  workflowFilters: [],
  branchFilters: [],
  adapterHealth: 'unavailable',
  tokenConfigured: false,
  adapterVersion: '@vestara/github-ci-adapter@0.1.0',
};

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Hook for CI settings state.
 *
 * Returns static defaults: no CI API endpoints exist, so there is
 * nothing to fetch and nothing to persist. Refresh re-asserts the
 * static defaults. Observation toggling is not offered — without an
 * authoritative persistence boundary the UI must not imply a change
 * was saved.
 */
export function useCISettings(): {
  state: CISettingsState;
  loading: boolean;
  refresh: () => void;
} {
  const [state, setState] = useState<CISettingsState>(STATIC_DEFAULTS);
  // Reserved for future API wiring — always false until /api/ci/status exists.
  const [loading] = useState(false);

  const refresh = useCallback(() => {
    setState({ ...STATIC_DEFAULTS });
  }, []);

  return { state, loading, refresh };
}

// ─── Helper ─────────────────────────────────────────────────────────

function relativeTime(iso: string | undefined): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Unknown';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// ─── Sub-components ─────────────────────────────────────────────────

function GitHubConnectionSection({ state }: { state: CISettingsState }) {
  const statusValue =
    state.githubConnection === 'connected'
      ? 'Connected'
      : state.githubConnection === 'rate-limited'
        ? 'Rate limited'
        : state.githubConnection === 'error'
          ? 'Error'
          : 'Disconnected';

  return (
    <SettingsSection
      title="GitHub Connection"
      description="Authentication status for the GitHub Actions API adapter."
    >
      <SettingsRow
        label="Connection status"
        description="Whether the adapter can reach GitHub Actions"
        value={<Status value={statusValue} />}
      />
      <SettingsRow
        label="Authentication token"
        description="GitHub personal access token for API access"
        value={
          state.tokenConfigured ? (
            <Status value="Configured" />
          ) : (
            <span className="text-[var(--vestara-text-muted)]">
              Not configured
            </span>
          )
        }
      />
      <SettingsRow
        label="Adapter version"
        description="Installed CI adapter package version"
        value={
          <span className="font-mono text-[var(--vestara-font-size-sm)]">
            {state.adapterVersion ?? 'Unknown'}
          </span>
        }
      />
      <div className="border-t border-[var(--vestara-border-subtle)] p-4">
        <Button disabled>Test connection</Button>
        <span className="ml-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          No API endpoint available yet
        </span>
      </div>
    </SettingsSection>
  );
}

function ObservationControlSection({ state }: { state: CISettingsState }) {
  return (
    <SettingsSection
      title="CI Observation"
      description="CI observation control. The toggle is disabled until an authoritative persistence boundary (/api/ci/config) exists — Settings does not persist configuration in local state."
    >
      <SettingsRow
        label="Observation enabled"
        description="Poll GitHub Actions for CI state on pushes"
        value={
          <fieldset disabled className="m-0 min-w-0 border-0 p-0 disabled:opacity-40">
            <Toggle
              label="CI observation"
              checked={state.observationEnabled}
              onChange={() => {
                /* Inert: the disabled fieldset blocks interaction. Toggle requires onChange. */
              }}
            />
          </fieldset>
        }
      />
      <SettingsRow
        label="Control state"
        description="Why the toggle cannot be changed"
        value={
          <span className="text-[var(--vestara-text-muted)]">
            Disabled — persistence unavailable (/api/ci/config does not exist)
          </span>
        }
      />
      <SettingsRow
        label="Adapter health"
        description="Current health of the observation adapter"
        value={
          <Status
            value={
              state.adapterHealth === 'healthy'
                ? 'Healthy'
                : state.adapterHealth === 'degraded'
                  ? 'Degraded'
                  : 'Unavailable'
            }
          />
        }
      />
    </SettingsSection>
  );
}

function RepositoryMappingSection({ state }: { state: CISettingsState }) {
  return (
    <SettingsSection
      title="Repository Mapping"
      description="Which repositories are observed for CI status. An empty list means no repositories are configured."
    >
      {state.repositories.length > 0 ? (
        state.repositories.map((repo) => (
          <SettingsRow
            key={repo}
            label={repo}
            value={<Status value="Mapped" />}
          />
        ))
      ) : (
        <div className="px-4 py-8 text-center">
          <p className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
            No repositories configured. Add repository mappings to enable CI observation.
          </p>
        </div>
      )}
      <div className="border-t border-[var(--vestara-border-subtle)] p-4">
        <Button disabled>Add repository</Button>
        <span className="ml-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          Repository management not available yet
        </span>
      </div>
    </SettingsSection>
  );
}

function FilterSection({
  title,
  description,
  filters,
  emptyMessage,
}: {
  title: string;
  description: string;
  filters: readonly string[];
  emptyMessage: string;
}) {
  return (
    <SettingsSection title={title} description={description}>
      {filters.length > 0 ? (
        filters.map((f) => (
          <SettingsRow key={f} label={f} value={<Status value="Active" />} />
        ))
      ) : (
        <div className="px-4 py-6 text-center">
          <p className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
            {emptyMessage}
          </p>
        </div>
      )}
      <div className="border-t border-[var(--vestara-border-subtle)] p-4">
        <Button disabled>Edit filters</Button>
        <span className="ml-3 text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          Filter management not available yet
        </span>
      </div>
    </SettingsSection>
  );
}

function HealthSection({ state }: { state: CISettingsState }) {
  return (
    <SettingsSection
      title="Observation Health"
      description="Adapter health and recent observation state. Read-only diagnostics."
    >
      <SettingsRow
        label="Last successful observation"
        description="When the adapter last captured CI state without error"
        value={
          <span className="font-mono text-[var(--vestara-font-size-sm)]">
            {relativeTime(state.lastSuccessfulObservation)}
          </span>
        }
      />
      <SettingsRow
        label="Last retrieval error"
        description="When the adapter last encountered a transport/API error (not a CI failure)"
        value={
          state.lastRetrievalError ? (
            <span
              className="font-mono text-[var(--vestara-font-size-sm)] text-[var(--vestara-status-error)]"
              title={state.lastRetrievalErrorMessage}
            >
              {relativeTime(state.lastRetrievalError)}
            </span>
          ) : (
            <span className="text-[var(--vestara-text-muted)]">
              None
            </span>
          )
        }
      />
    </SettingsSection>
  );
}

function CanonicalStatusSection({ state }: { state: CISettingsState }) {
  return (
    <SettingsSection
      title="CI Status"
      description="Read-only view of the last observed CI state. Canonical status is provider-neutral; provider status is preserved for diagnostics."
    >
      <SettingsRow
        label="Canonical status"
        description="Provider-neutral lifecycle position (discovered / queued / running / completed)"
        value={
          state.lastCanonicalStatus ? (
            <Status value={state.lastCanonicalStatus} />
          ) : (
            <span className="text-[var(--vestara-text-muted)]">
              No observations yet
            </span>
          )
        }
      />
      <SettingsRow
        label="Provider status (diagnostics)"
        description="Raw GitHub Actions status string — not used for canonical logic"
        value={
          state.lastProviderStatus ? (
            <span className="font-mono text-[var(--vestara-font-size-sm)]">
              {state.lastProviderStatus}
            </span>
          ) : (
            <span className="text-[var(--vestara-text-muted)]">
              N/A
            </span>
          )
        }
      />
      <FactRow
        label="Authority boundary"
        value={
          <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            Settings configure. CI runtime observes. This surface is read-only.
          </span>
        }
      />
    </SettingsSection>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export function CISettings() {
  const { state, loading } = useCISettings();

  if (loading) {
    return (
      <div className="space-y-[var(--vestara-spacing-section)]">
        <div className="mpg-skeleton h-40" />
        <div className="mpg-skeleton h-32" />
        <div className="mpg-skeleton h-32" />
      </div>
    );
  }

  return (
    <div
      className="space-y-[var(--vestara-spacing-section)]"
      role="region"
      aria-label="Continuous Integration settings"
    >
      <GitHubConnectionSection state={state} />
      <ObservationControlSection state={state} />
      <RepositoryMappingSection state={state} />
      <FilterSection
        title="Workflow Filtering"
        description="Filter CI observation by workflow name. An empty list observes all workflows."
        filters={state.workflowFilters}
        emptyMessage="No workflow filters — all workflows are observed."
      />
      <FilterSection
        title="Branch Filtering"
        description="Filter CI observation by branch name. An empty list observes all branches."
        filters={state.branchFilters}
        emptyMessage="No branch filters — all branches are observed."
      />
      <HealthSection state={state} />
      <CanonicalStatusSection state={state} />
    </div>
  );
}
