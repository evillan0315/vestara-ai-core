/**
 * External Runtimes — observe OpenCode (primary), Claude Code, and OpenAI
 * Codex as external engineering workers: discovery, health, integration level,
 * configuration, and runtime intelligence (agents, skills, providers, models).
 */

import { useMemo, useState } from 'react';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { usePolling } from '../../hooks/usePolling';
import { externalRuntimeApi } from '../../lib/external-runtime';
import type { ExternalRuntimeInstance, ExternalSessionSummary } from '../../lib/external-runtime';

type Tab = 'sessions' | 'agents' | 'skills' | 'providers' | 'configuration';

function toneFor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('connected')) return 'text-(--vestara-green)';
  if (s.includes('disconnected') || s.includes('failed') || s.includes('unreachable')) return 'text-(--vestara-red)';
  if (s.includes('degraded')) return 'text-(--vestara-amber)';
  return 'text-(--vestara-blue)';
}

/** Honest observation-channel wording for a runtime's integration level. */
function observationWording(runtime: ExternalRuntimeInstance): string {
  switch (runtime.integrationLevel) {
    case 'live-observation':
      return 'Live observation active';
    case 'snapshot':
      return 'Snapshot observation';
    case 'vestara-launched':
      return 'Structured launch available';
    case 'full-observation':
      return 'Full observation';
    case 'discovery-only':
    default:
      return runtime.runtimeType === 'opencode' ? 'Detected — no live connection' : 'Structured launch available · No active observation channel';
  }
}

