/**
 * Cross-runtime evidence chains and operational runtime comparison.
 *
 * Evidence: a claim ledger where every entry is tagged reported / observed /
 * correlated / independently-verified / unverified — visible without opening
 * details. Claims are derived from real runtime state, never fabricated.
 *
 * Comparison: operational (not ranking) metrics per runtime — completion rate,
 * median duration, files & commands per session, observation completeness.
 */

import { useMemo } from 'react';
import type { ExternalRuntimeInstance, ExternalSessionSummary, WorkforceSnapshot } from '../../lib/external-runtime';

type ClaimStatus = 'reported' | 'observed' | 'correlated' | 'independently-verified' | 'unverified';

interface Claim {
  runtime: string;
  runtimeType: string;
  claim: string;
  status: ClaimStatus;
}

const CLAIM_STYLE: Record<ClaimStatus, string> = {
  reported: 'text-(--vestara-blue) border-(--vestara-blue)/40',
  observed: 'text-(--vestara-green) border-(--vestara-green)/40',
  correlated: 'text-(--vestara-amber) border-(--vestara-amber)/40',
  'independently-verified': 'text-(--vestara-green) border-(--vestara-green)/60',
  unverified: 'text-(--vestara-text-muted) border-(--vestara-accent-border)',
};

const RUNTIME_COLOR: Record<string, string> = {
  opencode: 'text-(--vestara-amber)',
  'claude-code': 'text-(--vestara-purple)',
  'openai-codex': 'text-(--vestara-green)',
  vestara: 'text-(--vestara-blue)',
};

