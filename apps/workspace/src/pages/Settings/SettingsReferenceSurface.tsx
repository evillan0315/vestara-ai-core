import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { VestaraMark } from '../../components/branding/index.js';
import { navIcon } from '../../layouts/workspace-navigation.js';
import { ACCENT_PALETTES, PROFILES, type ThemeMode, type ThemeSettings, useTheme } from '../../lib/theme.js';
import type { RuntimeStatusDto } from './settings-client.js';
import { settingsClient } from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';
import { HeroBriefingCard, useHeroSettingsState } from './HeroSettings.js';
import {
  TelegramIntegrationPanel,
  TelegramNotificationsPanel,
  TunnelSection,
  useTelegramPanelState,
} from './TelegramSettings.js';
import { TelegramSimulator } from './TelegramSimulator.js';
import { PolicySection } from './PolicySection.js';
import { SETTINGS_SECTIONS, settingsGroupLabel } from './settings-navigation.js';
import { Button, focus, input, ReferenceCard, SectionIcon, Segmented, Status, Toggle } from './settings-ui.js';
import { SelectField } from './appearance-controls.js';

const SETTINGS_TABS = ['general', 'navigation', 'system', 'runtime', 'ai', 'security', 'operations'] as const;

const GENERAL_SELECT_OPTIONS: Record<string, readonly { value: string; label: string }[]> = {
  'general.startupBehavior': [
    { value: 'restore-session', label: 'Restore previous session' },
    { value: 'overview', label: 'Open overview' },
    { value: 'dashboard', label: 'Open dashboard' },
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
  'general.dateTimeFormat': 'Date Format',
  'general.logFormat': 'Log Format',
  'general.defaultLandingPage': 'Default Landing Page',
  'general.composerMaxChars': 'Composer Max Characters',
  'notifications.enabled': 'Enable sound notifications',
};

const FIELD_HELP: Record<string, string> = {
  'general.workspaceName': 'Shown in the hero, tab titles, and overview. Cannot be empty.',
  'general.defaultBranch': 'Branch used for new work and comparisons.',
  'general.defaultLandingPage': 'Route opened at startup, e.g. /overview.',
  'general.composerMaxChars': 'Max characters per composer message (1–100000, default 100000). Applies to the Activity Room composer; enforced server-side.',
  'general.startupBehavior': 'What to restore or open on launch.',
  'general.dateTimeFormat': 'Locale follows your browser; ISO 8601 sorts cleanly.',
  'general.logFormat': 'Structured suits machine parsing; compact suits skimming.',
  'notifications.enabled': 'Audible cue when operations finish or need attention.',
};

const FONT_FAMILY_OPTIONS = [
  { value: 'system', label: 'System default' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'inter', label: 'Inter (Google)' },
  { value: 'jakarta', label: 'Plus Jakarta Sans (Google)' },
  { value: 'roboto', label: 'Roboto (Google)' },
] as const;

const ACTIONS = [
  { id: 'export', label: 'Export Settings', description: 'Download your configuration', icon: 'files' as const },
  {
    id: 'import',
    label: 'Import Settings',
    description: 'Restore from a backup file',
    icon: 'tools' as const,
    unavailableHint: 'Import from a backup file is not available yet.',
  },
  { id: 'reset', label: 'Reset to Defaults', description: 'Restore default configuration', icon: 'routing' as const },
];

const WORKSPACE_LOGO_KEY = 'general.workspaceLogo';
const WORKSPACE_LOGO_MAX_BYTES = 256 * 1024;

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

function SettingsHero({ configuration, runtime }: { configuration: ResolvedConfiguration; runtime: RuntimeStatusDto }) {
  return (
    <section className="st-panel st-pad-card border border-[color-mix(in_srgb,var(--vestara-accent)_42%,var(--vestara-border-subtle))]">
      <div className="st-gap-section flex min-w-0 flex-col lg:flex-row lg:items-center lg:justify-between">
        <div className="st-gap-field flex min-w-0 items-center lg:max-w-[34rem]">
          <SectionIcon icon={navIcon('settings')} />
          <div className="min-w-0">
            <h1 className="text-[var(--vestara-font-size-2xl)] font-semibold text-[var(--vestara-text-primary)]">
              Settings
            </h1>
            <p className="st-mt-element text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
              Configure your workspace, preferences, integrations, and system behavior.
            </p>
          </div>
        </div>
        <div className="st-gap-field grid min-w-0 sm:grid-cols-3 lg:w-[min(48rem,60%)]">
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
    <div className="st-hero-chip min-w-0">
      <div className="st-gap-field flex min-h-14 min-w-0 items-center">
        <span aria-hidden="true" className="shrink-0 text-[var(--vestara-accent-text)] [&_svg]:size-5">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="st-hero-chip-label">{label}</span>
          <span className="st-hero-chip-value truncate">{value}</span>
        </span>
      </div>
    </div>
  );
}

function SettingsTabs() {
  const tabs = SETTINGS_TABS.map((id) => SETTINGS_SECTIONS.find((entry) => entry.id === id)).filter(
    (section): section is (typeof SETTINGS_SECTIONS)[number] => section !== undefined,
  );
  return (
    <nav
      aria-label="Settings sections"
      className="st-panel st-panel-scroll-x st-settings-nav st-gap-field st-pad-element flex min-w-0 border border-[var(--vestara-border-subtle)]"
    >
      {tabs.map((section) => (
        <NavLink
          key={section.id}
          to={`/settings/${section.id}`}
          title={section.description}
          className={({ isActive }) =>
            `st-gap-field st-px-card inline-flex min-h-10 min-w-28 flex-1 shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--vestara-radius)] border text-[var(--vestara-font-size-sm)] font-medium transition-colors ${focus} ${
              isActive
                ? 'border-[color-mix(in_srgb,var(--vestara-accent)_54%,var(--vestara-border-subtle))] bg-[color-mix(in_srgb,var(--vestara-accent)_14%,transparent)] text-[var(--vestara-accent-text)]'
                : 'border-transparent text-[var(--vestara-text-secondary)] hover:border-[var(--vestara-accent-border-hover)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-accent-text)]'
            }`
          }
        >
          <span aria-hidden="true" className="[&_svg]:size-4">
            {navIcon(section.icon)}
          </span>
          <span className="truncate">{section.label}</span>
        </NavLink>
      ))}
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
    <div className="min-w-0 space-y-[var(--vestara-spacing-section)]">
      <SettingsHero configuration={configuration} runtime={runtime} />
      <SettingsTabs />
      {children}
    </div>
  );
}

export function SettingsEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center gap-[var(--vestara-spacing-section)] rounded-[var(--vestara-radius-lg)] border border-dashed border-[var(--vestara-border-subtle)] bg-[color-mix(in_srgb,var(--vestara-surface-panel-raised)_72%,transparent)] px-[var(--vestara-spacing-section)] py-[var(--vestara-spacing-section)] text-center">
      <SectionIcon icon={icon} tone="info" />
      <div className="max-w-prose">
        <h2 className="text-[var(--vestara-font-size-lg)] font-semibold text-[var(--vestara-text-primary)]">{title}</h2>
        <p className="mt-[var(--vestara-spacing-element)] text-[var(--vestara-font-size-sm)] text-[var(--vestara-text-muted)]">
          {description}
        </p>
      </div>
      {action}
    </div>
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
  const helper = FIELD_HELP[settingKey];
  const isNumeric = settingKey === 'general.composerMaxChars';
  const onNumericChange = (raw: string) => {
    if (raw.trim() === '') {
      onDraftChange(settingKey, '');
      return;
    }
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) onDraftChange(settingKey, Math.min(Math.max(parsed, 1), 100_000));
  };
  return (
    <div className="block min-w-0">
      <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
        {label}
      </span>
      {helper && (
        <span className="st-mt-element block text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
          {helper}
        </span>
      )}
      <div className="st-mt-element">
        {options ? (
          <Segmented
            label={label}
            value={String(value ?? '')}
            options={options}
            onChange={(next) => onDraftChange(settingKey, next)}
          />
        ) : isNumeric ? (
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            aria-label={label}
            value={String(value ?? '')}
            onChange={(event) => onNumericChange(event.target.value)}
            className={`${input} min-h-12 w-full`}
          />
        ) : (
          <input
            value={String(value ?? '')}
            onChange={(event) => onDraftChange(settingKey, event.target.value)}
            className={`${input} min-h-12 w-full`}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceLogoControl({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logo = typeof value === 'string' ? value : '';
  const hasLogo = logo.trim().length > 0;

  const selectLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.');
      return;
    }
    if (file.size > WORKSPACE_LOGO_MAX_BYTES) {
      setError('Choose an image under 256 KB.');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') onChange(reader.result);
      else setError('Unable to read logo image.');
    });
    reader.addEventListener('error', () => setError('Unable to read logo image.'));
    reader.readAsDataURL(file);
  };

  return (
    <div className="st-logo-editor min-w-0">
      <div>
        <p className="text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
          Workspace Logo
        </p>
        <p className="st-mt-element text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          Used as the visual identity for this workspace. Images under 256 KB are stored with the configuration
          when you save below.
        </p>
      </div>
      <div className="st-logo-preview" aria-label={hasLogo ? 'Current workspace logo preview' : 'Default workspace logo preview'}>
        {hasLogo ? (
          <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <VestaraMark size={108} />
        )}
      </div>
      <div className="st-gap-field flex flex-wrap">
        <button
          type="button"
          className={`st-px-card min-h-11 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)] transition-colors hover:border-[var(--vestara-accent-border)] hover:text-[var(--vestara-accent-text)] ${focus}`}
          onClick={() => inputRef.current?.click()}
        >
          Change Logo
        </button>
        <button
          type="button"
          className={`st-px-card min-h-11 rounded-[var(--vestara-radius)] border border-[var(--vestara-status-warning-border)] bg-[color-mix(in_srgb,var(--vestara-status-warning)_8%,transparent)] text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-status-warning)] transition-colors disabled:cursor-not-allowed disabled:border-[var(--vestara-border-subtle)] disabled:bg-[var(--vestara-surface-panel)] disabled:text-[var(--vestara-text-muted)] disabled:opacity-60 ${focus}`}
          disabled={!hasLogo}
          onClick={() => {
            setError(null);
            onChange('');
          }}
        >
          Remove
        </button>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={selectLogo} />
      {error && <p className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-status-warning)]">{error}</p>}
    </div>
  );
}