export function ExternalRuntimesPage() {
  const runtimesPoll = usePolling(externalRuntimeApi.runtimes, 5000);
  const sessionsPoll = usePolling(externalRuntimeApi.sessions, 5000);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('sessions');

  const runtimes = runtimesPoll.data?.runtimes ?? [];
  const sessions = sessionsPoll.data?.sessions ?? [];
  const selectedRuntime = runtimes.find((r) => r.id === selected) ?? runtimes[0] ?? null;

  const loadIntelligence = (kind: Tab) => {
    setTab(kind);
    if (!selectedRuntime) return;
    if (kind === 'configuration') {
      void externalRuntimeApi.configuration(selectedRuntime.id);
    } else {
      void externalRuntimeApi.intelligence(selectedRuntime.id, kind as never);
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">External Runtimes</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            External coding-agent engineering workers observed by Vestara
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              void runtimesPoll.refresh();
              void sessionsPoll.refresh();
            }}
            className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
          >
            <RefreshRoundedIcon fontSize="inherit" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => void externalRuntimeApi.discover().then(() => runtimesPoll.refresh())}
            className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
          >
            Discover
          </button>
        </div>
      </div>

      {/* Runtime list */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {runtimes.length === 0 && (
          <p className="text-[11px] text-(--vestara-text-muted) col-span-full">No external runtimes detected on this host.</p>
        )}
        {runtimes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelected(r.id)}
            className={`text-left p-3 bg-(--vestara-accent-bg) border rounded-lg transition-colors cursor-pointer ${
              selectedRuntime?.id === r.id ? 'border-(--vestara-accent-border-active)' : 'border-(--vestara-accent-border)'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-(--vestara-text)">{r.displayName}</span>
              <span
                className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  r.isPrimary ? 'bg-(--vestara-accent-bg) text-(--vestara-accent)' : 'bg-zinc-800 text-(--vestara-text-muted)'
                }`}
              >
                {r.isPrimary ? 'Primary Runtime' : 'Secondary'}
              </span>
            </div>
            <div className={`text-[10px] mt-1 ${toneFor(r.connectionStatus)}`}>
              {observationWording(r)} · integration {r.integrationLevel}
            </div>
            <div className="text-[10px] text-(--vestara-text-muted) mt-0.5">
              {r.version ?? 'version unknown'} · verification {r.verificationStatus}
            </div>
            <div className="text-[10px] text-(--vestara-text-muted) mt-0.5">
              {r.availableCapabilities.length} active · {r.supportedCapabilities.length} supported
            </div>
          </button>
        ))}
      </div>

      {selectedRuntime && (
        <>
          {/* Runtime detail header */}
          <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[12px] text-(--vestara-text) font-medium">{selectedRuntime.displayName}</span>
              <span className={`text-[10px] ${toneFor(selectedRuntime.connectionStatus)}`}>{selectedRuntime.connectionStatus}</span>
              <span className="text-[10px] text-(--vestara-text-muted)">integration: {selectedRuntime.integrationLevel}</span>
              {selectedRuntime.serverUrl && <span className="text-[10px] font-mono text-(--vestara-text-muted)">{selectedRuntime.serverUrl}</span>}
              {selectedRuntime.processId && <span className="text-[10px] font-mono text-(--vestara-text-muted)">pid {selectedRuntime.processId}</span>}
              <span className="text-[10px] text-(--vestara-text-muted)">sessions: {sessions.filter((s) => s.runtimeType === selectedRuntime.runtimeType).length}</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedRuntime.availableCapabilities.slice(0, 18).map((c) => (
                <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted)">
                  {c}
                </span>
              ))}
              {selectedRuntime.availableCapabilities.length === 0 && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-dim)">
                  no capabilities exercised yet (discovery only)
                </span>
              )}
            </div>
          </div>

          {/* Capability-driven tabs */}
          <div className="flex gap-1 flex-wrap mb-3">
            {(
              [
                ['sessions', 'Sessions'],
                ['agents', 'Agents'],
                ['skills', 'Skills'],
                ['providers', 'Providers'],
                ['configuration', 'Configuration'],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => {
              const supported =
                id === 'sessions'
                  ? selectedRuntime.capabilities.includes('session-discovery')
                  : id === 'agents' || id === 'skills' || id === 'providers'
                    ? selectedRuntime.capabilities.includes('provider-observation') || selectedRuntime.runtimeType === 'opencode'
                    : selectedRuntime.capabilities.includes('configuration-discovery');
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => loadIntelligence(id)}
                  disabled={!supported}
                  className={`text-[10px] px-2 py-1 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
                    tab === id ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <IntelligenceTab runtime={selectedRuntime} tab={tab} sessions={sessions} />
        </>
      )}
    </div>
  );
}

function IntelligenceTab({ runtime, tab, sessions }: { runtime: ExternalRuntimeInstance; tab: Tab; sessions: ExternalSessionSummary[] }) {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  void data;
  void loading;

  if (tab === 'sessions') {
    const sessionsOfRuntime = sessions.filter((s) => s.runtimeType === runtime.runtimeType);
    return (
      <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">
          Sessions ({sessionsOfRuntime.length})
        </div>
        {sessionsOfRuntime.length === 0 && <p className="text-[11px] text-(--vestara-text-muted)">No sessions observed.</p>}
        <div className="space-y-1">
          {sessionsOfRuntime.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-[11px] text-(--vestara-text-2)">
              <span className={`w-2 h-2 rounded-full ${s.status === 'running' ? 'bg-(--vestara-green)' : 'bg-zinc-600'}`} />
              {s.title || s.externalSessionId}
              <span className="text-(--vestara-text-muted)">· {s.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <TabLoader runtime={runtime} kind={tab} />;
}

function TabLoader({ runtime, kind }: { runtime: ExternalRuntimeInstance; kind: Tab }) {
  const [items, setItems] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);

  useMemo(() => {
    setLoading(true);
    const run = async () => {
      if (kind === 'configuration') {
        const cfg = await externalRuntimeApi.configuration(runtime.id);
        setItems(cfg ? cfg.configuration.sources : []);
      } else {
        const res = await externalRuntimeApi.intelligence(runtime.id, kind as never);
        const list = res ? Object.values(res)[0] : [];
        setItems(Array.isArray(list) ? list : []);
      }
      setLoading(false);
    };
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime.id, kind]);

  if (loading) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading {kind}…</p>;
  if (!items || items.length === 0) return <p className="text-[11px] text-(--vestara-text-muted)">No {kind} discovered.</p>;

  return (
    <div className="space-y-1">
      {(items as Array<Record<string, unknown>>).slice(0, 40).map((item, i) => (
        <div key={`${kind}-${i}`} className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg text-[11px] text-(--vestara-text-2)">
          <span className="font-mono">{String(item['name'] ?? item['providerId'] ?? item['modelId'] ?? item['path'] ?? item['id'] ?? '')}</span>
          {typeof item['description'] === 'string' && (
            <span className="text-(--vestara-text-muted) ml-2">{item['description'].slice(0, 60)}</span>
          )}
          {typeof item['mode'] === 'string' && <span className="text-(--vestara-accent) ml-2">{item['mode']}</span>}
        </div>
      ))}
    </div>
  );
}
