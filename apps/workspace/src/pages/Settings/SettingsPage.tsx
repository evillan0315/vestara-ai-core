import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import ShellLayoutSettings from '../../layouts/ShellLayoutSettings.js';
import { ACCENT_PALETTES, PROFILES, useTheme } from '../../lib/theme.js';
import { AppearanceControls } from './appearance-controls.js';
import {
  type CliStatusDto,
  type EventStoreStatusDto,
  type RuntimeStatusDto,
  settingsClient,
} from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';
import { Button, input, SettingsRow, SettingsSection, Source, Status, surface, Toggle } from './settings-ui.js';

interface SettingsData {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  cli: CliStatusDto;
  history: EventStoreStatusDto;
}

const SECTIONS: Array<{ id: SettingsSectionId | 'overview'; label: string; description: string; code: string }> = [
  { id: 'overview', label: 'Overview', description: 'Configuration and system health', code: 'OV' },
  { id: 'general', label: 'General', description: 'Workspace identity and interface', code: 'GN' },
  { id: 'runtime', label: 'Runtime', description: 'Runtime services and operations', code: 'RT' },
  { id: 'providers', label: 'AI Providers', description: 'Providers and models', code: 'AI' },
  { id: 'agents', label: 'Agents', description: 'Agent execution policy', code: 'AG' },
  { id: 'filesystem', label: 'Filesystem & Safety', description: 'Boundaries and risk controls', code: 'FS' },
  { id: 'verification', label: 'Verification', description: 'Checks and evidence policy', code: 'VR' },
  { id: 'cli', label: 'CLI Integration', description: 'CLI compatibility and transport', code: 'CL' },
  { id: 'history', label: 'Engineering History', description: 'Temporal event store', code: 'EH' },
  { id: 'notifications', label: 'Notifications', description: 'Operational notifications', code: 'NT' },
  { id: 'telemetry', label: 'Telemetry', description: 'Observability detail', code: 'TM' },
  { id: 'advanced', label: 'Advanced', description: 'Experimental behavior', code: 'AD' },
];

function Overview({ data }: { data: SettingsData }) {
  const navigate = useNavigate();
  const { mode, settings, activeProfile } = useTheme();
  const rows: Array<[string, string, ReactNode, SettingsSectionId, string]> = [
    [
      'Runtime',
      'Runtime services and operations',
      <Status key="runtime" value={data.runtime.status} />,
      'runtime',
      'RT',
    ],
    [
      'CLI',
      'Local command-line connection',
      <Status key="cli" value={data.cli.runtimeConnected && data.cli.detected ? 'Connected' : 'Unavailable'} />,
      'cli',
      'CL',
    ],
    [
      'AI Providers',
      'Default inference provider',
      String(data.configuration.settings.find((s) => s.key === 'providers.defaultProvider')?.value ?? 'Not configured'),
      'providers',
      'AI',
    ],
    [
      'Filesystem Policy',
      'Workspace write posture',
      data.configuration.settings.find((s) => s.key === 'filesystem.dryRun')?.value
        ? 'Dry-run protected'
        : 'Active writes',
      'filesystem',
      'FS',
    ],
    [
      'Verification',
      'Evidence and checking profile',
      String(data.configuration.settings.find((s) => s.key === 'verification.profile')?.value ?? 'standard'),
      'verification',
      'VR',
    ],
    [
      'Engineering History',
      'Temporal engineering event store',
      <span key="history" className="font-mono tabular-nums">
        {data.history.eventCount.toLocaleString()} events
      </span>,
      'history',
      'EH',
    ],
    [
      'Telemetry',
      'Operational observability detail',
      String(
        data.configuration.settings.find((s) => s.key === 'telemetry.level')?.value ?? data.runtime.telemetryStatus,
      ),
      'telemetry',
      'TM',
    ],
    [
      'Configuration',
      'Explicit workspace-level values',
      <span key="configuration" className="tabular-nums">
        {data.configuration.overrideCount} workspace overrides
      </span>,
      'general',
      'GN',
    ],
  ];
  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <SettingsSection
        title="Workspace Configuration"
        description="Resolved state from the active Workspace API and runtime."
      >
        {rows.map(([label, description, value, section, code]) => (
          <SettingsRow
            key={label}
            label={label}
            description={description}
            code={code}
            value={value}
            onClick={() => navigate(`/settings/${section}`)}
          />
        ))}
      </SettingsSection>
      <SettingsSection
        title="Active Theme Profile"
        description="Display preferences are applied immediately and persisted locally."
        actions={<Button onClick={() => navigate('/settings/general')}>Open appearance</Button>}
      >
        <SettingsRow
          label={
            activeProfile
              ? (PROFILES.find((profile) => profile.id === activeProfile)?.label ?? activeProfile)
              : 'Custom'
          }
          description="Workspace profile"
          value={
            <span className="flex flex-wrap justify-end gap-2">
              <Status value={mode} />
              <span>{ACCENT_PALETTES[settings.colorTheme].label}</span>
            </span>
          }
        />
        <SettingsRow
          label="Display system"
          description={`${settings.fontFamily} typography · ${settings.spacing} spacing`}
          value={`${settings.radius} radius · ${settings.sidebarWidth} rail`}
        />
      </SettingsSection>
    </div>
  );
}