function WorkspaceIdentityCard({
  generalDraft,
  onDraftChange,
  dirtyLabel,
  message,
  saving,
  dirty,
  onDiscard,
  onSave,
}: {
  generalDraft: SettingsDraftState;
  onDraftChange: (key: string, value: unknown) => void;
  dirtyLabel: string;
  message: string | null;
  saving: boolean;
  dirty: number;
  onDiscard: () => void;
  onSave: () => void;
}) {
  const visibleKeys = [
    'general.workspaceName',
    'general.defaultBranch',
    'general.defaultLandingPage',
    'general.composerMaxChars',
    'general.startupBehavior',
    'general.dateTimeFormat',
    'general.logFormat',
  ].filter((key) => key in generalDraft.values);
  return (
    <ReferenceCard
      icon={navIcon('dashboard')}
      title="Workspace Information"
      description="Basic information and defaults exposed by the workspace configuration authority."
      className="flex h-full w-auto min-w-0 flex-col border-[color-mix(in_srgb,var(--vestara-accent)_26%,var(--vestara-border-subtle))] lg:col-span-2 [&>.st-card-body]:flex [&>.st-card-body]:flex-1 [&>.st-card-body]:flex-col"
    >
      <div className="st-gap-section grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)] lg:items-start">
        <div className="st-gap-section grid min-w-0 content-start">
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
        <WorkspaceLogoControl
          value={generalDraft.values[WORKSPACE_LOGO_KEY]}
          onChange={(value) => onDraftChange(WORKSPACE_LOGO_KEY, value)}
        />
      </div>
      <div className="mt-auto flex flex-col gap-[var(--vestara-spacing-section)] border-t border-[var(--vestara-border-subtle)] pt-[var(--vestara-spacing-section)] sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">{dirtyLabel}</p>
          {message && (
            <p role="status" className="st-mt-element text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              {message}
            </p>
          )}
        </div>
        <div className="st-gap-field flex shrink-0 flex-wrap">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving || dirty === 0}
            className={`st-px-card min-h-11 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-default)] bg-[var(--vestara-surface-panel-raised)] text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)] disabled:cursor-not-allowed disabled:border-[var(--vestara-border-subtle)] disabled:bg-[color-mix(in_srgb,var(--vestara-surface-panel)_70%,transparent)] disabled:text-[var(--vestara-text-muted)] disabled:opacity-65 ${focus}`}
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || dirty === 0}
            className={`st-px-card min-h-11 rounded-[var(--vestara-radius)] border text-[var(--vestara-font-size-sm)] font-semibold disabled:cursor-not-allowed ${focus} ${
              saving || dirty > 0
                ? 'border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent-dark)] text-[var(--vestara-surface-canvas)] hover:bg-[var(--vestara-accent)]'
                : 'border-[var(--vestara-border-subtle)] bg-[color-mix(in_srgb,var(--vestara-surface-panel)_70%,transparent)] text-[var(--vestara-text-muted)]'
            }`}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </ReferenceCard>
  );
}

