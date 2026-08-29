import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

interface RuntimeHealth {
  status: string;
  upstream?: { healthy?: boolean; url?: string };
  providers?: Array<{ id: string; healthy: boolean; modelCount: number; error?: string }>;
}

export default function RuntimeStatusBar() {
  const [expanded, setExpanded] = useState(false);
  const [health, setHealth] = useState<RuntimeHealth | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; modelCount: number }>>([]);
  const [loading, setLoading] = useState(false);

  const loadRuntime = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, providersRes] = await Promise.all([
        apiFetch<RuntimeHealth>('/api/opencode/health').catch(() => null),
        apiFetch<{ providers: Array<{ id: string; modelCount: number }> }>('/api/opencode/providers').catch(() => null),
      ]);
      if (healthRes) setHealth(healthRes);
      if (providersRes?.providers) setProviders(providersRes.providers);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRuntime();
  }, [loadRuntime]);

  const isHealthy = health?.status === 'healthy';
  const upstreamHealthy = health?.upstream?.healthy;

  return (
    <div className="mb-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg overflow-hidden">
      {/* Collapsed status bar */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex flex-wrap items-center gap-3 w-full p-3 text-left cursor-pointer hover:bg-(--vestara-accent-bg)/50 transition-colors"
      >
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            isHealthy
              ? 'bg-green-400/10 text-green-400'
              : health
                ? 'bg-amber-400/10 text-amber-400'
                : 'bg-zinc-800 text-(--vestara-text-muted)'
          }`}
        >
          Runtime {health?.status ?? 'unknown'}
        </span>
        <span className="text-[11px] text-(--vestara-text-muted) flex-1">
          OpenCode runtime ·{' '}
          {providers.length > 0
            ? `${providers.length} provider${providers.length > 1 ? 's' : ''}`
            : 'no providers discovered'}
        </span>
        <span className="text-[10px] text-(--vestara-text-dim)">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 border-t border-(--vestara-accent-border) space-y-3">
          {/* Health overview */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 rounded-md bg-zinc-800/50">
              <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1">Status</div>
              <div className={`text-xs font-medium ${isHealthy ? 'text-green-400' : 'text-amber-400'}`}>
                {health?.status ?? 'unknown'}
              </div>
            </div>
            <div className="p-2 rounded-md bg-zinc-800/50">
              <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1">Upstream</div>
              <div className={`text-xs font-medium ${upstreamHealthy ? 'text-green-400' : upstreamHealthy === false ? 'text-red-400' : 'text-(--vestara-text-dim)'}`}>
                {upstreamHealthy === true ? 'Healthy' : upstreamHealthy === false ? 'Unhealthy' : 'Unknown'}
              </div>
              {health?.upstream?.url && (
                <div className="text-[9px] text-(--vestara-text-dim) mt-0.5 font-mono truncate">
                  {health.upstream.url}
                </div>
              )}
            </div>
          </div>

          {/* Provider details */}
          {providers.length > 0 && (
            <div>
              <div className="text-[9px] text-(--vestara-text-muted) uppercase tracking-wider mb-1.5">Providers</div>
              <div className="space-y-1">
                {providers.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-[10px] py-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-green-400' : 'bg-amber-400'}`} />
                    <span className="text-(--vestara-text-2) font-medium">{p.id}</span>
                    <span className="text-(--vestara-text-dim)">{p.modelCount} models</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unhealthy message */}
          {health && !isHealthy && (
            <div className="text-[10px] text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-md p-2">
              Runtime is not healthy. Check that the OpenCode server is running and accessible.
            </div>
          )}

          {/* Retry button */}
          <button
            type="button"
            onClick={loadRuntime}
            disabled={loading}
            className="text-[9px] px-2 py-1 text-(--vestara-text-muted) hover:text-(--vestara-text-2) border border-(--vestara-accent-border) rounded-md transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'Retry Health Check'}
          </button>
        </div>
      )}
    </div>
  );
}
