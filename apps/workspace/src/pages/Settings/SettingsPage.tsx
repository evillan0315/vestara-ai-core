import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import WorkspacePanelLayout from '../../layouts/WorkspacePanelLayout';
import { navIcon } from '../../layouts/workspace-navigation.js';
import {
  type CliStatusDto,
  type EventStoreStatusDto,
  type RuntimeStatusDto,
  settingsClient,
} from './settings-client.js';
import {
  Button,
  ReferenceCard,
  SettingsRow,
  Status,
} from './settings-ui.js';
import { PolicySection } from './PolicySection.js';
import { ApiEndpointField } from './ApiEndpointField.js';
import NavigationSettings from './NavigationSettings.js';
import { TelegramPanels } from './TelegramSettings.js';
import EnvironmentVariables from './EnvironmentVariables.js';
import SystemOverview from './SystemOverview.js';
import { AssistantExecutionPanel, ToolVisibilityPanel } from './AI/AssistantExecution/AssistantExecutionSettings.js';
import { CISettings } from './CI/CISettings.js';
import {
  SettingsEmptyState,
  SettingsGeneralReference,
  SettingsReferenceFrame,
} from './SettingsReferenceSurface.js';

// ─── New canonical components ──────────────────────────────────────────

interface SettingsData {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  cli: CliStatusDto;
  history: EventStoreStatusDto;
}

function RuntimeStateCard({ runtime, className = '' }: { runtime: RuntimeStatusDto; className?: string }) {
  return (
    <ReferenceCard icon={navIcon('activity')} title="Runtime State" tone="info" className={className}>
      {Object.entries(runtime).map(([key, value]) => (
        <SettingsRow
          key={key}
          label={key}
          value={
            key.toLowerCase().includes('status') ? (
              <Status value={String(value)} />
            ) : (
              <span
                className={
                  key.toLowerCase().includes('id') || key.toLowerCase().includes('endpoint') ? 'font-mono text-xs' : ''
                }
              >
                {String(value)}
              </span>
            )
          }
        />
      ))}
    </ReferenceCard>
  );
}

