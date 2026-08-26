import { useState } from 'react';
import { ACCENT_PALETTES, PROFILES, type ThemeSettings, useTheme } from '../../lib/theme.js';
import { ThemeBuilderProvider } from '../../lib/theme-builder-context.js';
import { ThemeBuilder } from './components/ThemeBuilder/index.js';
import { Button, focus, input, Segmented, SettingsRow, SettingsSection, Toggle } from './settings-ui.js';

type AppearanceTab = 'profiles' | 'appearance' | 'typography' | 'layout' | 'theme-builder';

const APPEARANCE_TABS: Array<{ id: AppearanceTab; label: string; description: string }> = [
  { id: 'profiles', label: 'Profiles', description: 'Curated workspace profiles' },
  { id: 'appearance', label: 'Appearance', description: 'Theme mode and accent palette' },
  { id: 'typography', label: 'Typography', description: 'Font family, size, and weight' },
  { id: 'layout', label: 'Layout', description: 'Sidebar, spacing, radius, and density' },
  { id: 'theme-builder', label: 'Theme Builder', description: 'Create and customize themes' },
];

export function AppearanceControls() {
  const { mode, resolved, settings, activeProfile, setMode, applyProfile, resetSettings, updateSetting } = useTheme();
  const [activeTab, setActiveTab] = useState<AppearanceTab>('profiles');

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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profiles':
        return (
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
                  className={`relative min-h-28 rounded-[var(--vestara-radius-lg)] border p-3 text-left ${focus} ${
                    activeProfile === profile.id
                      ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)] shadow-[inset_3px_0_0_var(--vestara-accent)]'
                      : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] hover:border-[var(--vestara-accent-border-hover)]'
                  }`}
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
        );
      case 'appearance':
        return (
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
                      className={`grid size-7 place-items-center rounded-[var(--vestara-radius-full)] border ${focus} ${
                        settings.colorTheme === id
                          ? 'border-[var(--vestara-color-text-primary,var(--vestara-text))] ring-2 ring-[var(--vestara-accent)] ring-offset-2 ring-offset-[var(--vestara-color-surface-panel,var(--color-zinc-900))]'
                          : 'border-[var(--vestara-color-border-default,var(--color-zinc-700))]'
                      }`}
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
        );
      case 'typography':
        return (
          <SettingsSection title="Typography" description="Runtime font variables update every Workspace surface.">
            <SettingsRow label="Font family" value={select('fontFamily', ['system', 'serif', 'mono'])} />
            <SettingsRow label="Font size" value={select('fontSize', ['small', 'medium', 'large'])} />
            <SettingsRow label="Font weight" value={select('fontWeight', ['normal', 'medium', 'semibold'])} />
          </SettingsSection>
        );
      case 'layout':
        return (
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
        );
      case 'theme-builder':
        return (
          <ThemeBuilderProvider>
            <div className="h-[calc(100vh-200px)] min-h-[600px]">
              <ThemeBuilder />
            </div>
          </ThemeBuilderProvider>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-1 p-1 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface-raised,var(--color-zinc-950))] rounded-t-[var(--vestara-radius-lg)] px-3"
        role="tablist"
        aria-label="Appearance settings"
      >
        {APPEARANCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`${tab.id}-panel`}
            id={`${tab.id}-tab`}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-[var(--vestara-radius)] transition-colors ${focus} ${
              activeTab === tab.id
                ? 'bg-[var(--vestara-accent-bg)] text-[var(--vestara-accent-text)] border border-[var(--vestara-accent-border)]'
                : 'text-[var(--vestara-color-text-muted,var(--vestara-text-muted))] hover:text-[var(--vestara-color-text-primary,var(--vestara-text))] hover:bg-[var(--vestara-color-surface-panel,var(--color-zinc-900))]'
            }`}
            title={tab.description}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
        className="flex-1 overflow-auto p-4"
      >
        {renderTabContent()}
      </div>
    </div>
  );
}
