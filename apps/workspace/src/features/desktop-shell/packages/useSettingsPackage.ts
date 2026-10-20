/**
 * VES-UI-001 T6: Settings Package Data Hook
 *
 * Server configuration first (`GET /api/settings` via `settingsClient`)
 * → snapshot fallback. Appearance controls bind to the theme provider
 * (`useTheme`), which persists approved values durably to workspace
 * settings — so the package surface is bound to real config, never a
 * static transcript.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 Settings bound to config)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import type { ResolvedConfiguration } from '@vestara/configuration';
import { useCallback, useEffect, useState } from 'react';
import { settingsClient } from '../../../pages/Settings/settings-client';

export interface SettingsPackageSnapshot {
  readonly workspaceName: string;
  readonly revision: string;
  readonly sectionCount: number;
  readonly settingCount: number;
  readonly generatedAt: string | null;
}

export interface UseSettingsPackageReturn {
  readonly snapshot: SettingsPackageSnapshot;
  readonly isLoading: boolean;
  readonly isLive: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
}

const SNAPSHOT: SettingsPackageSnapshot = {
  workspaceName: 'vestara-platform',
  revision: 'snapshot',
  sectionCount: 7,
  settingCount: 0,
  generatedAt: null,
};

function toSnapshot(configuration: ResolvedConfiguration): SettingsPackageSnapshot {
  const workspaceName = configuration.settings.find((setting) => setting.key === 'general.workspaceName')?.value;
  const sections = new Set(configuration.settings.map((setting) => setting.section));
  return {
    workspaceName: typeof workspaceName === 'string' && workspaceName ? workspaceName : 'vestara-platform',
    revision: configuration.revision,
    sectionCount: sections.size,
    settingCount: configuration.settings.length,
    generatedAt: configuration.generatedAt,
  };
}

export function useSettingsPackage(): UseSettingsPackageReturn {
  const [snapshot, setSnapshot] = useState<SettingsPackageSnapshot>(SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const configuration = await settingsClient.configuration();
      setSnapshot(toSnapshot(configuration));
      setIsLive(true);
      setError(null);
    } catch (err) {
      setSnapshot(SNAPSHOT);
      setIsLive(false);
      setError(err instanceof Error ? err.message : 'Settings unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { snapshot, isLoading, isLive, error, refetch: fetchData };
}
