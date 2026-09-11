/**
 * VESTARA-INTELLIGENCE DIAG-1: Vestara Runtime Diagnostic Snapshot Collectors
 *
 * Wraps existing OS-level collectors (collect.ts) to produce DIAG-0
 * `DiagnosticSnapshot` records. Implements the explicit health vocabulary
 * mapping between `HealthCheck.status` and `DiagnosticSourceHealth`.
 *
 * Ownership:
 * - Collectors read from existing sources (collect.ts, M11A instrumentation)
 * - No new telemetry is created; existing collectors are wrapped, not modified
 * - Snapshot collection is read-only; no persistence, no mutation
 *
 * Health vocabulary mapping:
 * - `pass` → `healthy`
 * - `warn` → `degraded`
 * - `fail` → `unhealthy`
 * - `unknown` → `unknown`
 *
 * Future phases:
 * - DIAG-2 (Bundle): consumes snapshots to create incident bundles
 * - OBS-1 (Observer): subscribes to snapshot output via EventBus
 * - OBS-4 (Health model): tracks snapshot trends over time
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 * @see packages/types/src/diagnostic.ts (DIAG-0 types)
 */

import type {
  DiagnosticSeverity,
  DiagnosticSnapshot,
  DiagnosticSourceHealth,
  DiagnosticSourceKind,
} from '@vestara/types';
import * as collect from './collect';

// ─── Health Vocabulary Mapping ─────────────────────────────────

/**
 * Maps `HealthCheck.status` (pass/warn/fail/unknown) to
 * `DiagnosticSourceHealth` (healthy/degraded/unhealthy/unknown).
 *
 * This is the explicit adapter between the two vocabularies,
 * as required by DIAG-0 (diagnostic.ts lines 17-19).
 */
function _mapHealthStatus(status: 'pass' | 'warn' | 'fail' | 'unknown'): DiagnosticSourceHealth {
  switch (status) {
    case 'pass':
      return 'healthy';
    case 'warn':
      return 'degraded';
    case 'fail':
      return 'unhealthy';
    default:
      return 'unknown';
  }
}

/**
 * Derives `DiagnosticSeverity` from a health state.
 * A failing health check is `error`; a warning is `warning`; pass is `info`.
 */
function deriveSeverity(health: DiagnosticSourceHealth): DiagnosticSeverity {
  switch (health) {
    case 'unhealthy':
      return 'error';
    case 'degraded':
      return 'warning';
    case 'healthy':
      return 'info';
    default:
      return 'info';
  }
}

// ─── Source Builders ────────────────────────────────────────────

function sourceRef(id: string, kind: DiagnosticSourceKind, name: string, component?: string) {
  return { id, kind, name, component } as const;
}

// ─── Snapshot Collectors ───────────────────────────────────────

/**
 * DIAG-1: Collect process health snapshot.
 * Sources: collect.collectProcesses(), process.memoryUsage()
 */
function collectProcessHealth(): DiagnosticSnapshot {
  const mem = process.memoryUsage();
  const proc = collect.collectProcesses(5);
  const usedPercent = mem.heapTotal > 0 ? Math.round((mem.heapUsed / mem.heapTotal) * 100) : 0;

  const health: DiagnosticSourceHealth = usedPercent > 90 ? 'unhealthy' : usedPercent > 80 ? 'degraded' : 'healthy';

  return {
    source: sourceRef('api-server', 'runtime', 'API Server Process'),
    health,
    severity: deriveSeverity(health),
    message: `Process memory: ${usedPercent}% heap used (${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB)`,
    observedAt: new Date().toISOString(),
    payload: {
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssBytes: mem.rss,
      externalBytes: mem.external,
      topProcessCount: proc.processes.length,
      totalProcessCount: proc.total,
    },
  };
}

/**
 * DIAG-1: Collect memory health snapshot.
 * Source: collect.collectMemory()
 */
