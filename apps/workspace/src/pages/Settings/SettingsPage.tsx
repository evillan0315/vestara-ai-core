import type { ResolvedConfiguration, ResolvedSetting, SettingsSectionId } from '@vestara/configuration';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { ACCENT_PALETTES, PROFILES, type ThemeSettings, useTheme } from '../../lib/theme.js';
import {
  type CliStatusDto,
  type EventStoreStatusDto,
  type RuntimeStatusDto,
  settingsClient,
} from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';

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

const surface =
  'border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]';
const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-color-focus-ring,var(--vestara-accent))] focus-visible:ring-inset';
const input = `min-h-9 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-3 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-primary,var(--vestara-text))] ${focus}`;

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m13 13 4 4" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4 transition-transform motion-reduce:transition-none group-hover:translate-x-0.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="m7 4 6 6-6 6" />
    </svg>
  );
}

function Status({ value }: { value: string | boolean }) {
  const normalized = String(value).toLowerCase();
  const positive =
    value === true || ['healthy', 'running', 'available', 'connected', 'passed', 'ok', 'ready'].includes(normalized);
  const negative = value === false || ['failed', 'error', 'unavailable', 'degraded'].includes(normalized);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--vestara-radius-full)] border px-2 py-0.5 text-[var(--vestara-font-size-xs)] font-medium ${positive ? 'border-[color-mix(in_srgb,var(--vestara-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-green)_9%,transparent)] text-[var(--vestara-green)]' : negative ? 'border-[color-mix(in_srgb,var(--vestara-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--vestara-red)_8%,transparent)] text-[var(--vestara-red)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]'}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {String(value)}
    </span>
  );
}

function Source({ setting }: { setting: ResolvedSetting }) {
  return (
    <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] px-2 py-0.5 text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
      {setting.source === 'default'
        ? 'Built-in default'
        : `${setting.source}${setting.inherited ? ' · inherited' : ' · override'}`}
    </span>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  value?: ReactNode;
  code?: string;
  onClick?: () => void;
  children?: ReactNode;
}

function SettingsRow({ label, description, value, code, onClick, children }: SettingsRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-3">
        <span className="hidden size-8 shrink-0 place-items-center rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] font-mono text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] sm:grid">
          {code}
        </span>
        <span className="min-w-0">
          <span className="block text-[var(--vestara-font-size-base)] font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            {label}
          </span>
          {description && (
            <span className="mt-0.5 block text-[var(--vestara-font-size-xs)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {description}
            </span>
          )}
        </span>
      </span>
      <span className="flex min-w-0 items-center justify-start gap-3 text-left text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] sm:justify-end sm:text-right">
        {value}
        {onClick && <Chevron />}
      </span>
      {children}
    </>
  );
  const classes = `group grid min-h-14 grid-cols-1 items-center gap-3 border-t border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-5 ${onClick ? `w-full text-left transition-colors hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))] ${focus}` : ''}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

function SettingsSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--vestara-radius-lg)] ${surface} shadow-[0_1px_0_rgb(255_255_255/0.02)_inset,0_12px_36px_rgb(0_0_0/0.18)]`}
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-4 sm:px-5">
        <div>
          <h2 className="text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary,var(--vestara-text))]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-2xl text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {description}
            </p>
          )}
        </div>
        {actions}
      </header>
      <div>{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-9 rounded-[var(--vestara-radius)] border px-3 text-[var(--vestara-font-size-sm)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${focus} ${primary ? 'border-[var(--vestara-accent-dark)] bg-[var(--vestara-accent)] text-[var(--color-zinc-950)] hover:bg-[var(--vestara-accent-light)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] text-[var(--vestara-color-text-secondary,var(--vestara-text-2))] hover:border-[var(--vestara-accent-border-hover)] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">{label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] p-1">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            onClick={() => onChange(option)}
            className={`min-h-7 rounded-[var(--vestara-radius)] border px-2.5 text-[var(--vestara-font-size-xs)] capitalize ${focus} ${value === option ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)]' : 'border-transparent text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))]'}`}
          >
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 rounded-[var(--vestara-radius-full)] border transition-colors ${focus} ${checked ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent)]' : 'border-[var(--vestara-color-border-strong,var(--color-zinc-600))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))]'}`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-[var(--color-zinc-50)] shadow transition-transform motion-reduce:transition-none ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

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

