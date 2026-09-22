/**
 * ActivityBrowserPanel — embeds the existing agent-browser dashboard.
 *
 * Vestara owns only the Activity Room dock shell and availability boundary.
 * agent-browser remains authoritative for browser sessions, streaming,
 * automation, Console, Network, Storage, and Extensions.
 */

import { useCallback, useEffect, useState } from 'react';
import { getAgentBrowserDashboardUrl, resolveHttpUrl } from '../../lib/clientConfig';

type DashboardState = 'loading' | 'loaded' | 'unavailable';

interface RuntimeStatus {
  readonly browserDashboardUrl?: string;
}

async function fetchRuntimeStatus(signal: AbortSignal): Promise<RuntimeStatus> {
  const response = await fetch(resolveHttpUrl('/api/runtime/status'), { signal });
  if (!response.ok) throw new Error(`Runtime status unavailable (${response.status})`);
  return (await response.json()) as RuntimeStatus;
}

async function checkDashboard(url: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(url, { method: 'GET', signal });
  if (!response.ok) throw new Error(`Dashboard unavailable (${response.status})`);
}

export default function ActivityBrowserPanel() {
  const [dashboardUrl, setDashboardUrl] = useState('');
  const [state, setState] = useState<DashboardState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState('loading');
    setError(null);
    setDashboardUrl('');
    void (async () => {
      try {
        const runtime = await fetchRuntimeStatus(controller.signal);
        const url = runtime.browserDashboardUrl?.trim() || getAgentBrowserDashboardUrl();
        if (!url) throw new Error('No agent-browser dashboard URL is configured');
        await checkDashboard(url, controller.signal);
        setDashboardUrl(url);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'agent-browser dashboard could not be reached');
        setState('unavailable');
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  if (state === 'unavailable') {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="max-w-sm space-y-1">
          <h3 className="text-sm font-semibold text-[var(--vestara-text-primary)]">Live Browser unavailable</h3>
          <p className="text-xs text-[var(--vestara-text-muted)]">
            {error ?? 'agent-browser dashboard could not be reached.'}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          className="rounded-[var(--vestara-radius)] border border-[var(--vestara-accent-border)] bg-[var(--vestara-accent-bg)] px-3 py-1.5 text-xs font-medium text-[var(--vestara-accent-text)] transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vestara-accent)] focus-visible:ring-inset"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {!dashboardUrl && (
        <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center p-6 text-center" role="status">
          <span className="text-sm text-[var(--vestara-text-muted)]">Loading dashboard...</span>
        </div>
      )}
      {dashboardUrl && (
        <iframe
          src={dashboardUrl}
          title="Vestara Live Browser"
          className="h-full min-h-0 w-full min-w-0 flex-1 border-0"
          onLoad={() => setState('loaded')}
        />
      )}
    </div>
  );
}