function InstantField({
  label,
  helper,
  children,
}: {
  label: string;
  helper: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
        {label}
      </span>
      <span className="st-mt-element block text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
        {helper}
      </span>
      <div className="st-mt-element">{children}</div>
    </div>
  );
}

function InstantToggleRow({
  label,
  helper,
  checked,
  onChange,
}: {
  label: string;
  helper: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
          {label}
        </span>
        <span className="st-mt-element block text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
          {helper}
        </span>
      </span>
      <Toggle label={label} checked={checked} onChange={onChange} />
    </div>
  );
}

/**
 * Navigation indicator row: label + helper on the left, switch + slider +
 * live px value on one line on the right. The switch sits flush-right so it
 * aligns vertically with the Workspace sidebar toggle above it.
 */
function NavigationIndicatorRow({
  enabled,
  thickness,
  onEnabledChange,
  onThicknessChange,
}: {
  enabled: boolean;
  thickness: number;
  onEnabledChange: (value: boolean) => void;
  onThicknessChange: (value: number) => void;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
          Navigation indicator
        </span>
        <span className="st-mt-element block text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
          Selection edge on the active sidebar item.
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="min-w-10 rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 text-center font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]"
        >
          {thickness}px
        </span>
        <input
          aria-label="Navigation indicator thickness"
          type="range"
          min="1"
          max="8"
          value={thickness}
          disabled={!enabled}
          onChange={(event) => onThicknessChange(Number(event.target.value))}
          className="w-24 accent-[var(--vestara-accent)] disabled:opacity-40"
        />
        <Toggle label="Navigation indicator" checked={enabled} onChange={onEnabledChange} />
      </span>
    </div>
  );
}