function General({
  configuration,
  onChanged,
}: {
  configuration: ResolvedConfiguration;
  onChanged: (next: ResolvedConfiguration) => void;
}) {
  const [draft, setDraft] = useState<SettingsDraftState>(() => createDraft(configuration, 'general'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(createDraft(configuration, 'general')), [configuration]);
  const settings = configuration.settings.filter((entry) => entry.section === 'general');
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await settingsClient.save(configuration, 'general', draftOverrides(draft));
      onChanged(result.configuration);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await settingsClient.reset(configuration, 'general');
      onChanged(result.configuration);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <AppearanceControls />
      <SettingsSection
        title="Workspace Defaults"
        description="Repository-specific values. Only explicit changes are persisted to workspace configuration."
      >
        {settings.map((setting) => (
          <SettingsRow
            key={setting.key}
            label={setting.key.split('.').at(-1) ?? setting.key}
            description={setting.key}
            value={
              <span className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                {typeof setting.value === 'boolean' ? (
                  <Toggle
                    label={setting.key}
                    checked={Boolean(draft.values[setting.key])}
                    onChange={(value) => setDraft((state) => updateDraft(state, setting.key, value))}
                  />
                ) : (
                  <input
                    aria-label={setting.key}
                    value={String(draft.values[setting.key] ?? '')}
                    onChange={(event) => setDraft((state) => updateDraft(state, setting.key, event.target.value))}
                    className={`${input} w-full sm:w-72`}
                  />
                )}
                <Source setting={setting} />
              </span>
            }
          />
        ))}
        <footer className="flex flex-col gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-xs text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
              {draft.dirtyKeys.length
                ? `${draft.dirtyKeys.length} unsaved change${draft.dirtyKeys.length === 1 ? '' : 's'}`
                : 'Workspace configuration is synchronized'}
            </p>
            {error && (
              <p role="alert" className="mt-1 text-xs text-[var(--vestara-red)]">
                {error}
              </p>
            )}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button disabled={saving} onClick={reset}>
              Reset values
            </Button>
            <Button primary disabled={saving || !draft.dirtyKeys.length} onClick={save}>
              {saving ? 'Saving…' : 'Save overrides'}
            </Button>
          </div>
        </footer>
      </SettingsSection>
    </div>
  );
}

function Runtime({ runtime, refresh }: { runtime: RuntimeStatusDto; refresh: () => Promise<void> }) {
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
    <div className="space-y-[var(--vestara-spacing-section)]">
      <SettingsSection title="Runtime State">
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
                    key.toLowerCase().includes('id') || key.toLowerCase().includes('endpoint')
                      ? 'font-mono text-xs'
                      : ''
                  }
                >
                  {String(value)}
                </span>
              )
            }
          />
        ))}
      </SettingsSection>
      <SettingsSection
        title="Supported Operations"
        description="Disruptive operations remain disabled until a safe lifecycle endpoint exists."
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
      </SettingsSection>
    </div>
  );
}

function CliIntegration({ initial }: { initial: CliStatusDto }) {
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
    <div className="space-y-[var(--vestara-spacing-section)]">
      <SettingsSection
        title="CLI Integration"
        description="Detection and runtime connectivity are reported separately."
        actions={
          <Button primary onClick={verify}>
            Verify connection
          </Button>
        }
      >
        {rows.map(([label, value, description]) => (
          <SettingsRow key={label} label={label} description={description} value={value} />
        ))}
      </SettingsSection>
      {status.validation && (
        <SettingsSection title="Verification Evidence">
          {status.validation.map((stage) => (
            <SettingsRow key={stage.stage} label={stage.stage} value={<Status value={stage.status} />} />
          ))}
        </SettingsSection>
      )}
      {error && (
        <div role="alert" className="text-sm text-[var(--vestara-red)]">
          {error}
        </div>
      )}
    </div>
  );
}

