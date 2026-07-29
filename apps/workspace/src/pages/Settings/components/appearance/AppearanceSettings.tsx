import { useCallback, useEffect, useState } from 'react';
import {
  ACCENT_PALETTES,
  type ColorTheme,
  PROFILES,
  type ThemeMode,
  type ThemeSettings,
  useTheme,
} from '../../../../lib/theme';

interface ApiSettingsResponse {
  settings: Record<string, string>;
}

function loadApiThemeSettings(): Partial<ThemeSettings> | null {
  try {
    const raw = localStorage.getItem('vestara-api-theme');
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveApiThemeSettings(settings: ThemeSettings): void {
  try {
    localStorage.setItem('vestara-api-theme', JSON.stringify(settings));
  } catch {}
}

async function fetchThemeSettings(): Promise<ThemeSettings | null> {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) return null;
    const data: ApiSettingsResponse = await res.json();
    const themeRaw = data.settings?.theme;
    if (themeRaw) {
      return { ...JSON.parse(themeRaw) };
    }
  } catch {}
  return null;
}

async function persistThemeSettings(settings: ThemeSettings): Promise<boolean> {
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: JSON.stringify(settings) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function AppearanceSettings() {
  const { settings, updateSetting, applyProfile, resetSettings, mode, setMode } = useTheme();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [apiLoaded, setApiLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const apiSettings = await fetchThemeSettings();
      if (!cancelled && apiSettings) {
        for (const [key, value] of Object.entries(apiSettings)) {
          if (key in settings && value !== undefined) {
            updateSetting(key as keyof ThemeSettings, value as ThemeSettings[keyof ThemeSettings]);
          }
        }
        setApiLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [settings, updateSetting]);

  const handleSettingChange = useCallback(
    async <K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) => {
      updateSetting(key, value);
      const newSettings = { ...settings, [key]: value };
      const success = await persistThemeSettings(newSettings);
      setSaveStatus(success ? 'saved' : 'error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    [settings, updateSetting],
  );

  const handleModeChange = useCallback(
    async (newMode: ThemeMode) => {
      setMode(newMode);
      const success = await persistThemeSettings({ ...settings, colorTheme: settings.colorTheme });
      setSaveStatus(success ? 'saved' : 'error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    [settings, setMode],
  );

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    const success = await persistThemeSettings(settings);
    setSaveStatus(success ? 'saved' : 'error');
    saveApiThemeSettings(settings);
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [settings]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--vestara-text)] mb-2">Appearance</h1>
      <p className="text-[var(--vestara-text-2)] mb-6">Customize the look and feel of your workspace.</p>

      {saveStatus === 'saving' && <div className="mb-4 text-sm text-amber-500">Saving...</div>}
      {saveStatus === 'saved' && (
        <div className="mb-4 text-sm text-[var(--vestara-green)]">Settings saved to API and localStorage</div>
      )}
      {saveStatus === 'error' && (
        <div className="mb-4 text-sm text-[var(--vestara-red)]">Failed to save to API — changes saved locally</div>
      )}

      <div className="space-y-6">
        {/* Theme Mode */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Theme Mode</h2>
          <div className="grid grid-cols-3 gap-4">
            {(['dark', 'light', 'system'] as ThemeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`
                  p-4 rounded-lg border text-center transition-colors
                  ${mode === m ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]' : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)] hover:border-[var(--vestara-accent-border-hover)]'}
                `}
              >
                <div className="text-2xl mb-2">{m === 'dark' ? '🌙' : m === 'light' ? '☀️' : '💻'}</div>
                <span className="font-medium text-[var(--vestara-text)] capitalize">{m}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Accent Color */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Accent Color</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(ACCENT_PALETTES).map(([key, palette]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSettingChange('colorTheme', key as ColorTheme)}
                className={`
                  w-10 h-10 rounded-full border-2 transition-transform
                  ${settings.colorTheme === key ? 'border-[var(--vestara-text)] scale-110' : 'border-transparent hover:scale-105'}
                `}
                style={{ backgroundColor: palette.hex }}
                title={palette.label}
              />
            ))}
          </div>
        </section>

        {/* Font Size */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Font Size</h2>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="2"
              value={['small', 'medium', 'large'].indexOf(settings.fontSize)}
              onChange={(e) => {
                const sizes = ['small', 'medium', 'large'] as const;
                handleSettingChange('fontSize', sizes[Number(e.target.value)]);
              }}
              className="flex-1"
            />
            <span className="text-[var(--vestara-text)] font-medium w-16 text-center capitalize">
              {settings.fontSize}
            </span>
          </div>
        </section>

        {/* Font Family */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Font Family</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['system', 'serif', 'mono'] as const).map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => handleSettingChange('fontFamily', font)}
                className={`
                  p-3 rounded-lg border text-left transition-colors
                  ${settings.fontFamily === font ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]' : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)]'}
                `}
              >
                <span className="text-[var(--vestara-text)] capitalize">{font}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Font Weight */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Font Weight</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['normal', 'medium', 'semibold'] as const).map((weight) => (
              <button
                key={weight}
                type="button"
                onClick={() => handleSettingChange('fontWeight', weight)}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${settings.fontWeight === weight ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]' : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)]'}
                `}
              >
                <span className="text-[var(--vestara-text)] capitalize">{weight}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Sidebar Width */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Sidebar Width</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['compact', 'normal', 'wide'] as const).map((width) => (
              <button
                key={width}
                type="button"
                onClick={() => handleSettingChange('sidebarWidth', width)}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${settings.sidebarWidth === width ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]' : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)]'}
                `}
              >
                <span className="text-[var(--vestara-text)] capitalize">{width}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Spacing */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Spacing</h2>
          <div className="grid grid-cols-3 gap-2">
            {(['compact', 'comfortable', 'spacious'] as const).map((spacing) => (
              <button
                key={spacing}
                type="button"
                onClick={() => handleSettingChange('spacing', spacing)}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${settings.spacing === spacing ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]' : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)]'}
                `}
              >
                <span className="text-[var(--vestara-text)] capitalize">{spacing}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Border Radius */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Border Radius</h2>
          <div className="grid grid-cols-4 gap-2">
            {(['none', 'small', 'medium', 'large'] as const).map((radius) => (
              <button
                key={radius}
                type="button"
                onClick={() => handleSettingChange('radius', radius)}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${settings.radius === radius ? 'border-[var(--vestara-accent)] bg-[var(--vestara-accent-bg)]' : 'border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)]'}
                `}
              >
                <span className="text-[var(--vestara-text)] capitalize">{radius}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Presets */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--vestara-text)] mb-4">Presets</h2>
          <div className="grid grid-cols-2 gap-2">
            {PROFILES.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => {
                  applyProfile(profile.id);
                  saveApiThemeSettings(profile.settings);
                  persistThemeSettings(profile.settings);
                }}
                className="p-3 rounded-lg border border-[var(--vestara-accent-border)] bg-[var(--color-zinc-900)] hover:border-[var(--vestara-accent-border-hover)] transition-colors text-left"
              >
                <div className="text-[var(--vestara-text)] font-medium">
                  {profile.icon} {profile.label}
                </div>
                <div className="text-xs text-[var(--vestara-text-2)] mt-1">{profile.description}</div>
              </button>
            ))}
          </div>
        </section>

        {/* Reset */}
        <section className="pt-4 border-t border-[var(--vestara-accent-border)]">
          <button
            type="button"
            onClick={() => {
              resetSettings();
              saveApiThemeSettings(settings);
              persistThemeSettings(settings);
            }}
            className="px-4 py-2 bg-[var(--vestara-red)]/10 border border-[var(--vestara-red)]/30 text-[var(--vestara-red)] rounded-lg hover:bg-[var(--vestara-red)]/20 transition-colors text-sm"
          >
            Reset to Defaults
          </button>
        </section>

        {/* Manual Save */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-[var(--vestara-accent)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm"
          >
            Save to API &amp; Storage
          </button>
        </div>
      </div>
    </div>
  );
}
