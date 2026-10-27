import type { ShellAppearanceSettings } from '@vestara/settings-framework';
import { useEffect, useState } from 'react';
import { accentThemeOptions, loadShellAppearance, saveShellAppearance } from '../lib/workspace-settings-model';
import { APPEARANCE_HELP } from './settings.fixtures';

/**
 * Shell appearance controls (accent theme + TopBar density).
 * Options come from the framework-registered entry; values validate through
 * the engine, persist to this browser only, and apply live via shell CSS
 * vars (no server round-trip — the API does not own shell chrome).
 */
export function AppearanceCard() {
  const [settings, setSettings] = useState<ShellAppearanceSettings | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadShellAppearance()
      .then((next) => {
        if (!cancelled) setSettings(next);
      })
      .catch(() => {
        if (!cancelled) setNotice('Could not read stored appearance.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (patch: Partial<ShellAppearanceSettings>) => {
    setNotice(null);
    try {
      setSettings(await saveShellAppearance(patch));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Appearance update failed.');
    }
  };

  return (
    <div className="rounded-[var(--vestara-radius-md-plus)] bg-[var(--vestara-surface-shell-raised)] border border-[var(--vestara-border-shell)] p-3">
      <div className="text-[length:var(--vestara-font-size-label)] tracking-[0.12em] text-[var(--vestara-text-shell-muted)]">
        APPEARANCE
      </div>
      {settings === null ? (
        <div className="mt-2 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-secondary)]">
          Reading stored appearance…
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <label className="block min-w-0">
            <span className="block text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-shell-secondary)]">
              Accent theme
            </span>
            <select
              aria-label="Accent theme"
              value={settings.accentTheme}
              onChange={(event) =>
                update({ accentTheme: event.target.value as ShellAppearanceSettings['accentTheme'] })
              }
              className="mt-1 min-h-9 w-full rounded-[var(--vestara-radius-md)] border border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)] px-2 text-[length:var(--vestara-font-size-body-small)] text-[var(--vestara-text-shell-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vestara-accent-shell)]"
            >
              {accentThemeOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[length:var(--vestara-font-size-sm)] font-medium text-[var(--vestara-text-shell-secondary)]">
                Compact TopBar
              </div>
              <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-muted)]">
                36px compact bar; off uses the comfortable height.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.compactTopBar}
              aria-label="Compact TopBar"
              onClick={() => update({ compactTopBar: !settings.compactTopBar })}
              className={`relative h-6 w-10 shrink-0 rounded-[var(--vestara-radius-full)] border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--vestara-accent-shell)] ${
                settings.compactTopBar
                  ? 'border-[var(--vestara-accent-shell)] bg-[var(--vestara-accent-shell)]'
                  : 'border-[var(--vestara-border-shell)] bg-[var(--vestara-surface-shell-panel)]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-0.5 top-0.5 size-4 rounded-full transition-transform ${
                  settings.compactTopBar
                    ? 'translate-x-5 bg-[var(--vestara-surface-shell-canvas)]'
                    : 'translate-x-0 bg-[var(--vestara-text-shell-secondary)]'
                }`}
              />
            </button>
          </div>
          <div className="text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-text-shell-secondary)]">
            {APPEARANCE_HELP}
          </div>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="mt-2 text-[length:var(--vestara-font-size-caption)] text-[var(--vestara-status-shell-warning)]"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