function AppearanceControls() {
  const { mode, resolved, settings, activeProfile, setMode, applyProfile, resetSettings, updateSetting } = useTheme();
  const select = <K extends keyof ThemeSettings>(key: K, options: readonly ThemeSettings[K][]) => (
    <select
      aria-label={key}
      value={String(settings[key])}
      onChange={(event) => updateSetting(key, event.target.value as ThemeSettings[K])}
      className={input}
    >
      {options.map((option) => (
        <option key={String(option)} value={String(option)}>
          {String(option)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="space-y-[var(--vestara-spacing-section)]">
      <SettingsSection
        title="Workspace Profile"
        description={activeProfile ? 'A curated display profile is active.' : 'Custom settings are active.'}
        actions={<Button onClick={resetSettings}>Reset display</Button>}
      >
        <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-4">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              aria-pressed={activeProfile === profile.id}
              onClick={() => applyProfile(profile.id)}
              className={`relative min-h-28 rounded-[var(--vestara-radius-lg)] border p-3 text-left ${focus} ${activeProfile === profile.id ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] hover:border-[var(--vestara-accent-border-hover)]'}`}
            >
              <span className="font-mono text-[10px] text-[var(--vestara-accent-text)]">
                {profile.id.toUpperCase()}
              </span>
              <strong className="mt-3 block text-sm text-[var(--vestara-color-text-primary,var(--vestara-text))]">
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
      </SettingsSection>
      <SettingsSection title="Appearance" description={`Theme resolves to ${resolved}.`}>
        <SettingsRow
          label="Theme mode"
          description="Follow the system or set an explicit appearance."
          value={<Segmented label="Theme mode" value={mode} options={['dark', 'light', 'system']} onChange={setMode} />}
        />
        <SettingsRow
          label="Accent palette"
          description="Used for focus, selection, and primary actions."
          value={
            <div className="flex max-w-sm flex-wrap justify-end gap-2">
              {Object.entries(ACCENT_PALETTES).map(([id, palette]) => (
                <button
                  key={id}
                  type="button"
                  aria-label={palette.label}
                  aria-pressed={settings.colorTheme === id}
                  title={palette.label}
                  onClick={() => updateSetting('colorTheme', id as ThemeSettings['colorTheme'])}
                  className={`grid size-7 place-items-center rounded-[var(--vestara-radius-full)] border ${focus} ${settings.colorTheme === id ? 'border-[var(--vestara-color-text-primary,var(--vestara-text))] ring-2 ring-[var(--vestara-accent)] ring-offset-2 ring-offset-[var(--vestara-color-surface-panel,var(--color-zinc-900))]' : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))]'}`}
                  style={{ backgroundColor: palette.hex }}
                >
                  {settings.colorTheme === id && (
                    <span className="text-[10px] text-black" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          }
        />
      </SettingsSection>
      <SettingsSection title="Typography" description="Runtime font variables update every Workspace surface.">
        <SettingsRow label="Font family" value={select('fontFamily', ['system', 'serif', 'mono'])} />
        <SettingsRow label="Font size" value={select('fontSize', ['small', 'medium', 'large'])} />
        <SettingsRow label="Font weight" value={select('fontWeight', ['normal', 'medium', 'semibold'])} />
      </SettingsSection>
      <SettingsSection
        title="Layout and density"
        description="Control the workspace rail, content width, spacing, and shape."
      >
        <SettingsRow label="Sidebar width" value={select('sidebarWidth', ['compact', 'normal', 'wide'])} />
        <SettingsRow
          label="Sidebar mode"
          value={
            <Segmented
              label="Sidebar mode"
              value={settings.sidebarMode}
              options={['icons', 'text']}
              onChange={(value) => updateSetting('sidebarMode', value)}
            />
          }
        />
        <SettingsRow
          label="Spacing"
          value={
            <Segmented
              label="Spacing"
              value={settings.spacing}
              options={['compact', 'comfortable', 'spacious']}
              onChange={(value) => updateSetting('spacing', value)}
            />
          }
        />
        <SettingsRow
          label="Radius"
          value={
            <Segmented
              label="Radius"
              value={settings.radius}
              options={['none', 'small', 'medium', 'large']}
              onChange={(value) => updateSetting('radius', value)}
            />
          }
        />
        <SettingsRow
          label="Full-width content"
          value={
            <Toggle
              label="Full-width content"
              checked={settings.fullWidth}
              onChange={(value) => updateSetting('fullWidth', value)}
            />
          }
        />
        <SettingsRow
          label="Fullscreen behavior"
          value={
            <Toggle
              label="Fullscreen behavior"
              checked={settings.fullScreen}
              onChange={(value) => updateSetting('fullScreen', value)}
            />
          }
        />
        <SettingsRow
          label="Workspace sidebar"
          value={
            <Toggle
              label="Workspace sidebar"
              checked={settings.sidebarEnabled}
              onChange={(value) => updateSetting('sidebarEnabled', value)}
            />
          }
        />
        <SettingsRow
          label="Navigation indicator"
          description={`${settings.leftBorderThickness}px selection edge`}
          value={
            <span className="flex items-center gap-3">
              <Toggle
                label="Navigation indicator"
                checked={settings.leftBorderEnabled}
                onChange={(value) => updateSetting('leftBorderEnabled', value)}
              />
              <input
                aria-label="Navigation indicator thickness"
                type="range"
                min="1"
                max="8"
                value={settings.leftBorderThickness}
                disabled={!settings.leftBorderEnabled}
                onChange={(event) => updateSetting('leftBorderThickness', Number(event.target.value))}
                className="w-24 accent-[var(--vestara-accent)] disabled:opacity-40"
              />
            </span>
          }
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
      <SettingsSection
        title="Workspace Identity"
        description="Only explicit changes are persisted to workspace configuration."
      >
        {settings.map((setting) => (
          <SettingsRow
            key={setting.key}
            label={setting.key.split('.').at(-1) ?? setting.key}
            description={setting.key}
            value={
              <span className="flex flex-col items-end gap-2">
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
                    className={`${input} w-full max-w-xs`}
                  />
                )}
                <Source setting={setting} />
              </span>
            }
          />
        ))}
      </SettingsSection>
      {error && (
        <div
          role="alert"
          className={`rounded-[var(--vestara-radius)] border-[color-mix(in_srgb,var(--vestara-red)_40%,transparent)] p-3 text-sm text-[var(--vestara-red)] ${surface}`}
        >
          {error}
        </div>
      )}
      <div
        className={`sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[var(--vestara-radius-lg)] p-3 shadow-xl ${surface}`}
      >
        <span className="text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          {draft.dirtyKeys.length
            ? `${draft.dirtyKeys.length} unsaved change(s)`
            : 'Workspace configuration is synchronized'}
        </span>
        <div className="flex gap-2">
          <Button disabled={saving} onClick={reset}>
            Reset section
          </Button>
          <Button primary disabled={saving || !draft.dirtyKeys.length} onClick={save}>
            {saving ? 'Saving…' : 'Save overrides'}
          </Button>
        </div>
      </div>
      <AppearanceControls />
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

function SettingsNavigation({
  visible,
  query,
  setQuery,
}: {
  visible: typeof SECTIONS;
  query: string;
  setQuery: (query: string) => void;
}) {
  const links = (
    <nav aria-label="Settings sections" className="space-y-1">
      {visible.map((section) => (
        <NavLink
          key={section.id}
          to={`/settings/${section.id}`}
          className={({ isActive }) =>
            `group grid grid-cols-[2rem_minmax(0,1fr)] gap-2 rounded-[var(--vestara-radius)] border px-2 py-2 ${focus} ${isActive ? 'border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]' : 'border-transparent hover:border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] hover:bg-[var(--vestara-color-surface-interactive-hover,var(--vestara-accent-bg))]'}`
          }
        >
          <span className="grid size-7 place-items-center font-mono text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] group-[.active]:text-[var(--vestara-accent-text)]">
            {section.code}
          </span>
          <span>
            <span className="block text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))]">
              {section.label}
            </span>
            <span className="block truncate text-[10px] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              {section.description}
            </span>
          </span>
        </NavLink>
      ))}
    </nav>
  );
  const search = (
    <div>
      <label className="relative block">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
          <SearchIcon />
        </span>
        <input
          aria-label="Search settings"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings…"
          className={`${input} w-full pl-9 pr-9`}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear settings search"
            onClick={() => setQuery('')}
            className={`absolute inset-y-0 right-2 px-2 text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] ${focus}`}
          >
            ×
          </button>
        )}
      </label>
      <p className="mt-2 text-[10px] text-[var(--vestara-color-text-dim,var(--vestara-text-dim))]">
        {query ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : `${SECTIONS.length} control domains`}
      </p>
    </div>
  );
  const content = (
    <>
      {search}
      <div className="mt-4">
        {visible.length ? (
          links
        ) : (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--vestara-color-text-secondary,var(--vestara-text-2))]">
              No settings found
            </p>
            <p className="mt-1 text-xs text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
              Try a category, configuration, or capability.
            </p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className={`mt-3 text-xs text-[var(--vestara-accent-text)] ${focus}`}
            >
              Clear search
            </button>
          </div>
        )}
      </div>
    </>
  );
  return (
    <>
      <aside
        className={`hidden w-[260px] shrink-0 border-r border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-bg-workspace,var(--color-zinc-950))] lg:block`}
      >
        <div className="sticky top-0 max-h-[calc(100vh-4rem)] overflow-y-auto p-[var(--vestara-spacing-page)]">
          {content}
        </div>
      </aside>
      <details
        className={`mx-[var(--vestara-spacing-page)] mt-[var(--vestara-spacing-page)] rounded-[var(--vestara-radius-lg)] p-3 lg:hidden ${surface}`}
      >
        <summary
          className={`cursor-pointer text-sm font-medium text-[var(--vestara-color-text-primary,var(--vestara-text))] ${focus}`}
        >
          Settings navigation
        </summary>
        <div className="mt-3">{content}</div>
      </details>
    </>
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
  const { activeProfile, resetSettings } = useTheme();
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
    <div className="min-h-[calc(100vh-4rem)] bg-[var(--vestara-color-bg-app,var(--color-zinc-950))] font-[var(--vestara-font-family)] text-[var(--vestara-color-text-primary,var(--vestara-text))]">
      <header className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-[var(--vestara-spacing-page)] py-5">
        <div className="max-w-[var(--vestara-page-max-width)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--vestara-accent-text)]">
                Workspace
              </p>
              <h1 className="mt-1 text-[clamp(1.4rem,2vw,1.75rem)] font-semibold tracking-tight">Settings</h1>
              <p className="mt-1 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted,var(--vestara-text-muted))]">
                Configure the visual, operational, and runtime behavior of Vestara.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-[var(--vestara-radius-full)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-2.5 py-1 text-xs text-[var(--vestara-accent-text)]">
                {activeProfile
                  ? `${PROFILES.find((profile) => profile.id === activeProfile)?.label ?? activeProfile} profile`
                  : 'Custom display'}
              </span>
              {!activeProfile && <Button onClick={resetSettings}>Reset display</Button>}
            </div>
          </div>
        </div>
      </header>
      <div className="lg:flex">
        <SettingsNavigation visible={visible} query={query} setQuery={setQuery} />
        <main className="min-w-0 flex-1 px-[var(--vestara-spacing-page)] py-[var(--vestara-spacing-page)]">
          <div className="max-w-[1080px]">
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
          </div>
        </main>
      </div>
    </div>
  );
}
