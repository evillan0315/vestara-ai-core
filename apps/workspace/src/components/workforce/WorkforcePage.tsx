/**
 * Engineering Workforce Control Center.
 *
 * A unified operational view over every engineering worker regardless of
 * runtime — Vestara, OpenCode (primary), Claude Code and OpenAI Codex
 * (secondary). Capability-driven: panels render from the generic runtime
 * protocol, so nothing here hardcodes a specific external runtime.
 *
 * Tabs: Workforce · Live · Runtimes · Agents · Skills · Evidence ·
 * Configuration · Graph
 */

import { useMemo, useState } from 'react';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { usePolling } from '../../hooks/usePolling';
import { externalRuntimeApi } from '../../lib/external-runtime';
import type { ExternalRuntimeInstance, WorkforceSnapshot } from '../../lib/external-runtime';
import { EvidenceChains } from './EvidenceChains';
import { IntelligenceExplorers } from './IntelligenceExplorers';
import { openInspector, runtimeEntityId, sessionEntityId } from './inspector';
import { SessionTimeline } from './SessionTimeline';

type Tab = 'workforce' | 'live' | 'timeline' | 'runtimes' | 'agents' | 'skills' | 'explorers' | 'evidence' | 'configuration' | 'graph';

const RUNTIME_COLOR: Record<string, string> = {
  opencode: 'text-(--vestara-amber)',
  'claude-code': 'text-(--vestara-purple)',
  'openai-codex': 'text-(--vestara-green)',
  vestara: 'text-(--vestara-blue)',
};

function toneFor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('connected')) return 'text-(--vestara-green)';
  if (s.includes('failed') || s.includes('unreachable')) return 'text-(--vestara-red)';
  if (s.includes('degraded')) return 'text-(--vestara-amber)';
  return 'text-(--vestara-blue)';
}