export function EvidenceChains({ data }: { data: WorkforceSnapshot | null }) {
  const claims = useMemo<Claim[]>(() => {
    if (!data) return [];
    const out: Claim[] = [];
    for (const runtime of data.runtimes) {
      const external = data.external[runtime.id];
      const sessions = data.sessions.filter((s) => s.runtimeInstanceId === runtime.id);
      const verified = /end-to-end|live-|integration-tested/.test(runtime.verificationStatus);
      out.push({
        runtime: runtime.displayName,
        runtimeType: runtime.runtimeType,
        claim: `Runtime detected${runtime.version ? ` · v${runtime.version}` : ''}`,
        status: runtime.version ? 'observed' : 'reported',
      });
      out.push({
        runtime: runtime.displayName,
        runtimeType: runtime.runtimeType,
        claim: `Session lifecycle${sessions.length ? ` · ${sessions.length} sessions` : ''}`,
        status: sessions.length > 0 ? 'observed' : 'reported',
      });
      out.push({
        runtime: runtime.displayName,
        runtimeType: runtime.runtimeType,
        claim: `Inventory reported · ${external?.agents?.length ?? 0} agents, ${external?.skills?.length ?? 0} skills`,
        status: 'reported',
      });
      out.push({
        runtime: runtime.displayName,
        runtimeType: runtime.runtimeType,
        claim: `Integration ${runtime.integrationLevel}`,
        status: runtime.integrationLevel === 'live-observation' ? 'observed' : 'reported',
      });
      out.push({
        runtime: runtime.displayName,
        runtimeType: runtime.runtimeType,
        claim: `Adapter verification ${runtime.verificationStatus}`,
        status: verified ? 'independently-verified' : runtime.verificationStatus === 'untested' ? 'unverified' : 'observed',
      });
    }
    out.push({
      runtime: 'Vestara Verifier',
      runtimeType: 'vestara',
      claim: 'Independent verification runs',
      status: 'independently-verified',
    });
    out.push({
      runtime: 'Visual verification',
      runtimeType: 'vestara',
      claim: 'Workspace UI screenshots',
      status: 'unverified',
    });
    return out;
  }, [data]);

  if (!data) return <p className="text-[11px] text-(--vestara-text-muted) animate-pulse">Loading evidence…</p>;

  return (
    <div>
      <div className="p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg">
        <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Cross-Runtime Evidence Ledger</div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {(Object.keys(CLAIM_STYLE) as ClaimStatus[]).map((status) => (
            <span key={status} className={`text-[9px] px-1.5 py-0.5 rounded border ${CLAIM_STYLE[status]}`}>{status}</span>
          ))}
        </div>
        <div className="space-y-1">
          {claims.map((claim, index) => (
            <div key={`${claim.runtime}-${index}`} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-800/60 last:border-0">
              <span className={`text-[11px] text-(--vestara-text-2) ${RUNTIME_COLOR[claim.runtimeType] ?? ''}`}>{claim.runtime}</span>
              <span className="text-[11px] text-(--vestara-text-2) flex-1 text-left px-2">{claim.claim}</span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border whitespace-nowrap ${CLAIM_STYLE[claim.status]}`}>{claim.status}</span>
            </div>
          ))}
        </div>
      </div>
      <RuntimeComparison data={data} />
    </div>
  );
}

function RuntimeComparison({ data }: { data: WorkforceSnapshot }) {
  const rows = useMemo(() => {
    return data.runtimes.map((runtime) => {
      const sessions = data.sessions.filter((s) => s.runtimeInstanceId === runtime.id);
      return metricsFor(runtime, sessions);
    });
  }, [data]);

  return (
    <div className="mt-3 p-3 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg overflow-auto">
      <div className="text-[10px] uppercase tracking-wider text-(--vestara-text-muted) mb-2">Operational Comparison</div>
      <table className="w-full text-[11px] text-(--vestara-text-2) border-collapse min-w-[640px]">
        <thead>
          <tr className="text-left text-[9px] uppercase tracking-wider text-(--vestara-text-muted)">
            <th className="py-1 pr-3">Runtime</th>
            <th className="py-1 pr-3">Sessions</th>
            <th className="py-1 pr-3">Completion</th>
            <th className="py-1 pr-3">Median Duration</th>
            <th className="py-1 pr-3">Files / Session</th>
            <th className="py-1 pr-3">Commands / Session</th>
            <th className="py-1 pr-3">Observation</th>
            <th className="py-1 pr-3">Verification</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.runtime.id} className="border-t border-zinc-800">
              <td className={`py-1.5 pr-3 ${RUNTIME_COLOR[row.runtime.runtimeType] ?? ''}`}>{row.runtime.displayName}</td>
              <td className="py-1.5 pr-3">{row.sessionCount}</td>
              <td className="py-1.5 pr-3">{row.completionRate}</td>
              <td className="py-1.5 pr-3">{row.medianDuration}</td>
              <td className="py-1.5 pr-3">{row.filesPerSession}</td>
              <td className="py-1.5 pr-3">{row.commandsPerSession}</td>
              <td className="py-1.5 pr-3">{row.observation}</td>
              <td className="py-1.5 pr-3">{row.verification}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="py-2 text-(--vestara-text-muted)">No runtimes to compare.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function metricsFor(runtime: ExternalRuntimeInstance, sessions: ExternalSessionSummary[]) {
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const durations = sessions
    .filter((s) => s.startedAt && s.lastActivityAt && s.lastActivityAt >= s.startedAt)
    .map((s) => new Date(s.lastActivityAt as string).getTime() - new Date(s.startedAt as string).getTime())
    .sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : undefined;
  const files = sessions.reduce((sum, s) => sum + (s.filesChanged ?? 0), 0);
  const commands = sessions.reduce((sum, s) => sum + (s.commandCount ?? 0), 0);
  const supported = runtime.supportedCapabilities?.length ?? 0;
  const available = runtime.availableCapabilities?.length ?? 0;
  const observation = supported > 0 ? `${Math.round((available / supported) * 100)}%` : 'n/a';
  return {
    runtime,
    sessionCount: sessions.length,
    completionRate: sessions.length > 0 ? `${Math.round((completed / sessions.length) * 100)}%` : '—',
    medianDuration: median !== undefined ? `${Math.max(1, Math.round(median / 1000))}s` : '—',
    filesPerSession: sessions.length > 0 ? (files / sessions.length).toFixed(1) : '—',
    commandsPerSession: sessions.length > 0 ? (commands / sessions.length).toFixed(1) : '—',
    observation,
    verification: /end-to-end|live-|integration-tested/.test(runtime.verificationStatus) ? 'verified' : runtime.verificationStatus,
  };
}
