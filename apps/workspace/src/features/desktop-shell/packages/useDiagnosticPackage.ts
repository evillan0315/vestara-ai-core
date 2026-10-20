/**
 * VES-UI-001 T6: Diagnostic Package Data Hook
 *
 * Deterministic telemetry (plan G7): bars derive from a seeded PRNG
 * (`seededTelemetryBars`) — never a nondeterministic RNG — so renders are
 * across runs and visual regression stays green. Live values come from
 * `GET /api/diagnostics/summary` + `/health` with `diagnosticPackageFixture`
 * as the offline fallback.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 deterministic telemetry)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useCallback, useEffect, useState } from 'react';
import { diagnosticsApi } from '../../../lib/diagnostics';
import {
  DIAGNOSTIC_PACKAGE_BAR_COUNT,
  DIAGNOSTIC_PACKAGE_SEED,
  diagnosticPackageFixture,
  type DiagnosticPackageSummary,
} from './packages.fixtures';

/** Seeded PRNG (mulberry32) — deterministic per seed, no ambient randomness. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic telemetry bar heights (percent, 8–98). Same seed and count
 * always produce the same series — safe for visual regression.
 */
export function seededTelemetryBars(seed: number, count: number): readonly number[] {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => {
    const wave = (Math.sin(i / 4) * 0.5 + 0.5) * 30;
    const height = 20 + wave + rand() * 40;
    return Math.round(Math.min(98, Math.max(8, height)));
  });
}

export interface UseDiagnosticPackageReturn {
  readonly summary: DiagnosticPackageSummary;
  readonly bars: readonly number[];
  readonly seed: number;
  readonly isLoading: boolean;
  readonly isLive: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
}

export function useDiagnosticPackage(): UseDiagnosticPackageReturn {
  const [summary, setSummary] = useState<DiagnosticPackageSummary>(diagnosticPackageFixture.summary);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [summaryRes, healthRes] = await Promise.all([diagnosticsApi.summary(), diagnosticsApi.health()]);
      if (!summaryRes) throw new Error('Diagnostics summary unavailable');
      const cpuUsage = Math.round(summaryRes.cpu.usage);
      const totalGB = summaryRes.memory.total / 1024 ** 3;
      const usedGB = summaryRes.memory.used / 1024 ** 3;
      setSummary({
        cpuUsage: Number.isFinite(cpuUsage) ? cpuUsage : diagnosticPackageFixture.summary.cpuUsage,
        memoryUsedGB: Number.isFinite(usedGB) ? Math.round(usedGB * 10) / 10 : diagnosticPackageFixture.summary.memoryUsedGB,
        memoryTotalGB: Number.isFinite(totalGB) && totalGB > 0 ? Math.round(totalGB * 10) / 10 : diagnosticPackageFixture.summary.memoryTotalGB,
        readiness: typeof healthRes?.readiness === 'number' ? Math.round(healthRes.readiness) : summaryRes.readiness,
        checks: (healthRes?.checks ?? summaryRes.health).slice(0, 3).map((check) => ({
          id: check.id,
          name: check.name,
          status: check.status,
        })),
      });
      setIsLive(true);
      setError(null);
    } catch (err) {
      setSummary(diagnosticPackageFixture.summary);
      setIsLive(false);
      setError(err instanceof Error ? err.message : 'Diagnostics unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    summary,
    bars: seededTelemetryBars(DIAGNOSTIC_PACKAGE_SEED, DIAGNOSTIC_PACKAGE_BAR_COUNT),
    seed: DIAGNOSTIC_PACKAGE_SEED,
    isLoading,
    isLive,
    error,
    refetch: fetchData,
  };
}
