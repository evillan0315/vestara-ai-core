import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { navIcon } from '../../layouts/workspace-navigation.js';
import type { RuntimeStatusDto } from './settings-client.js';
import { settingsClient } from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';
import { SETTINGS_SECTIONS, settingsGroupLabel } from './settings-navigation.js';
import { focus, input, Status, Toggle } from './settings-ui.js';

const GENERAL_TABS = ['general', 'appearance', 'providers', 'overview', 'filesystem', 'notifications', 'advanced'] as const;

const GENERAL_SELECT_OPTIONS: Record<string, readonly { value: string; label: string }[]> = {
  'general.startupBehavior': [
    { value: 'restore', label: 'Restore previous workspace' },
    { value: 'new', label: 'Start clean' },
  ],
  'general.theme': [
    { value: 'system', label: 'System' },
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ],
  'general.density': [
    { value: 'compact', label: 'Compact' },
    { value: 'comfortable', label: 'Comfortable' },
  ],
  'general.dateTimeFormat': [
    { value: 'locale', label: 'Locale' },
    { value: 'iso', label: 'ISO 8601' },
  ],
  'general.logFormat': [
    { value: 'structured', label: 'Structured' },
    { value: 'compact', label: 'Compact' },
  ],
};

const FIELD_LABELS: Record<string, string> = {
  'general.workspaceName': 'Workspace Name',
  'general.defaultBranch': 'Default Branch',
  'general.startupBehavior': 'Startup Behavior',
  'general.theme': 'Theme Preference',
  'general.density': 'Workspace Density',
  'general.dateTimeFormat': 'Date Format',
  'general.logFormat': 'Log Format',
  'general.defaultLandingPage': 'Default Landing Page',
  'notifications.enabled': 'Enable sound notifications',
};

const ACTIONS = [
  { id: 'export', label: 'Export Settings', description: 'Download your configuration', icon: 'files' as const },
  { id: 'import', label: 'Import Settings', description: 'Restore from a backup file', icon: 'tools' as const },
  { id: 'reset', label: 'Reset to Defaults', description: 'Restore default configuration', icon: 'routing' as const },
];

function settingValue(configuration: ResolvedConfiguration, key: string, fallback = 'Unknown'): string {
  const value = configuration.settings.find((setting) => setting.key === key)?.value;
  return value === undefined || value === null ? fallback : String(value);
}