function History({ initial }: { initial: EventStoreStatusDto }) {
  const [status, setStatus] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const reload = async () => setStatus(await settingsClient.history());
  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      {status.persistence === 'memory' && (
        <div
          role="alert"
          className={`rounded-[var(--vestara-radius-lg)] border-[color-mix(in_srgb,var(--vestara-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-amber)_8%,transparent)] p-4 text-sm text-[var(--vestara-amber)]`}
        >
          <strong>Session-only persistence</strong>
          <p className="mt-1 text-xs">
            {status.warning} The current graph can be rebuilt, but historical intermediate states cannot be recovered.
          </p>
        </div>
      )}
      <SettingsSection
        title="Engineering Event Store"
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
      </SettingsSection>
    </div>
  );
}

function PolicySection({
  section,
  configuration,
}: {
  section: SettingsSectionId;
  configuration: ResolvedConfiguration;
}) {
  const settings = configuration.settings.filter((entry) => entry.section === section);
  const meta = SECTIONS.find((entry) => entry.id === section);
  return (
    <SettingsSection
      title={meta?.label ?? section}
      description="Resolved runtime policy. Editing requires an atomic apply operation from the owning runtime."
    >
      {settings.length ? (
        settings.map((setting) => (
          <SettingsRow
            key={setting.key}
            label={setting.key}
            value={
              <span className="flex flex-wrap items-center justify-end gap-2">
                <span className={typeof setting.value === 'number' ? 'font-mono tabular-nums' : ''}>
                  {Array.isArray(setting.value) ? setting.value.join(', ') : String(setting.value)}
                </span>
                <Source setting={setting} />
              </span>
            }
          />
        ))
      ) : (
        <div className="p-8 text-center">
          <p className="text-sm text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
            No registered settings are exposed by the owning runtime.
          </p>
        </div>
      )}
      <div className="border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] p-4">
        <Button disabled>Runtime apply not available</Button>
      </div>
    </SettingsSection>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-label="Loading settings" className="animate-pulse p-[var(--vestara-spacing-page)]">
      <div className="h-3 w-20 rounded bg-[var(--color-zinc-800)]" />
      <div className="mt-4 h-7 w-40 rounded bg-[var(--color-zinc-800)]" />
      <div className={`mt-8 overflow-hidden rounded-[var(--vestara-radius-lg)] ${surface}`}>
        {[1, 2, 3, 4, 5].map((item) => (
          <div
            key={item}
            className="h-16 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] first:border-0"
          />
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
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
  const visible = useMemo(
    () =>
      SECTIONS.filter((section) => {
        const settingKeys =
          data?.configuration.settings
            .filter((setting) => setting.section === section.id)
            .map((setting) => setting.key)
            .join(' ') ?? '';
        return `${section.label} ${section.description} ${settingKeys}`.toLowerCase().includes(query.toLowerCase());
      }),
    [data, query],
  );
  const changed = (configuration: ResolvedConfiguration) =>
    setData((current) => (current ? { ...current, configuration } : current));
  return (
    <ShellLayoutSettings
      navigation={visible}
      totalNavigationItems={SECTIONS.length}
      query={query}
      onQueryChange={setQuery}
    >
      {error ? (
        <div role="alert" className={`rounded-[var(--vestara-radius-lg)] p-5 ${surface}`}>
          <h2 className="font-semibold text-[var(--vestara-red)]">Settings disconnected</h2>
          <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">{error}</p>
          <div className="mt-4">
            <Button primary onClick={() => void load()}>
              Retry connection
            </Button>
          </div>
        </div>
      ) : !data ? (
        <LoadingState />
      ) : (
        <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview data={data} />} />
          <Route path="general" element={<General configuration={data.configuration} onChanged={changed} />} />
          <Route path="runtime" element={<Runtime runtime={data.runtime} refresh={load} />} />
          <Route path="cli" element={<CliIntegration initial={data.cli} />} />
          <Route path="history" element={<History initial={data.history} />} />
          {(
            [
              'providers',
              'agents',
              'filesystem',
              'verification',
              'notifications',
              'telemetry',
              'advanced',
            ] as SettingsSectionId[]
          ).map((section) => (
            <Route
              key={section}
              path={section}
              element={<PolicySection section={section} configuration={data.configuration} />}
            />
          ))}
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
      )}
    </ShellLayoutSettings>
  );
}
