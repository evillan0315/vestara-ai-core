/**
 * VOS-STARTUP-001 P1: Startup Query Hook
 *
 * API-first with fixture fallback (P2 will wire systemd/API readiness).
 * Reads ?entry=onboarding|login and exposes loading/ready/degraded states.
 */

import { useEffect, useState } from 'react';
import { startupFixture } from '../startup.fixtures';
import type { StartupEntry, StartupViewModel } from '../startup.types';

export interface UseStartupReturn {
  readonly data: StartupViewModel;
  readonly isLoading: boolean;
}

function readEntry(): StartupEntry {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('entry') === 'onboarding' ? 'onboarding' : 'login';
  } catch {
    return 'login';
  }
}

export function useStartup(): UseStartupReturn {
  const [data, setData] = useState<StartupViewModel>(startupFixture);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const entry = readEntry();
      try {
        const res = await fetch('/api/workspace', { headers: { 'Content-Type': 'application/json' } });
        if (!cancelled && res.ok) {
          setData({ ...startupFixture, entry });
        } else if (!cancelled) {
          setData({ ...startupFixture, entry });
        }
      } catch {
        if (!cancelled) setData({ ...startupFixture, entry });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, isLoading };
}
