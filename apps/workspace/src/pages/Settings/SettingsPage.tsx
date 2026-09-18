import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import WorkspacePanelLayout from '../../layouts/WorkspacePanelLayout';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { ACCENT_PALETTES, PROFILES, useTheme } from '../../lib/theme.js';
import { AppearancePanel, LayoutPanel, ProfilesPanel, TypographyPanel } from './appearance-controls.js';
import {
  type CliStatusDto,
  type EventStoreStatusDto,
  type RuntimeStatusDto,
  settingsClient,
} from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';
import { SETTINGS_SECTIONS, settingsGroupLabel } from './settings-navigation.js';
import {
  Button,
  FactRow,
  SettingsDomainCard,
  humanize,
  input,
  SettingsRow,
  SettingsSection,
  Source,
  Status,
  Toggle,
} from './settings-ui.js';
import { ApiEndpointField } from './ApiEndpointField.js';
import NavigationSettings from './NavigationSettings.js';
import { TelegramSettings } from './TelegramSettings.js';
import HeroSettings from './HeroSettings.js';
import EnvironmentVariables from './EnvironmentVariables.js';
import SystemOverview from './SystemOverview.js';
import AssistantExecutionSettings from './AI/AssistantExecution/AssistantExecutionSettings.js';
import { CISettings } from './CI/CISettings.js';

// ─── New canonical components ──────────────────────────────────────────
import { SettingsHero } from './SettingsHero';
import { SettingsNavigation } from './SettingsNavigation';
import { WorkspaceInformationCard } from './WorkspaceInformationCard';
import { RegionalSettingsCard } from './RegionalSettingsCard';
import { PreferencesCard } from './PreferencesCard';
import { WorkspaceStatusCard } from './WorkspaceStatusCard';
import { SettingsQuickActions } from './SettingsQuickActions';

interface SettingsData {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  cli: CliStatusDto;
  history: EventStoreStatusDto;
}

const SECTIONS = SETTINGS_SECTIONS;

function relativeTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * VES-DESIGN-007A: hero summary chips with the reference hierarchy — the
 * domain is the label, the current state/value is the answer. Statuses
 * (Ready, Connected) keep the semantic lamp; configuration values
 * (OpenCode, Standard) stay plain text. All values project authoritative
 * API/runtime state.
 */
function HeroSummaryChips({ data }: { data: SettingsData }) {
  const settingValue = (key: string, fallback = 'Not configured') =>
    String(data.configuration.settings.find((s) => s.key === key)?.value ?? fallback);
  const cliConnected = data.cli.runtimeConnected && data.cli.detected;
  const dryRun = data.configuration.settings.find((s) => s.key === 'filesystem.dryRun')?.value;
  const chips: Array<{ label: string; status?: string; value?: string }> = [
    { label: 'Runtime', status: humanize(data.runtime.status) },
    { label: 'CLI', status: cliConnected ? 'Connected' : 'Unavailable' },
    { label: 'AI Provider', value: humanize(settingValue('providers.defaultProvider')) },
    { label: 'Filesystem', status: dryRun ? 'Protected' : 'Active' },
    { label: 'Verification', value: humanize(settingValue('verification.profile', 'standard')) },
  ];
  return (
    <>
      {chips.map((chip) => (
        <span key={chip.label} className="st-hero-chip">
          <span className="st-hero-chip-label">{chip.label}</span>
          <span className="st-hero-chip-value">
            {chip.status !== undefined ? <Status bare value={chip.status} /> : chip.value}
          </span>
        </span>
      ))}
    </>
  );
}

