/**
 * VOS-STARTUP-001 P2: Startup Readiness Hook
 *
 * Polls live systemd/API truth and maps it onto the six checklist rows —
 * no timer-faked progress. Fixture labels/headlines are reused; row states
 * always come from endpoint probes.
 *
 * Mapping (verified against apps/api/src + os/systemd):
 * - Core system      ← GET /api/health/live (+ /api/host, /api/boot deep
 *                      signals when a session exists; their absence never
 *                      fails the row — only a thrown request does)
 * - Agent services   ← GET /api/agents (session required; no session stays
 *                      pending rather than failed)
 * - Workspace env.   ← GET /api/health + GET /api/health/ready (public)
 * - User profile     ← GET /api/auth/me (no/invalid session stays pending —
 *                      the P3 login handoff owns that transition, not a failure)
 * - Desktop          ← /api/health/ready ready === true (the
 *                      vestara-workspace.service readiness gate projection)
 * - Almost ready     ← complete only when every other row is complete
 */

import { useEffect, useState } from 'react';
import { resolveHttpUrl } from '../../../lib/clientConfig';
import {
  startupCelebrationFixture,
  startupDegradedFixture,
  startupFixture,
  startupReadyFixture,
} from '../startup.fixtures';
import type { ChecklistStatus, StartupEntry, StartupViewModel } from '../startup.types';

const POLL_INTERVAL_MS = 2500;

/** Mirrors lib/auth TOKEN_KEY — session presence only, never the secret itself. */
const TOKEN_KEY = 'vestara-auth-token';

interface ProbeResult {
  readonly ok: boolean;
  readonly status: number | null;
  readonly json: Record<string, unknown> | null;
  readonly threw: boolean;
}

interface AbsentResult extends ProbeResult {
  readonly absent: true;
}

type Signal = ProbeResult | AbsentResult;

function isAbsent(signal: Signal): signal is AbsentResult {
  return 'absent' in signal && signal.absent;
}

const ABSENT: AbsentResult = { ok: false, status: null, json: null, threw: false, absent: true };

async function probe(path: string): Promise<ProbeResult> {
  try {
    const res = await fetch(resolveHttpUrl(path), { headers: { 'Content-Type': 'application/json' } });
    let json: Record<string, unknown> | null = null;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, threw: false };
  } catch {
    return { ok: false, status: null, json: null, threw: true };
  }
}

/**
 * Structured diagnostics code: failing check + endpoint + cause, so the
 * code alone identifies what broke (per VOS-LIVE-001I diagnostics-code
 * practice). Cause is `network-error` on throw, else the HTTP status.
 */
function diagnosticsCode(check: string, path: string, signal: ProbeResult): string {
  const cause = signal.threw ? 'network-error' : `http-${signal.status ?? 'unknown'}`;
  return `VOS-STARTUP-${check} (GET ${path} → ${cause})`;
}

function readEntry(): StartupEntry {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('entry') === 'onboarding' ? 'onboarding' : 'login';
  } catch {
    return 'login';
  }
}

function readToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export interface UseStartupReturn {
  readonly data: StartupViewModel;
  readonly isLoading: boolean;
}

export function useStartup(): UseStartupReturn {
  const [data, setData] = useState<StartupViewModel>(startupFixture);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const entry = readEntry();
      const hasSession = readToken().length > 0;

      const [live, health, ready, me, agents, host, boot] = await Promise.all([
        probe('/api/health/live'),
        probe('/api/health'),
        probe('/api/health/ready'),
        hasSession ? probe('/api/auth/me') : Promise.resolve<Signal>(ABSENT),
        hasSession ? probe('/api/agents') : Promise.resolve<Signal>(ABSENT),
        hasSession ? probe('/api/host') : Promise.resolve<Signal>(ABSENT),
        hasSession ? probe('/api/boot') : Promise.resolve<Signal>(ABSENT),
      ]);
      if (cancelled) return;

      const readyJson = ready.json;
      const readyFlag = readyJson !== null && readyJson['ready'] === true;

      const core: ChecklistStatus = !live.ok
        ? 'failed'
        : host.threw || boot.threw
          ? 'failed'
          : 'complete';
      // 401/403/404 with a session means the session or route is unavailable —
      // still starting or logged out, so pending. 5xx or a thrown request
      // means the service itself is down, so failed.
      const agentsFailed =
        !isAbsent(agents) && (agents.threw || (agents.status !== null && agents.status >= 500));
      const agentRow: ChecklistStatus = isAbsent(agents)
        ? 'pending'
        : agentsFailed
          ? 'failed'
          : agents.ok
            ? 'complete'
            : 'pending';
      const workspace: ChecklistStatus = health.ok || ready.ok || readyFlag ? 'complete' : 'pending';
      const profile: ChecklistStatus = isAbsent(me) || !me.ok ? 'pending' : 'complete';
      const desktop: ChecklistStatus = readyFlag ? 'complete' : 'pending';

      const labels = startupFixture.checklist.map((row) => row.label);
      const rows = [
        { id: 'core', label: labels[0] ?? 'Core system', status: core },
        { id: 'agents', label: labels[1] ?? 'Agent services', status: agentRow },
        { id: 'workspace', label: labels[2] ?? 'Workspace environment', status: workspace },
        { id: 'profile', label: labels[3] ?? 'Loading user profile...', status: profile },
        { id: 'desktop', label: labels[4] ?? 'Preparing desktop...', status: desktop },
        {
          id: 'almost',
          label: labels[5] ?? 'Almost ready...',
          status:
            core === 'complete' &&
            agentRow === 'complete' &&
            workspace === 'complete' &&
            profile === 'complete' &&
            desktop === 'complete'
              ? ('complete' as const)
              : ('pending' as const),
        },
      ] as const;

      const failed = rows.some((row) => row.status === 'failed');
      const allComplete = rows.every((row) => row.status === 'complete');

      if (failed) {
        // Priority: API liveness first, then host/boot deep signals, then
        // agent services. Recovery is OS-first (systemd units installed by
        // the image builder); the dev fallback applies only outside the image.
        const hostSignal = host.threw ? host : boot.threw ? boot : null;
        const hostPath = host.threw ? '/api/host' : '/api/boot';
        const code = !live.ok
          ? diagnosticsCode('API-UNREACHABLE', '/api/health/live', live)
          : hostSignal !== null
            ? diagnosticsCode('HOST-DEGRADED', hostPath, hostSignal)
            : diagnosticsCode('AGENTS-UNREACHABLE', '/api/agents', agents);
        const recoveryAction = !live.ok
          ? 'Check vestara-api.service (systemctl status, journalctl -u); outside the image run pnpm dev:api. Then reload.'
          : hostSignal !== null
            ? 'Check vestara-host.service and vestara-api.service (systemctl status, journalctl -u); use the GRUB recovery entry if the system will not start. Then reload.'
            : 'Check agent services (systemctl status vestara-api.service, journalctl -u); then reload this screen.';
        setData({ ...startupDegradedFixture, entry, checklist: [...rows], diagnosticsCode: code, recoveryAction });
      } else if (allComplete) {
        setData(
          entry === 'onboarding'
            ? { ...startupCelebrationFixture, entry, checklist: [...rows] }
            : { ...startupReadyFixture, entry, checklist: [...rows] },
        );
      } else {
        setData({ ...startupFixture, entry, checklist: [...rows] });
      }
      setIsLoading(false);
    }

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { data, isLoading };
}
