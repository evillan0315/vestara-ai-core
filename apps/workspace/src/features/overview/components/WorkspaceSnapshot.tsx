/**
 * WorkspaceSnapshot — configuration and system status panels.
 *
 * Moved from Settings → Overview: the same authoritative runtime snapshot
 * (configuration, runtime, CLI, event history) rendered as a section of the
 * main Overview page. "View details" links deep-link into Settings.
 * All values project live API/runtime state; unknown stays unknown.
 */

import type { ResolvedConfiguration } from '@vestara/configuration';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ConfigurationActionButton,
  type ConfigurationItem,
  ConfigurationView,
  type ConfigurationViewMode,
} from '../../../components/configuration/ConfigurationView.js';
import { navIcon } from '../../../layouts/workspace-navigation.js';
import { ACCENT_PALETTES, PROFILES, useTheme } from '../../../lib/theme.js';
import {
  type CliStatusDto,
  type EventStoreStatusDto,
  type RuntimeStatusDto,
  settingsClient,
} from '../../../pages/Settings/settings-client.js';
import { Button, humanize, Status } from '../../../pages/Settings/settings-ui.js';

interface SnapshotData {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  cli: CliStatusDto;
  history: EventStoreStatusDto;
}

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

function SnapshotPanels({ data, onRefresh }: { data: SnapshotData; onRefresh: () => void }) {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ConfigurationViewMode>('cards');
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
    <ConfigurationActionButton label={`Open ${label} settings`} onClick={() => navigate(`/settings/${section}`)} />
  );

  const items: readonly ConfigurationItem[] = [
    {
      id: 'runtime',
      icon: navIcon('activity'),
      title: 'Runtime & CLI',
      badge: <Status value={humanize(data.runtime.status)} />,
      description: 'Runtime services, CLI connection and execution environment.',
      action: openLink('runtime', 'Runtime'),
      tone: 'info',
      facts: [
        { label: 'Runtime', value: <Status value={humanize(data.runtime.status)} /> },
        { label: 'CLI', value: <Status value={cliConnected ? 'Connected' : 'Unavailable'} /> },
        { label: 'Version', value: <span className="font-mono">{data.runtime.runtimeVersion}</span> },
        { label: 'Event bus', value: <Status value={humanize(data.runtime.eventBusStatus)} /> },
      ],
    },
    {
      id: 'ai',
      icon: navIcon('assistant'),
      title: 'AI & Agents',
      badge: (
        <Status
          value={
            data.configuration.settings.some((s) => s.key === 'providers.defaultProvider') ? 'Configured' : 'Unknown'
          }
        />
      ),
      description: 'Provider configuration and agent execution policy.',
      action: openLink('ai', 'AI & Agents'),
      facts: [
        { label: 'Provider', value: humanize(settingValue('providers.defaultProvider')) },
        { label: 'Model', value: settingValue('providers.defaultModel', 'Unknown') },
        { label: 'Agents', value: typeof maxConcurrent === 'number' ? `${maxConcurrent} max concurrent` : 'Unknown' },
        { label: 'Assignment', value: autoAssign ? 'Auto-assign' : 'Manual' },
      ],
    },
    {
      id: 'security',
      icon: navIcon('files'),
      title: 'Security & Safety',
      badge: <Status value={dryRun ? 'Protected' : 'Active'} />,
      description: 'Filesystem policy, safety boundaries and risk controls.',
      action: openLink('security', 'Security'),
      facts: [
        { label: 'Filesystem', value: <Status value={dryRun ? 'Protected' : 'Active'} /> },
        { label: 'Verification', value: humanize(settingValue('verification.profile', 'standard')) },
        {
          label: 'Write scope',
          value: Array.isArray(writablePaths) ? (
            <span className="max-w-48 truncate font-mono text-xs" title={writablePaths.join(', ')}>
              {writablePaths.join(', ')}
            </span>
          ) : (
            'Unknown'
          ),
        },
        {
          label: 'Protected files',
          value: Array.isArray(protectedFiles) ? `${protectedFiles.length} files` : 'Unknown',
        },
      ],
    },
    {
      id: 'operations',
      icon: navIcon('diagnostics'),
      title: 'Operations',
      badge: <Status value={humanize(data.runtime.telemetryStatus)} />,
      description: 'Telemetry, notifications and operational configuration.',
      action: openLink('operations', 'Operations'),
      tone: 'info',
      facts: [
        { label: 'Telemetry', value: humanize(settingValue('telemetry.level', data.runtime.telemetryStatus)) },
        { label: 'Notifications', value: <Status value={notificationsOn ? 'Enabled' : 'Muted'} /> },
        {
          label: 'Workspace ID',
          value: (
            <span className="max-w-36 truncate font-mono text-xs" title={data.runtime.workspaceId}>
              {data.runtime.workspaceId}
            </span>
          ),
        },
        {
          label: 'Events',
          value: <span className="font-mono tabular-nums">{data.history.eventCount.toLocaleString()}</span>,
        },
      ],
    },
    {
      id: 'appearance',
      icon: navIcon('settings'),
      title: 'Appearance',
      badge: <span className="mpg-tag-pill">{resolved === 'dark' ? 'Dark mode' : 'Light mode'}</span>,
      description: 'Theme, layout and display preferences.',
      action: openLink('general', 'Appearance'),
      facts: [
        { label: 'Theme', value: resolved === 'dark' ? 'Vestara Dark' : 'Vestara Light' },
        { label: 'Density', value: humanize(settings.spacing) },
        { label: 'Accent color', value: ACCENT_PALETTES[settings.colorTheme].label },
        {
          label: 'Profile',
          value: activeProfile ? (PROFILES.find((p) => p.id === activeProfile)?.label ?? activeProfile) : 'Custom',
        },
      ],
    },
    {
      id: 'configuration',
      icon: navIcon('tools'),
      title: 'Configuration',
      badge: (
        <Status
          value={data.configuration.overrideCount > 0 ? `${data.configuration.overrideCount} overrides` : 'Defaults'}
        />
      ),
      description: 'Workspace-level configuration and overrides.',
      action: openLink('general', 'Configuration'),
      facts: [
        {
          label: 'Active overrides',
          value: <span className="font-mono tabular-nums">{data.configuration.overrideCount}</span>,
        },
        { label: 'Revision', value: <span className="font-mono text-xs">{revisionShort}</span> },
        { label: 'Last updated', value: updated ?? 'Unknown' },
        { label: 'Workspace', value: settingValue('general.workspaceName', 'Vestara Workspace') },
      ],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            Configuration &amp; system status
          </h2>
          <p className="mt-0.5 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
            A quick view of your current configuration and system status. Values are read from the workspace runtime
            snapshot.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {updated && (
            <span className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              <span
                title={
                  data.configuration.generatedAt ? new Date(data.configuration.generatedAt).toLocaleString() : undefined
                }
              >
                Configuration snapshot updated {updated}
              </span>
            </span>
          )}
          <span title="Reload configuration and runtime state">
            <Button onClick={onRefresh}>↺ Refresh</Button>
          </span>
        </div>
      </div>

      <ConfigurationView items={items} mode={viewMode} onModeChange={setViewMode} />

      <div className="st-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[color-mix(in_srgb,var(--vestara-accent-text)_30%,transparent)] bg-[color-mix(in_srgb,var(--vestara-accent-text)_12%,transparent)] text-[var(--vestara-accent-text)] [&_svg]:size-[18px]"
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

export function WorkspaceSnapshot() {
  const [data, setData] = useState<SnapshotData | null>(null);
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
      setError(cause instanceof Error ? cause.message : 'Workspace snapshot is unavailable');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div role="alert" className="st-panel p-5">
        <h2 className="font-semibold text-[var(--vestara-red)]">Workspace snapshot disconnected</h2>
        <p className="mt-2 text-sm text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">{error}</p>
        <div className="mt-4">
          <Button primary onClick={() => void load()}>
            Retry connection
          </Button>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div role="status" aria-label="Loading workspace snapshot" className="w-full min-w-0 space-y-4">
        <div className="mpg-skeleton h-44" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div key={item} className="mpg-skeleton h-56" />
          ))}
        </div>
        <p className="sr-only">Loading workspace snapshot…</p>
      </div>
    );
  }
  return <SnapshotPanels data={data} onRefresh={() => void load()} />;
}
