/**
 * PolicySection — editable configuration section.
 *
 * Generic draft editor for any @vestara/configuration section: per-type
 * controls (toggle / segmented / number / text / comma lists), draft
 * tracking, and save/reset through settings-client. `bare` renders fields
 * plus footer without card chrome so a section can live inside another
 * panel (e.g. Advanced editing inside Telegram Integration).
 */

import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';
import { useEffect, useState } from 'react';
import { navIcon, type WorkspaceNavIcon } from '../../layouts/workspace-navigation.js';
import { settingsClient } from './settings-client.js';
import { createDraft, draftOverrides, type SettingsDraftState, updateDraft } from './settings-state.js';
import { SETTINGS_SECTIONS } from './settings-navigation.js';
import { SettingsEmptyState } from './SettingsReferenceSurface.js';
import {
  Button,
  ReferenceCard,
  Segmented,
  Toggle,
  humanize,
  input,
} from './settings-ui.js';

const SECTIONS = SETTINGS_SECTIONS;

const POLICY_META: Partial<
  Record<SettingsSectionId, { title: string; description: string; icon: WorkspaceNavIcon }>
> = {
  providers: { title: 'AI Providers', description: 'Providers and models.', icon: 'assistant' },
  agents: { title: 'Agents', description: 'Agent execution policy.', icon: 'agents' },
  browser: { title: 'Browser', description: 'Browser automation policy and driver.', icon: 'terminal' },
  filesystem: { title: 'Filesystem & Safety', description: 'Boundaries and risk controls.', icon: 'files' },
  verification: { title: 'Verification', description: 'Checks and evidence policy.', icon: 'workflows' },
  telemetry: { title: 'Telemetry', description: 'Observability detail.', icon: 'diagnostics' },
  advanced: { title: 'Advanced', description: 'Experimental behavior.', icon: 'generic' },
};

const POLICY_SELECT_OPTIONS: Record<string, readonly { value: string; label: string }[]> = {
  'verification.profile': [
    { value: 'fast', label: 'Fast' },
    { value: 'standard', label: 'Standard' },
    { value: 'strict', label: 'Strict' },
  ],
  'telemetry.level': [
    { value: 'minimal', label: 'Minimal' },
    { value: 'standard', label: 'Standard' },
    { value: 'detailed', label: 'Detailed' },
  ],
  'browser.driver': [
    { value: 'playwright', label: 'Playwright' },
    { value: 'agent-browser', label: 'Agent browser' },
  ],
  'browser.screenshotRedaction': [
    { value: 'off', label: 'Off' },
    { value: 'secrets', label: 'Secrets' },
    { value: 'full', label: 'Full' },
  ],
};

const POLICY_LABELS: Record<string, string> = {
  'providers.defaultProvider': 'Default Provider',
  'providers.defaultModel': 'Default Model',
  'agents.autoAssign': 'Auto-assign Agents',
  'agents.maxConcurrent': 'Max Concurrent Agents',
  'filesystem.readablePaths': 'Readable Paths',
  'filesystem.writablePaths': 'Writable Paths',
  'filesystem.protectedFiles': 'Protected Files',
  'filesystem.dryRun': 'Dry-run Mode',
  'verification.required': 'Require Verification',
  'verification.profile': 'Verification Profile',
  'verification.build': 'Verify Build',
  'verification.typecheck': 'Verify Typecheck',
  'verification.tests': 'Run Tests',
  'verification.visual': 'Visual Checks',
  'telemetry.level': 'Telemetry Level',
  'browser.driver': 'Browser Driver',
  'browser.allowedOrigins': 'Allowed Origins',
  'browser.maxSessions': 'Max Sessions',
  'browser.idleTimeoutMs': 'Idle Timeout (ms)',
  'browser.screenshotRedaction': 'Screenshot Redaction',
  'advanced.experimentalFeatures': 'Experimental Features',
};

const POLICY_HELP: Record<string, string> = {
  'providers.defaultProvider': 'Provider used when none is specified.',
  'providers.defaultModel': 'Use auto to let the provider choose.',
  'agents.autoAssign': 'Automatically assign new work to idle agents.',
  'agents.maxConcurrent': 'How many agents may run at the same time.',
  'filesystem.readablePaths': 'Comma-separated paths the workspace may read.',
  'filesystem.writablePaths': 'Comma-separated paths the workspace may write.',
  'filesystem.protectedFiles': 'Comma-separated files that are never written.',
  'filesystem.dryRun': 'Preview changes without writing anything.',
  'verification.required': 'Block completion until checks pass.',
  'verification.profile': 'Trade-off between check depth and speed.',
  'verification.build': 'Rebuild before accepting a result.',
  'verification.typecheck': 'Typecheck before accepting a result.',
  'verification.tests': 'Run the test suite before accepting a result.',
  'verification.visual': 'Capture visual evidence during verification.',
  'telemetry.level': 'How much operational detail is recorded.',
  'browser.driver': 'Automation backend for browser tools.',
  'browser.allowedOrigins': 'Comma-separated origins, or * for any.',
  'browser.maxSessions': 'Concurrent browser sessions allowed.',
  'browser.idleTimeoutMs': 'Close idle sessions after this many milliseconds.',
  'browser.screenshotRedaction': 'What to mask in captured screenshots.',
  'advanced.experimentalFeatures': 'Unlock features still under evaluation.',
};