/**
 * Sub-section inside the Preferences card: icon tile + title + helper,
 * replacing bare dividers with scannable grouped blocks.
 */
function PreferenceSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[var(--vestara-border-subtle)] pt-[var(--vestara-spacing-section)] first:border-t-0 first:pt-0">
      <p className="flex min-w-0 items-center gap-2 text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] [&_svg]:size-4"
        >
          {icon}
        </span>
        {title}
      </p>
      <p className="st-mt-element text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
        {description}
      </p>
      <div className="st-mt-element">{children}</div>
    </div>
  );
}

/**
 * Live typography preview. Rendered entirely from the runtime theme
 * variables, so it mirrors the active font family, size, and weight
 * with no extra state — every choice applies to it instantly.
 */
function TypographyPreview() {
  return (
    <div
      aria-hidden="true"
      className="flex min-w-0 items-center gap-3 overflow-hidden rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-3 py-2"
    >
      <span className="st-font-live st-font-weight-live-strong shrink-0 text-[var(--vestara-font-size-2xl)] leading-none text-[var(--vestara-text-primary)]">
        Aa
      </span>
      <span className="min-w-0 flex-1">
        <span className="st-font-live st-font-weight-live block truncate text-[var(--vestara-font-size-base)] text-[var(--vestara-text-secondary)]">
          The quick brown fox jumps over the lazy dog
        </span>
        <span className="st-font-live block truncate text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          0123456789 · Light to semibold, instantly applied
        </span>
      </span>
      <span className="size-2.5 shrink-0 rounded-[var(--vestara-radius-full)] bg-[var(--vestara-accent)]" />
    </div>
  );
}