function collectMemoryHealth(): DiagnosticSnapshot {
  const memory = collect.collectMemory();
  const usedPercent = memory.total > 0 ? Math.round((memory.used / memory.total) * 100) : 0;

  const health: DiagnosticSourceHealth = usedPercent > 90 ? 'unhealthy' : usedPercent > 80 ? 'degraded' : 'healthy';

  return {
    source: sourceRef('system-memory', 'process', 'System Memory'),
    health,
    severity: deriveSeverity(health),
    message: `Memory usage: ${usedPercent}% (${Math.round(memory.used / 1024 / 1024)}MB used)`,
    observedAt: new Date().toISOString(),
    payload: {
      totalBytes: memory.total,
      freeBytes: memory.free,
      availableBytes: memory.available,
      usedBytes: memory.used,
      usedPercent,
      swapUsedBytes: memory.swapUsed,
    },
  };
}

/**
 * DIAG-1: Collect disk health snapshot.
 * Source: collect.collectDisks()
 */
function collectDiskHealth(): DiagnosticSnapshot {
  const disks = collect.collectDisks();
  const primary = disks[0];
  const usedPercent = primary ? primary.capacity : 0;

  const health: DiagnosticSourceHealth = usedPercent > 95 ? 'unhealthy' : usedPercent > 85 ? 'degraded' : 'healthy';

  return {
    source: sourceRef('system-disk', 'process', 'System Disk'),
    health,
    severity: deriveSeverity(health),
    message: primary
      ? `Disk ${primary.mount}: ${usedPercent}% used (${primary.used} / ${primary.size})`
      : 'Disk information unavailable',
    observedAt: new Date().toISOString(),
    payload: {
      mount: primary?.mount ?? 'unknown',
      sizeBytes: primary?.size ?? 0,
      usedBytes: primary?.used ?? 0,
      availableBytes: primary?.available ?? 0,
      usedPercent,
    },
  };
}

/**
 * DIAG-1: Collect network health snapshot.
 * Source: collect.collectNetwork()
 */
function collectNetworkHealth(): DiagnosticSnapshot {
  const result = collect.collectNetwork();
  const interfaces = result.interfaces.filter((n) => !n.internal);

  const health: DiagnosticSourceHealth = interfaces.length > 0 ? 'healthy' : 'degraded';

  return {
    source: sourceRef('system-network', 'network', 'System Network'),
    health,
    severity: deriveSeverity(health),
    message: `${interfaces.length} active network interface(s), gateway: ${result.gateway ?? 'none'}`,
    observedAt: new Date().toISOString(),
    payload: {
      interfaceCount: interfaces.length,
      gateway: result.gateway,
      interfaces: interfaces.map((n) => ({
        name: n.name,
        address: n.address,
        mac: n.mac,
      })),
    },
  };
}

/**
 * DIAG-1: Collect git repository health snapshot.
 * Source: collect.collectGit(repoPath)
 */
function collectGitHealth(repoPath: string): DiagnosticSnapshot {
  const git = collect.collectGit(repoPath);

  const health: DiagnosticSourceHealth = git.available ? 'healthy' : 'unknown';

  return {
    source: sourceRef('git-repository', 'process', 'Git Repository'),
    health,
    severity: deriveSeverity(health),
    message: git.available ? `Branch: ${git.branch ?? 'detached'}, dirty: ${git.dirty}` : 'Git not available',
    observedAt: new Date().toISOString(),
    payload: {
      available: git.available,
      branch: git.branch ?? null,
      dirty: git.dirty,
      ahead: git.ahead,
      behind: git.behind,
      staged: git.staged,
      modified: git.modified,
      untracked: git.untracked,
      conflicts: git.conflicts,
    },
  };
}

/**
 * DIAG-1: Collect Docker health snapshot.
 * Source: collect.collectDocker()
 */
function collectDockerHealth(): DiagnosticSnapshot {
  const docker = collect.collectDocker();
  const exitedWithError = docker.containers.filter(
    (c) => c.state === 'exited' && c.status.toLowerCase().includes('error'),
  );

  const health: DiagnosticSourceHealth = !docker.available
    ? 'unknown'
    : exitedWithError.length > 0
      ? 'degraded'
      : 'healthy';

  return {
    source: sourceRef('docker-runtime', 'service', 'Docker Runtime'),
    health,
    severity: deriveSeverity(health),
    message: docker.available
      ? `${docker.containers.length} container(s), ${exitedWithError.length} exited with error`
      : 'Docker not available',
    observedAt: new Date().toISOString(),
    payload: {
      available: docker.available,
      containerCount: docker.containers.length,
      runningCount: docker.containers.filter((c) => c.status === 'running').length,
      exitedWithErrorCount: exitedWithError.length,
      imageCount: docker.imageCount,
    },
  };
}

