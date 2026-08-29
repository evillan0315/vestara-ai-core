/**
 * OpenCode runtime overview.
 *
 * Consumes the governed /api/opencode/* surface and presents runtime health,
 * current repository context, agent/provider discovery, and contract
 * compatibility. No session mutation or live execution here — OCV-UI-001 is a
 * read-only overview proving the Workspace can consume the backend cleanly.
 */

import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type OpenCodeOverview, openCodeApi } from '../../lib/opencode';

type ViewState = 'loading' | 'ready' | 'degraded' | 'offline';

function toneFor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('healthy') || s.includes('connected') || s.includes('compatible')) return 'text-(--vestara-green)';
  if (s.includes('degraded') || s.includes('breaking') || s.includes('warning')) return 'text-(--vestara-amber)';
  if (s.includes('unhealthy') || s.includes('offline') || s.includes('failed')) return 'text-(--vestara-red)';
  return 'text-(--vestara-blue)';
}

function badgeClass(tone: string): string {
  if (tone.includes('green')) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (tone.includes('amber')) return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (tone.includes('red')) return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-zinc-800 text-(--vestara-text-muted) border-(--vestara-accent-border)';
}

export function OpenCodePage() {
  const [data, setData] = useState<OpenCodeOverview | null>(null);
  const [view, setView] = useState<ViewState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await openCodeApi.overview();
      setData(result);
      setError(null);
      if (!result.health?.reachable) {
        setView('offline');
      } else if (
        result.health.status === 'unhealthy' ||
        (result.compatibility && !result.compatibility.checksumMatches)
      ) {
        setView('degraded');
      } else {
        setView('ready');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setView('offline');
    } finally {
      setUpdatedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (paused) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => {
      void load();
    }, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [paused, load]);

  const health = data?.health ?? null;
  const compatibility = data?.compatibility ?? null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">OpenCode</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            Governed OpenCode runtime — health, repository context, and contract compatibility
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] text-(--vestara-text-muted) cursor-pointer">
            <input
              type="checkbox"
              checked={paused}
              onChange={(e) => setPaused(e.target.checked)}
              className="accent-(--vestara-accent)"
            />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
          >
            <RefreshRoundedIcon fontSize="inherit" /> Refresh
          </button>
        </div>
      </div>

      {view === 'loading' && <LoadingState />}

      {view !== 'loading' && (
        <>
          {view === 'offline' && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <div className="text-[12px] font-medium text-red-400">OpenCode is unreachable</div>
              <p className="text-[11px] text-(--vestara-text-muted) mt-0.5">
                The governed runtime is offline. Start the OpenCode server (or the Vestara API) and refresh.
              </p>
              {error && <p className="text-[10px] font-mono text-(--vestara-text-dim) mt-1">{error}</p>}
              <button
                type="button"
                onClick={() => {
                  setView('loading');
                  void load();
                }}
                className="mt-2 text-[10px] px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 hover:text-red-300 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {view === 'degraded' && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="text-[12px] font-medium text-amber-400">OpenCode is degraded</div>
              <p className="text-[11px] text-(--vestara-text-muted) mt-0.5">
                The runtime responds but reports an unhealthy or drifted state.
              </p>
              <button
                type="button"
                onClick={() => {
                  setView('loading');
                  void load();
                }}
                className="mt-2 text-[10px] px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-md text-amber-400 hover:text-amber-300 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <HealthCard health={health} />
            <ProjectCard project={data?.project ?? null} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
            <AgentsCard agents={data?.agents ?? []} />
            <ProvidersCard providers={data?.providers ?? []} />
          </div>

          <CompatibilityCard compatibility={compatibility} />
        </>
      )}

      <div className="mt-4 text-[10px] text-(--vestara-text-dim)">
        {updatedAt > 0 && `Last checked ${new Date(updatedAt).toLocaleTimeString()}`}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg animate-pulse">
        <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
        <div className="h-8 w-32 bg-zinc-800 rounded" />
      </div>
      <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg animate-pulse">
        <div className="h-3 w-24 bg-zinc-800 rounded mb-3" />
        <div className="h-8 w-40 bg-zinc-800 rounded" />
      </div>
    </div>
  );
}