function PreferencesCard({
  onGeneralChange,
  onChanged,
  hasUnsaved,
  className = '',
}: {
  onGeneralChange: (key: string, value: unknown) => void;
  onChanged: (next: ResolvedConfiguration) => void;
  hasUnsaved: boolean;
  className?: string;
}) {
  const { mode, setMode, settings, updateSetting, activeProfile, applyProfile, resetSettings } = useTheme();
  const onThemeModeChange = (next: ThemeMode) => {
    setMode(next);
    onGeneralChange('general.theme', next);
    if (!hasUnsaved) {
      void settingsClient.configuration().then(onChanged, () => {});
    }
  };
  return (
    <ReferenceCard
      icon={navIcon('settings')}
      title="Preferences"
      description="Personalize how the workspace behaves for you — profiles, appearance, and layout."
      className={`st-card-secondary ${className}`}
    >
      <div className="grid gap-[var(--vestara-spacing-section)]">
        <PreferenceSection
          icon={navIcon('routing')}
          title="Workspace Profile"
          description="Curated display presets that apply instantly. Choose a profile to set theme, density, and typography together."
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                aria-pressed={activeProfile === profile.id}
                onClick={() => applyProfile(profile.id)}
                className={`relative min-h-20 rounded-[var(--vestara-radius-lg)] border p-3 text-left ${focus} ${
                  activeProfile === profile.id
                    ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]'
                    : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] hover:border-[var(--vestara-accent-border-hover)]'
                }`}
              >
                <span className="font-mono text-[var(--vestara-font-size-xs)] text-[var(--vestara-accent-text)]">
                  {profile.id.toUpperCase()}
                </span>
                <strong className="mt-2 block text-sm text-[var(--vestara-color-text-primary,var(--vestara-text))]">
                  {profile.label}
                </strong>
                <span className="mt-1 block text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                  {profile.description}
                </span>
                {activeProfile === profile.id && (
                  <span className="absolute right-3 top-3 text-[var(--vestara-accent)]" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <Button onClick={resetSettings}>Reset display</Button>
          </div>
        </PreferenceSection>
        <div className="grid gap-[var(--vestara-spacing-section)] lg:grid-cols-2">
          <PreferenceSection
            icon={navIcon('dashboard')}
            title="Appearance"
            description="Theme mode and accent color for focus, selection, and primary actions. Applies instantly."
          >
          <div className="grid st-gap-section">
            <InstantField label="Theme Preference" helper="Follow your system, or lock dark / light. Saved durably.">
              <Segmented
                label="Theme Preference"
                value={mode}
                options={['dark', 'light', 'system']}
                onChange={onThemeModeChange}
              />
            </InstantField>
            <InstantField label="Accent palette" helper="Colors focus rings, selection, and primary actions.">
              <span className="flex flex-wrap items-center gap-2">
                {Object.entries(ACCENT_PALETTES).map(([id, palette]) => (
                  <button
                    key={id}
                    type="button"
                    aria-label={palette.label}
                    aria-pressed={settings.colorTheme === id}
                    title={palette.label}
                    onClick={() => updateSetting('colorTheme', id as ThemeSettings['colorTheme'])}
                    className={`grid size-7 place-items-center rounded-[var(--vestara-radius-full)] border ${focus} ${
                      settings.colorTheme === id
                        ? 'border-[var(--vestara-color-text-primary,var(--vestara-text))] ring-2 ring-[var(--vestara-accent)] ring-offset-2 ring-offset-[var(--vestara-color-surface-panel,var(--color-zinc-900))]'
                        : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))]'
                    }`}
                    style={{ backgroundColor: palette.hex }}
                  >
                    {settings.colorTheme === id && (
                      <span
                        className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-surface-canvas)]"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    )}
                  </button>
                ))}
                <span className="text-[var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-secondary)]">
                  {ACCENT_PALETTES[settings.colorTheme].label}
                </span>
              </span>
            </InstantField>
            <InstantField label="Font weight" helper="Default weight for body text. Live-previewed under Typography.">
              <Segmented
                label="Font weight"
                value={settings.fontWeight}
                options={['light', 'normal', 'medium', 'semibold']}
                onChange={(value) => updateSetting('fontWeight', value)}
              />
            </InstantField>
          </div>
        </PreferenceSection>
        <PreferenceSection
          icon={navIcon('files')}
          title="Typography"
          description="Fonts and text styles across every surface. Applies instantly."
        >
          <div className="grid st-gap-section">
            <TypographyPreview />
            <div className="grid st-gap-section sm:grid-cols-2">
              <InstantField label="Font family" helper="System stacks ship locally; Google fonts stream on demand.">
                <SelectField settingKey="fontFamily" options={FONT_FAMILY_OPTIONS} />
              </InstantField>
              <InstantField label="Font size" helper="Base text size across surfaces.">
                <Segmented
                  label="Font size"
                  value={settings.fontSize}
                  options={['small', 'medium', 'large']}
                  onChange={(value) => updateSetting('fontSize', value)}
                />
              </InstantField>
            </div>
          </div>
        </PreferenceSection>
        <div className="lg:col-span-2">
        <PreferenceSection
          icon={navIcon('sessions')}
          title="Layout"
          description="Rail, density, and corner controls. These apply instantly and are not part of Save / Discard."
        >
          <div className="grid st-gap-section sm:grid-cols-2 sm:gap-x-[var(--vestara-spacing-section)]">
            <InstantField label="Sidebar width" helper="Rail width from compact to wide.">
              <Segmented
                label="Sidebar width"
                value={settings.sidebarWidth}
                options={['compact', 'normal', 'wide']}
                onChange={(value) => updateSetting('sidebarWidth', value)}
              />
            </InstantField>
            <InstantField label="Sidebar mode" helper="Icons save rail space; text shows labels.">
              <Segmented
                label="Sidebar mode"
                value={settings.sidebarMode}
                options={['icons', 'text']}
                onChange={(value) => updateSetting('sidebarMode', value)}
              />
            </InstantField>
            <InstantField label="Spacing" helper="Density of pages, sections, and elements.">
              <Segmented
                label="Spacing"
                value={settings.spacing}
                options={['compact', 'comfortable', 'spacious']}
                onChange={(value) => updateSetting('spacing', value)}
              />
            </InstantField>
            <InstantField label="Radius" helper="Corner roundness across surfaces.">
              <Segmented
                label="Radius"
                value={settings.radius}
                options={['none', 'small', 'medium', 'large']}
                onChange={(value) => updateSetting('radius', value)}
              />
            </InstantField>
            <InstantToggleRow
              label="Full-width content"
              helper="Stretch content edge to edge."
              checked={settings.fullWidth}
              onChange={(value) => updateSetting('fullWidth', value)}
            />
            <InstantToggleRow
              label="Fullscreen behavior"
              helper="Saved with your display profile."
              checked={settings.fullScreen}
              onChange={(value) => updateSetting('fullScreen', value)}
            />
            <InstantToggleRow
              label="Workspace sidebar"
              helper="Show or hide the workspace rail."
              checked={settings.sidebarEnabled}
              onChange={(value) => updateSetting('sidebarEnabled', value)}
            />
            <NavigationIndicatorRow
              enabled={settings.leftBorderEnabled}
              thickness={settings.leftBorderThickness}
              onEnabledChange={(value) => updateSetting('leftBorderEnabled', value)}
              onThicknessChange={(value) => updateSetting('leftBorderThickness', value)}
            />
          </div>
        </PreferenceSection>
        </div>
        </div>
      </div>
    </ReferenceCard>
  );
}

function WorkspaceStatusCard({
  runtime,
  configuration,
  className = '',
}: {
  runtime: RuntimeStatusDto;
  configuration: ResolvedConfiguration;
  className?: string;
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
      className={`st-card-supporting ${className}`}
    >
      <div className="divide-y divide-[var(--vestara-border-subtle)]">
        {rows.map(([label, value]) => (
          <div key={label} className="st-gap-field flex min-h-10 items-center justify-between py-[var(--vestara-spacing-element)]">
            <span className="text-[var(--vestara-font-size-xs)] font-medium uppercase text-[var(--vestara-text-muted)]">{label}</span>
            <span className="min-w-0 truncate text-right text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-primary)]">
              {value}
            </span>
          </div>
        ))}
      </div>
    </ReferenceCard>
  );
}

function QuickActionsCard({
  onReset,
  onExport,
  className = '',
}: {
  onReset: () => void;
  onExport: () => void;
  className?: string;
}) {
  return (
    <ReferenceCard
      icon={navIcon('tools')}
      title="Quick Actions"
      description="Common configuration tasks."
      className={`st-card-supporting ${className}`}
    >
      <div className="st-space-field">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.id === 'reset' ? onReset : action.id === 'export' ? onExport : undefined}
            disabled={action.id !== 'reset' && action.id !== 'export'}
            title={'unavailableHint' in action ? action.unavailableHint : undefined}
            className={`st-gap-field st-px-card st-py-field flex w-full items-start rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${focus} ${
              action.id === 'reset'
                ? 'hover:border-[var(--vestara-status-warning-border)] hover:bg-[color-mix(in_srgb,var(--vestara-status-warning)_8%,transparent)] hover:text-[var(--vestara-status-warning)]'
                : 'hover:border-[var(--vestara-accent-border)]'
            }`}
          >
            <span aria-hidden="true" className="st-mt-element text-[var(--vestara-text-muted)] [&_svg]:size-5">
              {navIcon(action.icon)}
            </span>
            <span className="min-w-0">
              <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-primary)]">
                {action.label}
              </span>
              <span className="st-mt-element block text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
                {action.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    </ReferenceCard>
  );
}

function GeneralSectionLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[var(--vestara-font-size-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--vestara-text-muted)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--vestara-border-subtle)]" aria-hidden="true" />
      {hint && <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">{hint}</span>}
    </div>
  );
}

function GeneralConnectivitySection({
  configuration,
  onChanged,
  telegram,
}: {
  configuration: ResolvedConfiguration;
  onChanged: (next: ResolvedConfiguration) => void;
  telegram: ReturnType<typeof useTelegramPanelState>;
}) {
  const { settings, error } = telegram;
  if (!settings) {
    return (
      <div role="status" aria-label="Loading connectivity panels" className="grid min-w-0 gap-[var(--vestara-spacing-section)] lg:grid-cols-3">
        <div className="mpg-skeleton h-64" />
        <div className="mpg-skeleton h-64" />
        <div className="mpg-skeleton h-64" />
        <p className="sr-only">{error ?? 'Loading Telegram connectivity…'}</p>
      </div>
    );
  }
  return (
    <div className="grid min-w-0 gap-[var(--vestara-spacing-section)] lg:grid-cols-3 lg:items-stretch">
      <TunnelSection initial={settings.tunnel} className="flex h-full flex-col" />
      <TelegramIntegrationPanel
        settings={settings}
        className="flex h-full flex-col"
        footer={<PolicySection section="advanced" configuration={configuration} onChanged={onChanged} bare />}
      />
      <div className="flex min-w-0 flex-col">
        <TelegramSimulator />
      </div>
    </div>
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

  const telegram = useTelegramPanelState();
  const hero = useHeroSettingsState();

  const status = useMemo(
    () => ({ dirtyLabel: dirty ? `${dirty} unsaved change${dirty === 1 ? '' : 's'}` : 'Workspace configuration is synchronized' }),
    [dirty],
  );

  const exportSettings = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      revision: configuration.revision,
      settings: configuration.settings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vestara-settings-${configuration.revision.slice(0, 8)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMessage('Settings exported.');
  };

  return (
    <div className="min-w-0 space-y-[var(--vestara-spacing-section)]">
      <GeneralSectionLabel label="Workspace" hint={dirty ? `${dirty} unsaved` : 'Synced'} />
      <div className="grid min-w-0 gap-[var(--vestara-spacing-section)] lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch">
        <div className="flex min-w-0 flex-col">
          <WorkspaceIdentityCard
            generalDraft={generalDraft}
            onDraftChange={onGeneralChange}
            dirtyLabel={status.dirtyLabel}
            message={message}
            saving={saving}
            dirty={dirty}
            onDiscard={discard}
            onSave={() => void save()}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-[var(--vestara-spacing-section)]">
          <WorkspaceStatusCard runtime={runtime} configuration={configuration} className="shrink-0" />
          <QuickActionsCard onReset={() => void reset()} onExport={exportSettings} className="flex flex-1 flex-col [&>.st-card-body]:flex-1" />
        </div>
      </div>

      <GeneralSectionLabel label="Personalization" hint="Profiles, appearance, typography & layout" />
      <div className="min-w-0">
        <PreferencesCard onGeneralChange={onGeneralChange} onChanged={onChanged} hasUnsaved={dirty > 0} className="w-full" />
      </div>

      <GeneralConnectivitySection configuration={configuration} onChanged={onChanged} telegram={telegram} />

      <GeneralSectionLabel label="Overview & Hero" hint="Briefing + notifications" />
      <div className="grid min-w-0 gap-[var(--vestara-spacing-section)] lg:grid-cols-2 lg:items-stretch">
        <HeroBriefingCard hero={hero} className="flex h-full flex-col" />
        {telegram.settings && telegram.draft ? (
          <TelegramNotificationsPanel
            draft={telegram.draft}
            settings={telegram.settings}
            status={telegram.status}
            error={telegram.error}
            onToggleEvent={telegram.toggleEvent}
            onUpdateDraft={telegram.updateDraft}
            onSave={() => void telegram.handleSave()}
            soundEnabled={Boolean(notificationDraft.values['notifications.enabled'])}
            onSoundChange={(value) => onNotificationChange('notifications.enabled', value)}
            className="flex h-full flex-col"
          />
        ) : (
          <div role="status" aria-label="Loading notifications" className="mpg-skeleton h-64" />
        )}
      </div>
    </div>
  );
}
