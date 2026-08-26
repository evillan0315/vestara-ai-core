import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

export default function RuntimeStatusBar() {
  const [runtimeHealth, setRuntimeHealth] = useState<{ status: string; upstream?: { healthy?: boolean } } | null>(null);
  const [runtimeProviders, setRuntimeProviders] = useState<Array<{ id: string; modelCount: number }>>([]);

  const loadRuntime = useCallback(async () => {
    try {
      const [health, providers] = await Promise.all([
        apiFetch<{ status: string; upstream?: { healthy?: boolean } }>('/api/opencode/health').catch(() => null),
        apiFetch<{ providers: Array<{ id: string; modelCount: number }> }>('/api/opencode/providers').catch(() => null),
      ]);
      if (health) setRuntimeHealth(health);
      if (providers?.providers) setRuntimeProviders(providers.providers);
    } catch {}
  }, []);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  return (
    <div className="flex flex-wrap items-center gap-3 p-3 mb-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
          runtimeHealth?.status === 'healthy'
            ? 'bg-green-400/10 text-green-400'
            : runtimeHealth
              ? 'bg-amber-400/10 text-amber-400'
              : 'bg-zinc-800 text-(--vestara-text-muted)'
        }`}
      >
        Runtime {runtimeHealth?.status ?? 'unknown'}
      </span>
      <span className="text-[11px] text-(--vestara-text-muted)">
        OpenCode runtime ·{' '}
        {runtimeProviders.length > 0
          ? `providers: ${runtimeProviders.map((p) => `${p.id} (${p.modelCount})`).join(', ')}`
          : 'no providers discovered — the server\u2019s configured default will be used'}
      </span>
    </div>
  );
}
