/**
 * ActivitySettingsPanel — display preferences for the Activity Room drawer.
 *
 * Reuses the Settings feature's own General reference surface (same
 * configuration/runtime authority via settingsClient). No parallel settings
 * UI: appearance, density, and accent edits apply workspace-wide instantly.
 */

import { useCallback, useEffect, useState } from 'react';
import type { ResolvedConfiguration } from '@vestara/configuration';
import type { RuntimeStatusDto } from '../Settings/settings-client.js';
import { settingsClient } from '../Settings/settings-client.js';
import { SettingsGeneralReference } from '../Settings/SettingsReferenceSurface.js';

export default function ActivitySettingsPanel() {
  const [configuration, setConfiguration] = useState<ResolvedConfiguration | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextConfiguration, nextRuntime] = await Promise.all([
        settingsClient.configuration(),
        settingsClient.runtime(),
      ]);
      setConfiguration(nextConfiguration);
      setRuntime(nextRuntime);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Settings are unavailable');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center" role="alert">
        <p className="text-sm text-[var(--vestara-status-error)]">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-1 rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-3 py-1.5 text-xs font-medium text-[var(--vestara-accent-text)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!configuration || !runtime) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center" role="status" aria-label="Loading settings">
        <span className="text-sm text-[var(--vestara-text-muted)]">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full min-w-0 overflow-y-auto p-3">
      <SettingsGeneralReference
        configuration={configuration}
        runtime={runtime}
        onChanged={setConfiguration}
      />
    </div>
  );
}