/**
 * DIAG-1: Collect tool versions health snapshot.
 * Source: collect.collectVersions()
 */
function collectToolVersionsHealth(): DiagnosticSnapshot {
  const versions = collect.collectVersions();
  const missing = Object.entries(versions).filter(([, v]) => !v);

  const health: DiagnosticSourceHealth = missing.length > 3 ? 'degraded' : 'healthy';

  return {
    source: sourceRef('toolchain', 'runtime', 'Toolchain Versions'),
    health,
    severity: deriveSeverity(health),
    message: `${Object.keys(versions).length - missing.length}/${Object.keys(versions).length} tools available`,
    observedAt: new Date().toISOString(),
    payload: {
      ...versions,
      missingTools: missing.map(([k]) => k),
    },
  };
}

/**
 * DIAG-1: Collect health check summary snapshot.
 * Source: collect.collectHealth()
 *
 * This wraps the existing health check system and maps its vocabulary
 * to the DIAG-0 DiagnosticSourceHealth vocabulary.
 */
function collectHealthSummary(input: collect.HealthInput): DiagnosticSnapshot {
  const checks = collect.collectHealth(input);
  const score = collect.readinessScore(checks);
  const failing = checks.filter((c) => c.status === 'fail');
  const warnings = checks.filter((c) => c.status === 'warn');

  const health: DiagnosticSourceHealth =
    failing.length > 0 ? 'unhealthy' : warnings.length > 0 ? 'degraded' : 'healthy';

  return {
    source: sourceRef('health-checks', 'runtime', 'System Health Checks'),
    health,
    severity: deriveSeverity(health),
    message: `Readiness score: ${score}/100 (${failing.length} failing, ${warnings.length} warnings)`,
    observedAt: new Date().toISOString(),
    payload: {
      score,
      totalChecks: checks.length,
      passing: checks.filter((c) => c.status === 'pass').length,
      warnings: warnings.length,
      failures: failing.length,
      checks: checks.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        detail: c.detail,
      })),
    },
  };
}

// ─── Public API ─────────────────────────────────────────────────

export interface DiagnosticSnapshotCollection {
  /** All collected snapshots */
  snapshots: DiagnosticSnapshot[];
  /** ISO-8601 timestamp of collection start */
  collectedAt: string;
  /** Total collection duration in milliseconds */
  durationMs: number;
}

/**
 * DIAG-1: Collect all Vestara runtime diagnostic snapshots.
 *
 * Wraps existing collectors to produce DIAG-0 DiagnosticSnapshot records.
 * All collectors degrade gracefully — errors produce snapshots with
 * `health: 'unknown'` rather than throwing.
 *
 * @param repoPath - Repository root path for git diagnostics
 * @param healthInput - Pre-collected data for health checks (optional)
 */
export function collectDiagnosticSnapshots(
  repoPath: string,
  healthInput?: collect.HealthInput,
): DiagnosticSnapshotCollection {
  const start = Date.now();
  const collectedAt = new Date().toISOString();

  const snapshots: DiagnosticSnapshot[] = [];

  // Collect all snapshots, catching errors to ensure partial collection
  const collectors: Array<() => DiagnosticSnapshot> = [
    () => collectProcessHealth(),
    () => collectMemoryHealth(),
    () => collectDiskHealth(),
    () => collectNetworkHealth(),
    () => collectGitHealth(repoPath),
    () => collectDockerHealth(),
    () => collectToolVersionsHealth(),
  ];

  // Add health summary if input is provided
  if (healthInput) {
    collectors.push(() => collectHealthSummary(healthInput));
  }

  for (const collector of collectors) {
    try {
      snapshots.push(collector());
    } catch (err) {
      // Graceful degradation: produce an unknown-health snapshot
      snapshots.push({
        source: sourceRef('unknown', 'runtime', 'Unknown Source'),
        health: 'unknown',
        severity: 'info',
        message: `Collection failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        observedAt: collectedAt,
      });
    }
  }

  return {
    snapshots,
    collectedAt,
    durationMs: Date.now() - start,
  };
}