function relativeTime(iso: string | undefined): string {
  if (!iso) return 'Unknown';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return 'Unknown';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function SectionIcon({ icon, tone = 'accent' }: { icon: ReactNode; tone?: 'accent' | 'info' }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-11 shrink-0 place-items-center rounded-[var(--vestara-radius)] border [&_svg]:size-5 ${
        tone === 'info'
          ? 'border-[color-mix(in_srgb,var(--vestara-status-info)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-status-info)_12%,transparent)] text-[var(--vestara-status-info)]'
          : 'border-[color-mix(in_srgb,var(--vestara-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--vestara-accent)_12%,transparent)] text-[var(--vestara-accent-text)]'
      }`}
    >
      {icon}
    </span>
  );
}

function SettingsHero({ configuration, runtime }: { configuration: ResolvedConfiguration; runtime: RuntimeStatusDto }) {
  return (
    <section className="st-panel border border-[color-mix(in_srgb,var(--vestara-accent)_42%,var(--vestara-border-subtle))] p-[var(--vestara-spacing-5)]">
      <div className="flex min-w-0 flex-col gap-[var(--vestara-spacing-4)] lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-[var(--vestara-spacing-4)]">
          <SectionIcon icon={navIcon('settings')} />
          <div className="min-w-0">
            <h1 className="text-[var(--vestara-font-size-2xl)] font-semibold text-[var(--vestara-text-primary)]">
              Settings
            </h1>
            <p className="mt-[var(--vestara-spacing-1)] text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
              Configure your workspace, preferences, integrations, and system behavior.
            </p>
          </div>
        </div>
        <div className="grid min-w-0 gap-[var(--vestara-spacing-3)] sm:grid-cols-3 lg:w-[min(48rem,55%)]">
          <HeroFact icon={navIcon('files')} label="Workspace" value={settingValue(configuration, 'general.workspaceName')} />
          <HeroFact icon={navIcon('terminal')} label="Runtime" value={runtime.runtimeVersion} />
          <HeroFact icon={navIcon('sessions')} label="Updated" value={relativeTime(configuration.generatedAt)} />
        </div>
      </div>
    </section>
  );
}

function HeroFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[color-mix(in_srgb,var(--vestara-surface-panel)_76%,transparent)] px-[var(--vestara-spacing-4)] py-[var(--vestara-spacing-3)]">
      <div className="flex min-w-0 items-center gap-[var(--vestara-spacing-3)]">
        <span aria-hidden="true" className="shrink-0 text-[var(--vestara-accent-text)] [&_svg]:size-5">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{label}</span>
          <span className="mt-[var(--vestara-spacing-1)] block truncate text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-primary)]">
            {value}
          </span>
        </span>
      </div>
    </div>
  );
}

function SettingsTabs() {
  return (
    <nav
      aria-label="Settings sections"
      className="st-panel st-panel-scroll-x flex min-w-0 border border-[var(--vestara-border-subtle)]"
    >
      {GENERAL_TABS.map((id) => {
        const section = SETTINGS_SECTIONS.find((entry) => entry.id === id);
        if (!section) return null;
        return (
          <NavLink
            key={id}
            to={`/settings/${id}`}
            className={({ isActive }) =>
              `flex min-h-12 min-w-32 flex-1 shrink-0 items-center justify-center gap-[var(--vestara-spacing-2)] whitespace-nowrap border-r border-[var(--vestara-border-subtle)] px-[var(--vestara-spacing-4)] text-[var(--vestara-font-size-sm)] transition-colors last:border-r-0 ${focus} ${
                isActive
                  ? 'border-b-2 border-b-[var(--vestara-accent)] bg-[color-mix(in_srgb,var(--vestara-accent)_16%,transparent)] text-[var(--vestara-accent-text)]'
                  : 'text-[var(--vestara-text-secondary)] hover:bg-[var(--vestara-surface-interactive-hover)] hover:text-[var(--vestara-text-primary)]'
              }`
            }
          >
            <span aria-hidden="true" className="[&_svg]:size-4">
              {navIcon(section.icon)}
            </span>
            <span className="truncate">{section.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function SettingsReferenceFrame({
  configuration,
  runtime,
  children,
}: {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-[var(--vestara-spacing-4)]">
      <SettingsHero configuration={configuration} runtime={runtime} />
      <SettingsTabs />
      {children}
    </div>
  );
}

function ReferenceCard({
  icon,
  title,
  description,
  children,
  className = '',
  tone = 'accent',
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  tone?: 'accent' | 'info';
}) {
  return (
    <section className={`st-panel min-w-0 p-[var(--vestara-spacing-5)] ${className}`}>
      <header className="mb-[var(--vestara-spacing-5)] flex min-w-0 items-start gap-[var(--vestara-spacing-3)]">
        <SectionIcon icon={icon} tone={tone} />
        <div className="min-w-0">
          <h2 className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">{title}</h2>
          {description && (
            <p className="mt-[var(--vestara-spacing-1)] text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
              {description}
            </p>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

function DraftField({
  draft,
  settingKey,
  label,
  onDraftChange,
}: {
  draft: SettingsDraftState;
  settingKey: string;
  label: string;
  onDraftChange: (key: string, value: unknown) => void;
}) {
  const value = draft.values[settingKey];
  const options = GENERAL_SELECT_OPTIONS[settingKey];
  return (
    <label className="block">
      <span className="mb-[var(--vestara-spacing-2)] block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
        {label}
      </span>
      {options ? (
        <select
          value={String(value ?? '')}
          onChange={(event) => onDraftChange(settingKey, event.target.value)}
          className={`${input} w-full`}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          value={String(value ?? '')}
          onChange={(event) => onDraftChange(settingKey, event.target.value)}
          className={`${input} w-full`}
        />
      )}
    </label>
  );
}

function WorkspaceIdentityCard({
  generalDraft,
  onDraftChange,
}: {
  generalDraft: SettingsDraftState;
  onDraftChange: (key: string, value: unknown) => void;
}) {
  const visibleKeys = ['general.workspaceName', 'general.defaultBranch', 'general.defaultLandingPage'].filter(
    (key) => key in generalDraft.values,
  );
  return (
    <ReferenceCard
      icon={navIcon('dashboard')}
      title="Workspace Information"
      description="Basic information and defaults exposed by the workspace configuration authority."
      className="lg:col-span-2"
    >
      <div className="grid gap-[var(--vestara-spacing-4)]">
        {visibleKeys.map((key) => (
          <DraftField
            key={key}
            draft={generalDraft}
            settingKey={key}
            label={FIELD_LABELS[key] ?? key}
            onDraftChange={onDraftChange}
          />
        ))}
      </div>
    </ReferenceCard>
  );
}

function RegionalCard({
  generalDraft,
  onDraftChange,
}: {
  generalDraft: SettingsDraftState;
  onDraftChange: (key: string, value: unknown) => void;
}) {
  const visibleKeys = ['general.dateTimeFormat', 'general.logFormat'].filter((key) => key in generalDraft.values);
  return (
    <ReferenceCard
      icon={navIcon('routing')}
      title="Regional Settings"
      description="Format preferences available in the current runtime."
    >
      <div className="grid gap-[var(--vestara-spacing-4)]">
        {visibleKeys.map((key) => (
          <DraftField
            key={key}
            draft={generalDraft}
            settingKey={key}
            label={FIELD_LABELS[key] ?? key}
            onDraftChange={onDraftChange}
          />
        ))}
      </div>
    </ReferenceCard>
  );
}

function PreferencesCard({
  generalDraft,
  notificationDraft,
  onGeneralChange,
  onNotificationChange,
}: {
  generalDraft: SettingsDraftState;
  notificationDraft: SettingsDraftState;
  onGeneralChange: (key: string, value: unknown) => void;
  onNotificationChange: (key: string, value: unknown) => void;
}) {
  const generalToggles = ['general.theme', 'general.density'].filter((key) => key in generalDraft.values);
  const hasNotifications = 'notifications.enabled' in notificationDraft.values;
  return (
    <ReferenceCard
      icon={navIcon('settings')}
      title="Preferences"
      description="Personalize how the workspace behaves for you."
    >
      <div className="space-y-[var(--vestara-spacing-3)]">
        {generalToggles.map((key) => (
          <DraftField
            key={key}
            draft={generalDraft}
            settingKey={key}
            label={FIELD_LABELS[key] ?? key}
            onDraftChange={onGeneralChange}
          />
        ))}
        {hasNotifications && (
          <div className="flex items-center justify-between gap-[var(--vestara-spacing-3)]">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
              {FIELD_LABELS['notifications.enabled']}
            </span>
            <Toggle
              label={FIELD_LABELS['notifications.enabled']}
              checked={Boolean(notificationDraft.values['notifications.enabled'])}
              onChange={(value) => onNotificationChange('notifications.enabled', value)}
            />
          </div>
        )}
      </div>
    </ReferenceCard>
  );
}

function WorkspaceStatusCard({
  runtime,
  configuration,
}: {
  runtime: RuntimeStatusDto;
  configuration: ResolvedConfiguration;
}) {
  const rows = [
    ['Status', <Status key="status" bare value={runtime.status} />],
    ['API', runtime.apiEndpoint ? 'Connected API' : 'Unknown'],
    ['Version', <span key="version" className="font-mono">{runtime.runtimeVersion}</span>],
    ['Active executions', runtime.activeExecutionCount],
    ['Event store', runtime.engineeringEventStoreStatus],
    ['Revision', <span key="revision" className="font-mono">{configuration.revision.slice(0, 8)}</span>],
  ] as const;
  return (
    <ReferenceCard
      icon={navIcon('activity')}
      title="Workspace Status"
      description="Current workspace health and status."
      tone="info"
    >
      <div className="space-y-[var(--vestara-spacing-3)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-[var(--vestara-spacing-4)]">
            <span className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">{label}</span>
            <span className="min-w-0 truncate text-right text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)]">
              {value}
            </span>
          </div>
        ))}
      </div>
    </ReferenceCard>
  );
}

function QuickActionsCard({ onReset }: { onReset: () => void }) {
  return (
    <ReferenceCard icon={navIcon('tools')} title="Quick Actions" description="Common configuration tasks.">
      <div className="space-y-[var(--vestara-spacing-2)]">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.id === 'reset' ? onReset : undefined}
            disabled={action.id !== 'reset'}
            className={`flex w-full items-center gap-[var(--vestara-spacing-3)] rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel-raised)] px-[var(--vestara-spacing-4)] py-[var(--vestara-spacing-3)] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focus} ${
              action.id === 'reset'
                ? 'hover:border-[var(--vestara-status-warning-border)] hover:text-[var(--vestara-status-warning)]'
                : ''
            }`}
          >
            <span aria-hidden="true" className="text-[var(--vestara-text-muted)] [&_svg]:size-5">
              {navIcon(action.icon)}
            </span>
            <span className="min-w-0">
              <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-primary)]">
                {action.label}
              </span>
              <span className="block text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                {action.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </ReferenceCard>
  );
}

export function SettingsGeneralReference({
  configuration,
  runtime,
  onChanged,
}: {
  configuration: ResolvedConfiguration;
  runtime: RuntimeStatusDto;
  onChanged: (next: ResolvedConfiguration) => void;
}) {
  const [generalDraft, setGeneralDraft] = useState(() => createDraft(configuration, 'general'));
  const [notificationDraft, setNotificationDraft] = useState(() => createDraft(configuration, 'notifications'));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dirty = generalDraft.dirtyKeys.length + notificationDraft.dirtyKeys.length;

  useEffect(() => {
    setGeneralDraft(createDraft(configuration, 'general'));
    setNotificationDraft(createDraft(configuration, 'notifications'));
  }, [configuration]);

  const onGeneralChange = (key: string, value: unknown) => setGeneralDraft((state) => updateDraft(state, key, value));
  const onNotificationChange = (key: string, value: unknown) =>
    setNotificationDraft((state) => updateDraft(state, key, value));

  const discard = () => {
    setGeneralDraft(createDraft(configuration, 'general'));
    setNotificationDraft(createDraft(configuration, 'notifications'));
    setMessage(null);
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      let next = configuration;
      if (generalDraft.dirtyKeys.length) {
        const result = await settingsClient.save(next, 'general', draftOverrides(generalDraft));
        next = result.configuration;
      }
      if (notificationDraft.dirtyKeys.length) {
        const result = await settingsClient.save(next, 'notifications', draftOverrides(notificationDraft));
        next = result.configuration;
      }
      onChanged(next);
      setMessage('Settings saved.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = async (section: SettingsSectionId = 'general') => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await settingsClient.reset(configuration, section);
      onChanged(result.configuration);
      setMessage(`${settingsGroupLabel(section === 'notifications' ? 'operations' : 'workspace')} settings reset.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const status = useMemo(
    () => ({ dirtyLabel: dirty ? `${dirty} unsaved change${dirty === 1 ? '' : 's'}` : 'Workspace configuration is synchronized' }),
    [dirty],
  );

  return (
    <div className="grid min-w-0 gap-[var(--vestara-spacing-section)] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="grid min-w-0 gap-[var(--vestara-spacing-section)] lg:grid-cols-2">
        <WorkspaceIdentityCard generalDraft={generalDraft} onDraftChange={onGeneralChange} />
        <RegionalCard generalDraft={generalDraft} onDraftChange={onGeneralChange} />
        <PreferencesCard
          generalDraft={generalDraft}
          notificationDraft={notificationDraft}
          onGeneralChange={onGeneralChange}
          onNotificationChange={onNotificationChange}
        />
      </div>
      <aside className="min-w-0 space-y-[var(--vestara-spacing-section)]">
        <WorkspaceStatusCard runtime={runtime} configuration={configuration} />
        <QuickActionsCard onReset={() => void reset()} />
      </aside>
      <footer className="st-panel flex flex-col gap-[var(--vestara-spacing-3)] px-[var(--vestara-spacing-5)] py-[var(--vestara-spacing-4)] lg:col-span-2 xl:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">{status.dirtyLabel}</p>
          {message && (
            <p role="status" className="mt-[var(--vestara-spacing-1)] text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              {message}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-[var(--vestara-spacing-2)]">
          <button
            type="button"
            onClick={discard}
            disabled={saving || dirty === 0}
            className={`min-h-10 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] px-[var(--vestara-spacing-4)] text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)] disabled:cursor-not-allowed disabled:opacity-60 ${focus}`}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || dirty === 0}
            className={`min-h-10 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent)] px-[var(--vestara-spacing-4)] text-[var(--vestara-font-size-sm)] font-semibold text-[var(--vestara-surface-base)] disabled:cursor-not-allowed disabled:opacity-60 ${focus}`}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </footer>
    </div>
  );
}