function OperationsCard({ refresh, className = '' }: { refresh: () => Promise<void>; className?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const action = async (kind: 'health' | 'graph') => {
    try {
      if (kind === 'health') {
        const result = await settingsClient.healthCheck();
        setMessage(`Health check: ${result.health.status}`);
      } else {
        await settingsClient.rebuildGraph();
        setMessage('Engineering graph rebuilt from registered sources.');
      }
      await refresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Operation failed');
    }
  };
  return (
    <ReferenceCard
      icon={navIcon('tools')}
      title="Supported Operations"
      description="Disruptive operations remain disabled until a safe lifecycle endpoint exists."
      className={className}
    >
      <div className="flex flex-wrap gap-2 p-4">
        <Button primary onClick={() => action('health')}>
          Run health check
        </Button>
        <Button onClick={() => action('graph')}>Rebuild engineering graph</Button>
        <Button disabled>Restart runtime</Button>
      </div>
      {message && (
        <p className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          {message}
        </p>
      )}
    </ReferenceCard>
  );
}

function CliSection({ initial, className = '' }: { initial: CliStatusDto; className?: string }) {
  const [status, setStatus] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const verify = async () => {
    setError(null);
    try {
      setStatus(await settingsClient.verifyCli());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'CLI verification failed');
    }
  };
  const rows: Array<[string, ReactNode, string?]> = [
    ['CLI detected', <Status key="detected" value={status.detected} />],
    ['Runtime connected', <Status key="connected" value={status.runtimeConnected} />, status.connectionEvidence],
    [
      'Executable',
      <span key="executable" className="font-mono text-xs">
        {status.executablePath ?? 'Not found'}
      </span>,
    ],
    ['Version compatibility', <Status key="compatibility" value={status.compatible} />],
    [
      'Workspace ID',
      <span key="workspace" className="font-mono text-xs">
        {status.workspaceId}
      </span>,
    ],
    ['Transport', status.transport],
    [
      'Local socket',
      <span key="socket" className="font-mono text-xs">
        {status.localSocketAvailable ? status.localSocketPath : `Unavailable · fallback ${status.runtimeEndpoint}`}
      </span>,
    ],
    ['Configuration sync', <Status key="sync" value={status.configurationSynchronized} />],
  ];
  return (
    <div className={`space-y-[var(--vestara-spacing-section)] ${className}`}>
      <ReferenceCard
        icon={navIcon('terminal')}
        title="CLI Integration"
        description="Detection and runtime connectivity are reported separately."
        className="st-card-fill"
      >
        {rows.map(([label, value, description]) => (
          <SettingsRow key={label} label={label} description={description} value={value} />
        ))}
        <div className="mt-[var(--vestara-spacing-section)] flex justify-end border-t border-[var(--vestara-border-subtle)] pt-[var(--vestara-spacing-section)]">
          <Button primary onClick={verify}>
            Verify connection
          </Button>
        </div>
      </ReferenceCard>
      {status.validation && (
        <ReferenceCard icon={navIcon('workflows')} title="Verification Evidence" className="st-card-fill">
          {status.validation.map((stage) => (
            <SettingsRow key={stage.stage} label={stage.stage} value={<Status value={stage.status} />} />
          ))}
        </ReferenceCard>
      )}
      {error && (
        <div role="alert" className="text-sm text-[var(--vestara-red)]">
          {error}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ initial, className = '' }: { initial: EventStoreStatusDto; className?: string }) {
  const [status, setStatus] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const reload = async () => setStatus(await settingsClient.history());
  return (
    <>
      <ReferenceCard
        icon={navIcon('sessions')}
        title="Engineering Event Store"
        tone="info"
        className={className}
        actions={
          <div className="flex gap-2">
            <Button
              primary
              onClick={async () => {
                const result = await settingsClient.verifyStore();
                setMessage(result.valid ? `Integrity verified at ${result.checkedAt}` : 'Integrity failure');
              }}
            >
              Verify integrity
            </Button>
            <Button
              onClick={async () => {
                const result = await settingsClient.checkpoint();
                setMessage(`Checkpoint created at sequence ${result.checkpoint.seq}`);
                await reload();
              }}
            >
              Create checkpoint
            </Button>
          </div>
        }
      >
        <SettingsRow label="Persistence" value={<Status value={status.persistence} />} />
        <SettingsRow
          label="Events"
          value={<span className="font-mono tabular-nums">{status.eventCount.toLocaleString()}</span>}
        />
        <SettingsRow
          label="Latest sequence"
          value={<span className="font-mono tabular-nums">{status.latestSequence}</span>}
        />
        <SettingsRow label="Oldest retained event" value={status.oldestRetainedAt ?? 'No events'} />
        <SettingsRow label="Checkpoints" value={status.checkpointCount} />
        <SettingsRow
          label="Checkpoint policy"
          value={`every ${status.checkpointInterval} events · retain ${status.checkpointRetention}`}
        />
        <SettingsRow label="Schema version" value={status.eventSchemaVersion} />
        <SettingsRow
          label="Store identity"
          value={<span className="font-mono text-xs">{status.workspaceStoreIdentity}</span>}
        />
        {message && (
          <p className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            {message}
          </p>
        )}
      </ReferenceCard>
      {status.persistence === 'memory' && (
        <div
          role="alert"
          className="min-w-0 rounded-[var(--vestara-radius-lg)] border-[color-mix(in_srgb,var(--vestara-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-amber)_8%,transparent)] p-4 text-sm text-[var(--vestara-amber)] lg:col-span-2 xl:col-span-3"
        >
          <strong>Session-only persistence</strong>
          <p className="mt-1 text-xs">
            {status.warning} The current graph can be rebuilt, but historical intermediate states cannot be recovered.
          </p>
        </div>
      )}
    </>
  );
}
function LoadingState() {
  return (
    <div role="status" aria-label="Loading settings" className="w-full min-w-0 space-y-4">
      <div className="mpg-skeleton h-44" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="mpg-skeleton h-56" />
        ))}
      </div>
      <p className="sr-only">Loading workspace settings…</p>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [configuration, runtime, cli, history] = await Promise.all([
        settingsClient.configuration(),
        settingsClient.runtime(),
        settingsClient.cli(),
        settingsClient.history(),
      ]);
      setData({ configuration, runtime, cli, history });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings are unavailable');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const changed = (configuration: ResolvedConfiguration) =>
    setData((current) => (current ? { ...current, configuration } : current));
  // Hero summary is a projection of authoritative API/runtime state —
  // omitted entirely until loaded, never fabricated.
  return (
    <WorkspacePanelLayout fluid={false}>
      {error ? (
        <div role="alert" className="st-panel p-5">
          <h2 className="font-semibold text-[var(--vestara-red)]">Settings disconnected</h2>
           <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">{error}</p>
           <div className="mt-4 space-y-4">
             <ApiEndpointField onApplied={load} />
             <Button primary onClick={() => void load()}>
               Retry connection
             </Button>
           </div>
        </div>
      ) : !data ? (
        <LoadingState />
      ) : (
        <>
          <SettingsReferenceFrame configuration={data.configuration} runtime={data.runtime}>
            <Routes>
              <Route index element={<Navigate to="general" replace />} />
              <Route
                path="general"
                element={
                  <SettingsGeneralReference
                    configuration={data.configuration}
                    runtime={data.runtime}
                    onChanged={changed}
                  />
                }
              />
              <Route path="navigation" element={<NavigationSettings />} />
              <Route
                path="system"
                element={
                  <div className="st-gap-section grid min-w-0 items-stretch lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
                    <SystemOverview />
                    <div className="min-w-0 lg:col-span-2 xl:col-span-3">
                      <EnvironmentVariables className="st-card-fixed" />
                    </div>
                  </div>
                }
              />
              <Route
                path="runtime"
                element={
                  <div className="st-settings-grid">
                    <RuntimeStateCard runtime={data.runtime} className="st-card-fill lg:col-span-2 xl:col-span-2" />
                    <OperationsCard refresh={load} className="st-card-fill st-card-supporting lg:col-span-2 xl:col-span-1" />
                    <CliSection initial={data.cli} className="lg:col-span-2 xl:col-span-1" />
                    <HistoryCard initial={data.history} className="st-card-fill lg:col-span-2 xl:col-span-2" />
                  </div>
                }
              />
              <Route
                path="ai"
                element={
                  <div className="st-gap-section grid min-w-0 items-stretch lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
                    <PolicySection section="providers" configuration={data.configuration} onChanged={changed} className="lg:col-span-2" />
                    <PolicySection section="agents" configuration={data.configuration} onChanged={changed} className="st-card-secondary lg:col-span-2 xl:col-span-1" />
                    <AssistantExecutionPanel className="lg:col-span-2" />
                    <PolicySection section="browser" configuration={data.configuration} onChanged={changed} className="st-card-secondary lg:col-span-2 xl:col-span-1" />
                    <ToolVisibilityPanel className="lg:col-span-2 xl:col-span-3" />
                  </div>
                }
              />
              <Route
                path="security"
                element={
                  <div className="st-gap-section grid min-w-0 items-stretch lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
                    <PolicySection section="filesystem" configuration={data.configuration} onChanged={changed} className="lg:col-span-2" />
                    <PolicySection section="verification" configuration={data.configuration} onChanged={changed} className="st-card-secondary lg:col-span-2 xl:col-span-1" />
                  </div>
                }
              />
              <Route
                path="operations"
                element={
                  <div className="st-gap-section grid min-w-0 items-stretch lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_24rem]">
                    <div className="min-w-0 lg:col-span-2 xl:col-span-2">
                      <ApiEndpointField onApplied={load} className="h-full" />
                    </div>
                    <PolicySection section="telemetry" configuration={data.configuration} onChanged={changed} className="lg:col-span-2 xl:col-span-1" />
                    <div className="min-w-0 lg:col-span-2 xl:col-span-3">
                      <CISettings />
                    </div>
                  </div>
                }
              />
              <Route
                path="advanced"
                element={
                  <div className="st-settings-grid">
                    <TelegramPanels configuration={data.configuration} onChanged={changed} />
                  </div>
                }
              />
              <Route path="*" element={<Navigate to="general" replace />} />
            </Routes>
          </SettingsReferenceFrame>
        </>
      )}
    </WorkspacePanelLayout>
  );
}