function Overview({ data, onRefresh }: { data: SettingsData; onRefresh: () => void }) {
  const navigate = useNavigate();
  const { resolved, settings, activeProfile } = useTheme();
  const settingValue = (key: string, fallback = 'Not configured') =>
    String(data.configuration.settings.find((s) => s.key === key)?.value ?? fallback);
  const cliConnected = data.cli.runtimeConnected && data.cli.detected;
  const dryRun = data.configuration.settings.find((s) => s.key === 'filesystem.dryRun')?.value;
  const notificationsOn = data.configuration.settings.find((s) => s.key === 'notifications.enabled')?.value;
  const maxConcurrent = data.configuration.settings.find((s) => s.key === 'agents.maxConcurrent')?.value;
  const autoAssign = data.configuration.settings.find((s) => s.key === 'agents.autoAssign')?.value;
  const protectedFiles = data.configuration.settings.find((s) => s.key === 'filesystem.protectedFiles')?.value;
  const writablePaths = data.configuration.settings.find((s) => s.key === 'filesystem.writablePaths')?.value;
  const updated = relativeTime(data.configuration.generatedAt);
  const revisionShort = data.configuration.revision.slice(0, 8);

  const openLink = (section: string, label: string) => (
    <button
      type="button"
      onClick={() => navigate(`/settings/${section}`)}
      className="mpg-link"
      aria-label={`Open ${label} settings`}
    >
      View details<span aria-hidden="true"> ›</span>
    </button>
  );

  // Rich card grammar (reference §10): overview → summarized. Every fact
  // projects authoritative configuration/runtime/theme state; unknown stays
  // unknown (rows without authority are omitted, not invented).
  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Workspace Overview
          </h2>
          <p className="mt-0.5 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            A quick view of your current configuration and system status. Values are read from the workspace runtime snapshot.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {updated && (
            <span className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              <span title={data.configuration.generatedAt ? new Date(data.configuration.generatedAt).toLocaleString() : undefined}>
                Configuration snapshot updated {updated}
              </span>
            </span>
          )}
          <span title="Reload configuration and runtime state">
            <Button onClick={onRefresh}>↺ Refresh</Button>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SettingsDomainCard
          index={0}
          icon={navIcon('activity')}
          iconTone="var(--vestara-status-info)"
          title="Runtime & CLI"
          badge={<Status value={humanize(data.runtime.status)} />}
          description="Runtime services, CLI connection and execution environment."
          action={openLink('runtime', 'Runtime')}
        >
          <FactRow label="Runtime" value={humanize(data.runtime.status)} isStatus />
          <FactRow label="CLI" value={cliConnected ? 'Connected' : 'Unavailable'} isStatus />
          <FactRow label="Version" value={<span className="font-mono">{data.runtime.runtimeVersion}</span>} />
          <FactRow label="Event bus" value={humanize(data.runtime.eventBusStatus)} isStatus />
        </SettingsDomainCard>

        <SettingsDomainCard
          index={1}
          icon={navIcon('assistant')}
          iconTone="var(--vestara-status-success)"
          title="AI & Agents"
          badge={
            <Status
              value={data.configuration.settings.some((s) => s.key === 'providers.defaultProvider') ? 'Configured' : 'Unknown'}
            />
          }
          description="Provider configuration and agent execution policy."
          action={openLink('providers', 'AI Providers')}
        >
          <FactRow label="Provider" value={humanize(settingValue('providers.defaultProvider'))} />
          <FactRow label="Model" value={settingValue('providers.defaultModel', 'Unknown')} />
          <FactRow
            label="Agents"
            value={typeof maxConcurrent === 'number' ? `${maxConcurrent} max concurrent` : 'Unknown'}
          />
          <FactRow label="Assignment" value={autoAssign ? 'Auto-assign' : 'Manual'} />
        </SettingsDomainCard>

        <SettingsDomainCard
          index={2}
          icon={navIcon('files')}
          iconTone="var(--vestara-status-warning)"
          title="Security & Safety"
          badge={<Status value={dryRun ? 'Protected' : 'Active'} />}
          description="Filesystem policy, safety boundaries and risk controls."
          action={openLink('filesystem', 'Filesystem & Safety')}
        >
          <FactRow label="Filesystem" value={dryRun ? 'Dry-run protected' : 'Active writes'} isStatus={Boolean(dryRun)} />
          <FactRow label="Verification" value={humanize(settingValue('verification.profile', 'standard'))} />
          <FactRow
            label="Write scope"
            value={
              Array.isArray(writablePaths) ? (
                <span className="font-mono text-xs" title={writablePaths.join(', ')}>
                  {writablePaths.join(', ')}
                </span>
              ) : (
                'Unknown'
              )
            }
          />
          <FactRow
            label="Protected files"
            value={Array.isArray(protectedFiles) ? `${protectedFiles.length} files` : 'Unknown'}
          />
        </SettingsDomainCard>

        <SettingsDomainCard
          index={3}
          icon={navIcon('diagnostics')}
          iconTone="var(--vestara-status-info)"
          title="Operations"
          badge={<Status value={humanize(data.runtime.telemetryStatus)} />}
          description="Telemetry, notifications and operational configuration."
          action={openLink('telemetry', 'Telemetry')}
        >
          <FactRow label="Telemetry" value={humanize(settingValue('telemetry.level', data.runtime.telemetryStatus))} />
          <FactRow label="Notifications" value={notificationsOn ? 'Enabled' : 'Muted'} isStatus={Boolean(notificationsOn)} />
          <FactRow
            label="Workspace ID"
            value={
              <span className="max-w-36 truncate font-mono text-xs" title={data.runtime.workspaceId}>
                {data.runtime.workspaceId}
              </span>
            }
          />
          <FactRow
            label="Events"
            value={<span className="font-mono tabular-nums">{data.history.eventCount.toLocaleString()}</span>}
          />
        </SettingsDomainCard>

        <SettingsDomainCard
          index={4}
          icon={navIcon('settings')}
          iconTone="var(--vestara-accent-text)"
          title="Appearance"
          badge={
            <span className="mpg-tag-pill">{resolved === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          }
          description="Theme, layout and display preferences."
          action={openLink('profiles', 'Appearance')}
        >
          <FactRow label="Theme" value={resolved === 'dark' ? 'Vestara Dark' : 'Vestara Light'} />
          <FactRow label="Density" value={humanize(settings.spacing)} />
          <FactRow label="Accent color" value={ACCENT_PALETTES[settings.colorTheme].label} />
          <FactRow
            label="Profile"
            value={activeProfile ? (PROFILES.find((p) => p.id === activeProfile)?.label ?? activeProfile) : 'Custom'}
          />
        </SettingsDomainCard>

        <SettingsDomainCard
          index={5}
          icon={navIcon('tools')}
          iconTone="var(--vestara-text-secondary)"
          title="Configuration"
          badge={
            <Status
              value={data.configuration.overrideCount > 0 ? `${data.configuration.overrideCount} overrides` : 'Defaults'}
            />
          }
          description="Workspace-level configuration and overrides."
          action={openLink('general', 'Configuration')}
        >
          <FactRow
            label="Active overrides"
            value={<span className="font-mono tabular-nums">{data.configuration.overrideCount}</span>}
          />
          <FactRow label="Revision" value={<span className="font-mono text-xs">{revisionShort}</span>} />
          <FactRow label="Last updated" value={updated ?? 'Unknown'} />
          <FactRow label="Workspace" value={settingValue('general.workspaceName', 'Vestara Workspace')} />
        </SettingsDomainCard>
      </div>

      <div className="st-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-[var(--vestara-radius)] border text-[var(--vestara-accent-text)] [&_svg]:size-[18px]"
          style={{
            color: 'var(--vestara-accent-text)',
            background: 'color-mix(in srgb, var(--vestara-accent-text) 12%, transparent)',
            borderColor: 'color-mix(in srgb, var(--vestara-accent-text) 30%, transparent)',
          }}
        >
          {navIcon('generic')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Need help?
          </span>
          <span className="block text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            Explore documentation, open the Global Assistant, or visit the Marketplace for extensions.
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap gap-2">
          <Link to="/docs" className="mpg-pill" aria-label="Open documentation">
            Open Documentation
          </Link>
          <button
            type="button"
            className="mpg-pill"
            onClick={() => window.dispatchEvent(new CustomEvent('open-assistant'))}
          >
            Ask Global Assistant
          </button>
          <Link to="/marketplace" className="mpg-pill" aria-label="Browse Marketplace">
            Browse Marketplace
          </Link>
        </span>
      </div>
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

/**
 * SETTINGS-UI-001: General route with backward-compatible ?tab= redirects.
 * Legacy appearance tabs (/settings/general?tab=profiles|appearance|
 * typography|layout) navigate to their canonical routes. Plain
 * /settings/general (or unknown tab values) renders General unchanged.
 */
const APPEARANCE_TAB_ROUTES: Record<string, string> = {
  profiles: 'profiles',
  appearance: 'appearance',
  typography: 'typography',
  layout: 'layout',
};

function GeneralRoute({
  configuration,
  onChanged,
}: {
  configuration: ResolvedConfiguration;
  onChanged: (next: ResolvedConfiguration) => void;
}) {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  if (tab && APPEARANCE_TAB_ROUTES[tab]) {
    return <Navigate to={`/settings/${APPEARANCE_TAB_ROUTES[tab]}`} replace />;
  }
  return <General configuration={configuration} onChanged={onChanged} />;
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

/**
 * Lightweight selected-domain heading (no second hero): gives the active
 * domain visual ownership of the content column — Navigation → selected →
 * domain title — while domain panels stay lighter section surfaces below.
 */
function DetailDomainHeader() {
  const location = useLocation();
  const segment = location.pathname.replace(/^\/settings\/?/, '').split('/')[0] ?? '';
  const meta = SECTIONS.find((section) => section.id === segment);
  if (!meta || meta.id === 'overview') return null;
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          {settingsGroupLabel(meta.group)} · Settings
        </p>
        <h2 className="mt-0.5 text-lg font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
          {meta.label}
        </h2>
        <p className="mt-0.5 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          {meta.description}
        </p>
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
        return `${section.label} ${section.description} ${settingsGroupLabel(section.group)} ${settingKeys}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [data, query],
  );
  const changed = (configuration: ResolvedConfiguration) =>
    setData((current) => (current ? { ...current, configuration } : current));
  // Hero summary is a projection of authoritative API/runtime state —
  // omitted entirely until loaded, never fabricated.
  return (
    <WorkspacePanelLayout
      hero={data ? (
        <HeroSummaryChips data={data} />
      ) : undefined}
      fluid={false}
>
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
          <DetailDomainHeader />

          {/* ── Top-level layout: Navigation + Content ───────────────────── */}
          <div className="flex min-w-0 w-full flex-col lg:flex-row gap-6 lg:gap-8">
            {/* Settings Navigation — data-driven from the canonical registry. */}
            <SettingsNavigation />

            {/* Settings Main + Aside layout. */}
<main className="flex-1">
                {/* Main configuration column (primary) */}
                <div className="lg:col-span-2 space-y-6">
                  <WorkspaceInformationCard configuration={data!.configuration} onFieldChange={onFieldChange} />
                  <RegionalSettingsCard configuration={data!.configuration} onFieldChange={onFieldChange} />
                  <PreferencesCard configuration={data!.configuration} onFieldChange={onFieldChange} />
                </div>

                {/* Context/aside column (secondary) */}
                <aside className="space-y-6">
                  <WorkspaceStatusCard runtime={data!.runtime} configuration={data!.configuration} />
                  <SettingsQuickActions
                    onExport={() => {/* TODO: export implementation */}}
                    onImport={() => {/* TODO: import implementation */}}
                    onReset={() => {/* TODO: reset */}}
                    onClearAll={() => {/* TODO: clear all */}}
                    canClearAll={false}
                  />
                </aside>
              </main>
          </div>

          {/* ── Existing React Router routes for deep linking ────────────── */}
          <Routes>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview data={data} onRefresh={() => void load()} />} />
          <Route path="hero" element={<HeroSettings />} />
          <Route path="general" element={<GeneralRoute configuration={data.configuration} onChanged={changed} />} />
          <Route path="profiles" element={<ProfilesPanel />} />
          <Route path="appearance" element={<AppearancePanel />} />
          <Route path="typography" element={<TypographyPanel />} />
          <Route path="layout" element={<LayoutPanel />} />
          <Route path="system" element={<SystemOverview runtime={data.runtime} />} />
          <Route path="environment" element={<EnvironmentVariables />} />
          <Route path="runtime" element={<Runtime runtime={data.runtime} refresh={load} />} />
          <Route path="cli" element={<CliIntegration initial={data.cli} />} />
          <Route path="connection" element={<ApiEndpointField onApplied={load} />} />
          <Route path="history" element={<History initial={data.history} />} />
          {(
            [
              'providers',
              'agents',
              'browser',
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
          <Route path="telegram" element={<TelegramSettings />} />
          <Route path="navigation" element={<NavigationSettings />} />
          <Route path="assistant-execution" element={<AssistantExecutionSettings />} />
          <Route path="ci" element={<CISettings />} />
          <Route path="*" element={<Navigate to="overview" replace />} />
        </Routes>
        </>
      )}
    </WorkspacePanelLayout>
  );
}