function HealthCard({ health }: { health: OpenCodeOverview['health'] }) {
  const tone = health ? toneFor(health.status) : 'text-(--vestara-text-muted)';
  return (
    <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Runtime Health</div>
      {!health ? (
        <p className="text-[11px] text-(--vestara-text-muted)">No health data.</p>
      ) : (
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${health.status === 'healthy' ? 'bg-(--vestara-green)' : 'bg-(--vestara-red)'}`}
            />
            <span className={`text-[15px] font-bold capitalize ${tone}`}>{health.status}</span>
          </div>
          <div className="mt-2 space-y-1 text-[11px] text-(--vestara-text-2)">
            <div>
              Version{' '}
              <span className="font-mono text-(--vestara-text-muted)">{health.upstream.version ?? 'unknown'}</span>
            </div>
            <div>
              Latency <span className="font-mono text-(--vestara-text-muted)">{health.latencyMs}ms</span>
            </div>
            <div>
              Event bridge{' '}
              <span
                className={`font-mono ${health.eventBridge.connected ? 'text-(--vestara-green)' : 'text-(--vestara-text-muted)'}`}
              >
                {health.eventBridge.connectionState}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: OpenCodeOverview['project'] }) {
  return (
    <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Current Repository</div>
      {!project ? (
        <p className="text-[11px] text-(--vestara-text-muted)">No project context available.</p>
      ) : (
        <div className="space-y-1.5 text-[11px] text-(--vestara-text-2)">
          <div className="flex items-center gap-2">
            <span className="text-(--vestara-text) font-medium truncate">
              {project.name || project.id.slice(0, 12)}
            </span>
            {project.vcs && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-(--vestara-text-muted) uppercase">
                {project.vcs}
              </span>
            )}
          </div>
          <div className="font-mono text-(--vestara-text-muted) text-[10px] truncate" title={project.worktree}>
            {project.worktree}
          </div>
        </div>
      )}
    </div>
  );
}

function AgentsCard({ agents }: { agents: OpenCodeOverview['agents'] }) {
  return (
    <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">
        Agents ({agents.length})
      </div>
      {agents.length === 0 ? (
        <p className="text-[11px] text-(--vestara-text-muted)">No agents discovered.</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-auto">
          {agents.map((agent) => (
            <div key={agent.name} className="flex items-center gap-2 text-[11px] text-(--vestara-text-2)">
              <span className="font-mono text-(--vestara-accent)">{agent.name}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-(--vestara-text-muted)">
                {agent.mode ?? 'agent'}
              </span>
              {agent.native && <span className="text-[9px] text-(--vestara-text-dim)">native</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProvidersCard({ providers }: { providers: OpenCodeOverview['providers'] }) {
  return (
    <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">
        Providers ({providers.length})
      </div>
      {providers.length === 0 ? (
        <p className="text-[11px] text-(--vestara-text-muted)">No providers discovered.</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-auto">
          {providers.slice(0, 60).map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between gap-2 text-[11px] text-(--vestara-text-2)"
            >
              <span className="truncate">{provider.name ?? provider.id}</span>
              <span className="text-[9px] text-(--vestara-text-dim) shrink-0">{provider.modelCount} models</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompatibilityCard({ compatibility }: { compatibility: OpenCodeOverview['compatibility'] }) {
  const tone = compatibility ? toneFor(compatibility.status) : 'text-(--vestara-text-muted)';
  const badge = compatibility ? badgeClass(tone) : badgeClass('muted');
  return (
    <div className="p-4 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted)">Contract Compatibility</div>
        {compatibility && (
          <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${badge}`}>
            {compatibility.status}
          </span>
        )}
      </div>
      {!compatibility ? (
        <p className="text-[11px] text-(--vestara-text-muted)">Compatibility check unavailable.</p>
      ) : (
        <div className="space-y-1 text-[11px] text-(--vestara-text-2)">
          <div className="flex items-center gap-2">
            <span>Checksums</span>
            <span className={compatibility.checksumMatches ? 'text-(--vestara-green)' : 'text-(--vestara-red)'}>
              {compatibility.checksumMatches ? 'match' : 'differ'}
            </span>
          </div>
          <div className="font-mono text-[9px] text-(--vestara-text-dim) break-all">
            {compatibility.pinnedSchemaChecksum}
          </div>
          {compatibility.breakingChanges.length > 0 && (
            <div className="mt-1 space-y-1">
              {compatibility.breakingChanges.map((change) => (
                <div key={`${change.path}-${change.kind}`} className="text-[10px] text-(--vestara-red)">
                  • {change.summary}
                </div>
              ))}
            </div>
          )}
          {compatibility.warnings.length > 0 && (
            <div className="mt-1 space-y-1">
              {compatibility.warnings.map((change) => (
                <div key={`${change.path}-${change.kind}`} className="text-[10px] text-(--vestara-amber)">
                  • {change.summary}
                </div>
              ))}
            </div>
          )}
          {compatibility.openCodeVersion && (
            <div className="mt-1 text-[10px] text-(--vestara-text-dim)">
              OpenCode version <span className="font-mono">{compatibility.openCodeVersion}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