export function WorkforcePage() {
  const poll = usePolling(externalRuntimeApi.workforce, 5000);
  const [tab, setTab] = useState<Tab>('workforce');
  const [selected, setSelected] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const data = poll.data;

  const totalAgents = useMemo(() => {
    if (!data) return 0;
    const external = Object.values(data.external).reduce((a, e) => a + (e.agents?.length ?? 0), 0);
    return data.vestara.agents.length + external;
  }, [data]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-(--vestara-text)">Engineering Workforce</h1>
          <p className="text-[10px] text-(--vestara-text-muted) mt-1">
            Every engineering worker, regardless of runtime · Vestara · OpenCode · Claude Code · OpenAI Codex
          </p>
        </div>
        <button
          type="button"
          onClick={() => void poll.refresh()}
          className="flex items-center gap-1 text-[10px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
        >
          <RefreshRoundedIcon fontSize="inherit" /> Refresh
        </button>
      </div>

      <div className="flex gap-1 flex-wrap mb-4 border-b border-(--vestara-accent-border) pb-2">
        {(
          [
            ['workforce', 'Workforce'],
            ['live', 'Live'],
            ['timeline', 'Timeline'],
            ['runtimes', 'Runtimes'],
            ['agents', 'Agents'],
            ['skills', 'Skills'],
            ['explorers', 'Explorers'],
            ['evidence', 'Evidence'],
            ['configuration', 'Configuration'],
            ['graph', 'Graph'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`text-[10px] px-2.5 py-1.5 rounded transition-colors cursor-pointer ${
              tab === id ? 'bg-(--vestara-accent-bg) text-(--vestara-text) border border-(--vestara-accent-border)' : 'text-(--vestara-text-2) hover:text-(--vestara-text)'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'workforce' && <WorkforceDashboard data={data} totalAgents={totalAgents} onSelect={(id) => { setSelected(id); setTab('runtimes'); }} />}
      {tab === 'live' && <LiveSessions data={data} onSelect={(id) => { setSessionId(id); setTab('timeline'); }} />}
      {tab === 'timeline' && <TimelineTab data={data} sessionId={sessionId} onSelect={setSessionId} />}
      {tab === 'runtimes' && <RuntimeExplorer data={data} selected={selected} onSelect={setSelected} />}
      {tab === 'agents' && <AgentExplorer data={data} />}
      {tab === 'skills' && <SkillsExplorer data={data} />}
      {tab === 'explorers' && <IntelligenceExplorers data={data} />}
      {tab === 'evidence' && <EvidenceChains data={data} />}
      {tab === 'configuration' && <ConfigurationBrowser data={data} />}
      {tab === 'graph' && <WorkforceGraph data={data} />}
    </div>
  );
}

// ─── 1. Workforce Dashboard ────────────────────────────────────

function WorkforceDashboard({ data, totalAgents, onSelect }: { data: WorkforceSnapshot | null; totalAgents: number; onSelect: (id: string) => void }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading workforce…</p>;
  const running = data.sessions.filter((s) => s.status === 'running').length;
  const connected = data.runtimes.filter((r) => r.connectionStatus === 'connected' || r.connectionStatus === 'discovered').length;
  const files = data.sessions.reduce((a, s) => a + (s.filesChanged ?? 0), 0);

  const cards: Array<[string, string | number]> = [
    ['Runtimes', data.runtimes.length],
    ['Connected', connected],
    ['Active Sessions', running],
    ['Agents', totalAgents],
    ['Files Modified', files],
    ['Verification', 'mixed'],
  ];

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        {cards.map(([label, value]) => (
          <div key={label} className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
            <div className="text-[9px] uppercase tracking-widest text-(--vestara-text-muted)">{label}</div>
            <div className="text-lg font-bold text-(--vestara-text) mt-1">{value}</div>
          </div>
        ))}
      </div>

      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Engineering Runtimes</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <RuntimeCard runtime={{ id: 'vestara', runtimeType: 'vestara', displayName: 'Vestara Runtime', version: 'core', connectionStatus: 'connected', integrationLevel: 'full-observation', verificationStatus: 'end-to-end-verified', availableCapabilities: [], supportedCapabilities: [] }} accent="text-(--vestara-blue)" subtitle={`${data.vestara.agents.length} agents`} />
        {data.runtimes.map((r) => (
          <div
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect(r.id)}
            onDoubleClick={() => openInspector(runtimeEntityId(r.id, r.runtimeType))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) openInspector(runtimeEntityId(r.id, r.runtimeType));
            }}
            className="text-left cursor-pointer"
            title="Click to inspect · double-click to open Inspector"
          >
            <RuntimeCard runtime={r} accent={RUNTIME_COLOR[r.runtimeType] ?? 'text-(--vestara-text)'} subtitle={`${Object.values(data.external[r.id]?.agents ?? {}).length} agents`} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface RuntimeCardData {
  id: string;
  displayName: string;
  runtimeType: string;
  version?: string;
  connectionStatus: string;
  integrationLevel: string;
  verificationStatus?: string;
  availableCapabilities?: string[];
  supportedCapabilities?: string[];
  lastSeenAt?: string;
  serverUrl?: string;
}

function RuntimeCard({ runtime, accent, subtitle }: { runtime: RuntimeCardData; accent: string; subtitle?: string }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="flex items-center justify-between">
        <span className={`text-[13px] font-bold ${accent}`}>{runtime.displayName}</span>
        <span className={`text-[9px] uppercase tracking-wider ${toneFor(runtime.connectionStatus)}`}>{runtime.connectionStatus}</span>
      </div>
      <div className="text-[10px] text-(--vestara-text-muted) mt-1">
        {runtime.version ?? 'version unknown'} · {runtime.integrationLevel} · verification {runtime.verificationStatus}
      </div>
      {subtitle && <div className="text-[10px] text-(--vestara-text-muted) mt-0.5">{subtitle}</div>}
      <div className="text-[10px] text-(--vestara-text-muted) mt-0.5">
        {runtime.availableCapabilities?.length ?? 0} active / {runtime.supportedCapabilities?.length ?? 0} supported
      </div>
    </div>
  );
}

// ─── 2. Runtime Explorer ───────────────────────────────────────

function RuntimeExplorer({ data, selected, onSelect }: { data: WorkforceSnapshot | null; selected: string | null; onSelect: (id: string | null) => void }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading runtimes…</p>;
  const runtimes = [
    { id: 'vestara', name: 'Vestara Runtime', type: 'vestara', agents: data.vestara.agents.length, skills: 0 },
    ...data.runtimes.map((r) => ({ id: r.id, name: r.displayName, type: r.runtimeType, agents: Object.values(data.external[r.id]?.agents ?? {}).length, skills: Object.values(data.external[r.id]?.skills ?? {}).length })),
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="space-y-1">
        {runtimes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(selected === r.id ? null : r.id)}
            className={`w-full text-left p-2 bg-(--vestara-accent-bg) border rounded-lg transition-colors cursor-pointer ${
              selected === r.id ? 'border-(--vestara-accent-border-active)' : 'border-(--vestara-accent-border)'
            }`}
          >
            <div className={`text-[12px] font-medium ${RUNTIME_COLOR[r.type] ?? 'text-(--vestara-text)'}`}>{r.name}</div>
            <div className="text-[10px] text-(--vestara-text-muted)">{r.agents} agents · {r.skills} skills</div>
          </button>
        ))}
      </div>
      <div className="md:col-span-2">
        {selected === 'vestara' && (
          <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
            <div className="text-[12px] font-semibold text-(--vestara-text) mb-2">Vestara Runtime</div>
            <DetailRow label="Runtime" value="Vestara core" />
            <DetailRow label="Verification" value="end-to-end-verified" />
            <DetailRow label="Agents" value={String(data.vestara.agents.length)} />
            <DetailRow label="Integration" value="full-observation" />
          </div>
        )}
        {selected && selected !== 'vestara' && <RuntimeDetail data={data} instanceId={selected} />}
        {!selected && <p className="text-[11px] text-(--vestara-text-muted)">Select a runtime to inspect version, health, capabilities, configuration, and verification status.</p>}
      </div>
    </div>
  );
}

function RuntimeDetail({ data, instanceId }: { data: WorkforceSnapshot; instanceId: string }) {
  const runtime = data.runtimes.find((r) => r.id === instanceId);
  if (!runtime) return <p className="text-[11px] text-(--vestara-text-muted)">Runtime not found.</p>;
  const available = new Set(runtime.availableCapabilities ?? []);
  const has = (...capabilities: string[]) => capabilities.some((capability) => available.has(capability));
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className={`text-[12px] font-semibold mb-2 ${RUNTIME_COLOR[runtime.runtimeType] ?? ''}`}>{runtime.displayName}</div>
      <DetailRow label="Version" value={runtime.version ?? '—'} />
      <DetailRow label="Connection" value={runtime.connectionStatus} />
      <DetailRow label="Integration" value={runtime.integrationLevel} />
      <DetailRow label="Verification" value={runtime.verificationStatus} />
      <DetailRow label="Last seen" value={new Date(runtime.lastSeenAt).toLocaleString()} />
      <DetailRow label="Server" value={runtime.serverUrl ?? '—'} />
      <div className="flex items-center gap-1 flex-wrap mt-3">
        {has('session-details', 'configuration-discovery') && (
          <ControlButton onClick={() => openInspector(runtimeEntityId(instanceId, runtime.runtimeType))}>Inspect</ControlButton>
        )}
        {has('configuration-discovery', 'effective-configuration') && (
          <ControlButton onClick={() => void externalRuntimeApi.drift(instanceId)}>Re-check config</ControlButton>
        )}
        {has('session-discovery') && (
          <ControlButton onClick={() => void externalRuntimeApi.discover()}>Re-scan</ControlButton>
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mt-3 mb-1">Available capabilities</div>
      <div className="flex flex-wrap gap-1">
        {(runtime.availableCapabilities ?? []).slice(0, 16).map((c) => (
          <span key={c} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted)">{c}</span>
        ))}
        {(runtime.availableCapabilities ?? []).length === 0 && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-dim)">discovery only</span>
        )}
      </div>
    </div>
  );
}

function ControlButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[9px] px-2 py-1 rounded-md bg-(--vestara-accent-bg) border border-(--vestara-accent-border) text-(--vestara-text-2) hover:text-(--vestara-text) cursor-pointer"
    >
      {children}
    </button>
  );
}

// ─── 3. Unified Agent Explorer ─────────────────────────────────

interface AgentRow {
  id: string;
  runtime: string;
  runtimeType: string;
  name: string;
  mode?: string;
  model?: string;
  description?: string;
  entityId?: string;
}

function AgentExplorer({ data }: { data: WorkforceSnapshot | null }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading agents…</p>;

  const agents: AgentRow[] = data.vestara.agents.map((a) => ({
    id: `vestara-${a.id}`,
    runtime: 'Vestara Runtime',
    runtimeType: 'vestara',
    name: a.name ?? a.id,
    mode: a.role,
    description: a.description,
    entityId: `agent://vestara/${a.id}`,
  }));

  for (const [instanceId, ext] of Object.entries(data.external)) {
    const runtime = data.runtimes.find((r) => r.id === instanceId);
    for (const raw of ext.agents ?? []) {
      const agent = raw as { name?: string; mode?: string; model?: { modelId?: string }; description?: string };
      agents.push({
        id: `external-${instanceId}-${agent.name}`,
        runtime: runtime?.displayName ?? instanceId,
        runtimeType: runtime?.runtimeType ?? 'unknown',
        name: agent.name ?? 'unknown',
        mode: agent.mode,
        model: agent.model?.modelId,
        description: agent.description,
        entityId: `agent://external/${instanceId}/${agent.name}`,
      });
    }
  }

  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">All Agents ({agents.length}) · double-click to inspect</div>
      <div className="overflow-auto">
        <table className="w-full text-[11px] text-(--vestara-text-2) border-collapse">
          <thead>
            <tr className="text-left text-[9px] uppercase tracking-wider text-(--vestara-text-muted)">
              <th className="py-1 pr-2">Runtime</th>
              <th className="py-1 pr-2">Agent</th>
              <th className="py-1 pr-2">Mode / Role</th>
              <th className="py-1 pr-2">Model</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr
                key={a.id}
                onDoubleClick={() => a.entityId && openInspector(a.entityId)}
                className="border-t border-zinc-800 cursor-default"
                title="Double-click to open in Inspector"
              >
                <td className={`py-1.5 pr-2 ${RUNTIME_COLOR[a.runtimeType] ?? ''}`}>{a.runtime}</td>
                <td className="py-1.5 pr-2 font-medium text-(--vestara-text)">{a.name}</td>
                <td className="py-1.5 pr-2">{a.mode ?? '—'}</td>
                <td className="py-1.5 pr-2 font-mono text-[10px]">{a.model ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 4. Skills Explorer ────────────────────────────────────────

function SkillsExplorer({ data }: { data: WorkforceSnapshot | null }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading skills…</p>;
  const rows: Array<{ name: string; runtime: string; runtimeType: string; instanceId: string; description: string; loaded: boolean }> = [];
  for (const [instanceId, ext] of Object.entries(data.external)) {
    const runtime = data.runtimes.find((r) => r.id === instanceId);
    for (const raw of ext.skills ?? []) {
      const skill = raw as { name?: string; description?: string; valid?: boolean };
      rows.push({ name: skill.name ?? 'unknown', runtime: runtime?.displayName ?? instanceId, runtimeType: runtime?.runtimeType ?? 'unknown', instanceId, description: skill.description ?? '', loaded: false });
    }
  }
  if (rows.length === 0) return <p className="text-[11px] text-(--vestara-text-muted)">No skills discovered on any runtime.</p>;
  return (
    <div className="space-y-1">
      {rows.map((s, i) => (
        <div
          key={`${s.runtime}-${i}`}
          onDoubleClick={() => openInspector(`skill://external/${s.instanceId}/${s.name}`)}
          className="p-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg cursor-default"
          title="Double-click to open in Inspector"
        >
          <div className="flex items-center gap-2">
            <span className={`text-[12px] font-medium ${RUNTIME_COLOR[s.runtimeType] ?? ''}`}>{s.name}</span>
            <span className="text-[9px] text-(--vestara-text-muted)">{s.runtime}</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-(--vestara-text-muted)">available</span>
          </div>
          {s.description && <div className="text-[10px] text-(--vestara-text-muted) mt-0.5">{s.description.slice(0, 80)}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── 5. Live Session Center + Timeline ─────────────────────────

function LiveSessions({ data, onSelect }: { data: WorkforceSnapshot | null; onSelect: (id: string) => void }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading sessions…</p>;
  if (data.sessions.length === 0) return <p className="text-[11px] text-(--vestara-text-muted)">No external sessions observed.</p>;
  return (
    <div className="space-y-1">
      {data.sessions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          onDoubleClick={() => openInspector(sessionEntityId(s.externalSessionId))}
          className="w-full text-left p-2.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg hover:border-zinc-600 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`w-2 h-2 rounded-full ${s.status === 'running' ? 'bg-(--vestara-green) animate-pulse' : 'bg-zinc-600'}`} />
            <span className="text-[12px] text-(--vestara-text) font-medium">{s.title || s.externalSessionId}</span>
            <span className={`text-[9px] uppercase tracking-wider ${RUNTIME_COLOR[s.runtimeType] ?? ''}`}>{s.runtimeType}</span>
            <span className="text-[9px] text-(--vestara-text-muted)">· {s.status}</span>
            {s.agentId && <span className="text-[9px] text-(--vestara-text-muted)">· agent {s.agentId}</span>}
            {s.modelId && <span className="text-[9px] font-mono text-(--vestara-text-muted)">· {s.modelId}</span>}
          </div>
          <div className="text-[10px] text-(--vestara-text-muted) mt-1">
            integration {s.integrationLevel} · {s.filesChanged ?? 0} files · {s.toolCount ?? 0} tools · {s.commandCount ?? 0} commands
          </div>
          <div className="text-[9px] text-(--vestara-text-dim) mt-0.5">click to open timeline · double-click to inspect</div>
        </button>
      ))}
    </div>
  );
}

function TimelineTab({ data, sessionId, onSelect }: { data: WorkforceSnapshot | null; sessionId: string | null; onSelect: (id: string | null) => void }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading sessions…</p>;
  const session = data.sessions.find((s) => s.id === sessionId) ?? data.sessions[0] ?? null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <label className="text-[10px] text-(--vestara-text-muted)">Session</label>
        <select
          value={session?.id ?? ''}
          onChange={(event) => onSelect(event.target.value || null)}
          className="text-[11px] px-2 py-1 rounded-md bg-black/30 border border-zinc-700 text-(--vestara-text-2) focus:outline-none focus:border-(--vestara-accent-border-active)"
        >
          {data.sessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title || s.externalSessionId} · {s.runtimeType} · {s.status}</option>
          ))}
        </select>
      </div>
      {session ? (
        <SessionTimeline session={session} />
      ) : (
        <p className="text-[11px] text-(--vestara-text-muted)">No sessions observed. Sessions appear when an external runtime records activity.</p>
      )}
    </div>
  );
}

// ─── 6. Evidence ───────────────────────────────────────────────

// Replaced by EvidenceChains (see EvidenceChains.tsx) — claim ledger with
// reported/observed/correlated/independently-verified/unverified status and an
// operational (non-ranking) runtime comparison table.

// ─── 7. Configuration Browser ─────────────────────────────────

function ConfigurationBrowser({ data }: { data: WorkforceSnapshot | null }) {
  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading configuration…</p>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {data.runtimes.map((r) => (
        <div key={r.id} className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
          <div className={`text-[12px] font-semibold mb-2 ${RUNTIME_COLOR[r.runtimeType] ?? ''}`}>{r.displayName} Configuration</div>
          <DetailRow label="Runtime" value={r.runtimeType} />
          <DetailRow label="Verification" value={r.verificationStatus} />
          <DetailRow label="Available capabilities" value={String(r.availableCapabilities?.length ?? 0)} />
          <DetailRow label="Supported capabilities" value={String(r.supportedCapabilities?.length ?? 0)} />
          <div className="text-[10px] text-(--vestara-text-muted) mt-2">
            Full source/provenance/override-chain browsing is exposed per runtime via the Runtime Explorer.
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 8. Workforce Graph ────────────────────────────────────────

function WorkforceGraph({ data }: { data: WorkforceSnapshot | null }) {
  return (
    <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Workforce Graph</div>
      <div className="text-[11px] text-(--vestara-text-2) leading-relaxed mb-3">
        Workspace → Runtime → Agent → Skill → Plugin → MCP → Tool → Session → Execution → Files → Verification.
      </div>
      <a
        href="/graph"
        className="inline-flex items-center gap-1 text-[10px] px-2 py-1.5 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-md text-(--vestara-text-2) hover:text-(--vestara-text)"
      >
        Open Engineering Graph
      </a>
      <div className="mt-3 text-[10px] text-(--vestara-text-muted)">
        {data ? `${data.runtimes.length} runtimes registered in the graph as runtime:// entities` : 'Loading graph linkage…'}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-zinc-800/60 last:border-0">
      <span className="text-[10px] text-(--vestara-text-muted)">{label}</span>
      <span className="text-[11px] text-(--vestara-text-2) text-right break-all">{value}</span>
    </div>
  );
}