function PolicyField({
  settingKey,
  label,
  value,
  onChange,
}: {
  settingKey: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const options = POLICY_SELECT_OPTIONS[settingKey];
  if (options) {
    return <Segmented label={label} value={String(value ?? '')} options={options} onChange={onChange} />;
  }
  if (typeof value === 'boolean') {
    return (
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          {value ? 'Enabled' : 'Disabled'}
        </span>
        <Toggle label={label} checked={value} onChange={onChange} />
      </div>
    );
  }
  if (typeof value === 'number') {
    return (
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
        className={`${input} min-h-12 w-full`}
      />
    );
  }
  if (Array.isArray(value)) {
    return (
      <input
        aria-label={label}
        value={value.join(', ')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean),
          )
        }
        className={`${input} min-h-12 w-full font-mono`}
      />
    );
  }
  return (
    <input
      aria-label={label}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
      className={`${input} min-h-12 w-full`}
    />
  );
}

export function PolicySection({
  section,
  configuration,
  onChanged,
  className = '',
  bare = false,
}: {
  section: SettingsSectionId;
  configuration: ResolvedConfiguration;
  onChanged: (next: ResolvedConfiguration) => void;
  className?: string;
  bare?: boolean;
}) {
  const [draft, setDraft] = useState<SettingsDraftState>(() => createDraft(configuration, section));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setDraft(createDraft(configuration, section)), [configuration]);
  const settings = configuration.settings.filter((entry) => entry.section === section);
  const meta = SECTIONS.find((entry) => entry.id === section);
  const policy = POLICY_META[section];
  const title = policy?.title ?? meta?.label ?? section;
  const description =
    policy?.description ?? meta?.description ?? 'Resolved runtime policy from the owning configuration authority.';
  const icon = navIcon(policy?.icon ?? meta?.icon ?? 'generic');
  const dirty = draft.dirtyKeys.length;
  if (!settings.length) {
    return (
      <SettingsEmptyState
        icon={icon}
        title={`${title} settings are not surfaced yet`}
        description="No configurable settings are currently available for this section. Settings will appear here when they are supported by the workspace."
      />
    );
  }
  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await settingsClient.save(configuration, section, draftOverrides(draft));
      onChanged(result.configuration);
      setMessage('Settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const result = await settingsClient.reset(configuration, section);
      onChanged(result.configuration);
      setMessage('Section reset to defaults.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };
  const body = (
    <div className="st-gap-section grid">
      {settings.map((setting) => {
        const label = POLICY_LABELS[setting.key] ?? humanize(setting.key.split('.').at(-1) ?? setting.key);
        const helper = POLICY_HELP[setting.key];
        return (
          <div key={setting.key} className="min-w-0">
            <span className="block text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
              {label}
            </span>
            {helper && (
              <span className="st-mt-element block text-[var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-muted)]">
                {helper}
              </span>
            )}
            <div className="st-mt-element">
              <PolicyField
                settingKey={setting.key}
                label={label}
                value={draft.values[setting.key]}
                onChange={(next) => setDraft((state) => updateDraft(state, setting.key, next))}
              />
            </div>
          </div>
        );
      })}
      <div className="flex flex-col gap-3 border-t border-[var(--vestara-border-subtle)] pt-[var(--vestara-spacing-section)]">
        <div className="st-gap-field flex flex-wrap">
          <Button disabled={saving} onClick={() => void reset()}>
            Reset section
          </Button>
          <Button primary disabled={saving || !dirty} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
        <div className="min-w-0">
          <p className="text-[var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-secondary)]">
            {dirty ? `${dirty} unsaved change${dirty === 1 ? '' : 's'}` : 'Section is synchronized'}
          </p>
          {error && (
            <p role="alert" className="st-mt-element text-[var(--vestara-font-size-xs)] text-[var(--vestara-red)]">
              {error}
            </p>
          )}
          {!error && message && (
            <p role="status" className="st-mt-element text-[var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
  if (bare) return <div className={`min-w-0 ${className}`}>{body}</div>;
  return (
    <ReferenceCard icon={icon} title={title} description={description} tone="info" className={className}>
      {body}
    </ReferenceCard>
  );
}
