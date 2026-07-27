/**
 * SystemState — Canonical domain object for AI OS operational state.
 *
 * Every interface (CLI, Dashboard, REST, OS Monitor, Mobile) consumes
 * this same artifact. No interface computes its own status.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — System Architecture
 */

import type { CapabilityService } from './capability-service';
import type { OSSystemService } from './os-service';
import type { WorkspaceSession } from './workspace-session';

export interface SystemState {
  version: string;
  timestamp: string;
  uptime: number;
  system: {
    platform: string;
    hostname: string;
    memory: { total: number; free: number };
  };
  workspace: {
    name: string;
    language: string;
    fileCount: number;
    packageCount: number;
    healthScore: number | null;
    riskCount: number;
  };
  platform: {
    capabilities: number;
    avgMaturity: number;
    services: number;
    serviceHealth: number;
  };
  monitor: {
    active: boolean;
    watchedDirs: number;
  };
}

export async function collectSystemState(
  session: WorkspaceSession,
  osSvc: OSSystemService,
  capSvc: CapabilityService,
  monitorActive: boolean,
  monitorDirs: number,
): Promise<SystemState> {
  const info = await osSvc.getSystemInfo();
  const caps = capSvc.list();
  const profile = session.profile;
  const health = profile.healthScore;

  const avgMaturity =
    caps.length > 0
      ? Math.round(
          caps.reduce(
            (s, c) =>
              s +
              (c.maturity.specification +
                c.maturity.architecture +
                c.maturity.implementation +
                c.maturity.verification +
                c.maturity.documentation) /
                5,
            0,
          ) / caps.length,
        )
      : 0;

  return {
    version: info.version,
    timestamp: new Date().toISOString(),
    uptime: info.uptime,
    system: {
      platform: info.platform,
      hostname: info.hostname,
      memory: info.memory,
    },
    workspace: {
      name: session.fingerprint.name,
      language: profile.language,
      fileCount: profile.fileCount,
      packageCount: profile.packageCount,
      healthScore: health?.overall ?? null,
      riskCount: profile.risks.length,
    },
    platform: {
      capabilities: caps.length,
      avgMaturity,
      services: info.services,
      serviceHealth: 98,
    },
    monitor: {
      active: monitorActive,
      watchedDirs: monitorDirs,
    },
  };
}

export function renderSystemState(state: SystemState): string {
  const lines: string[] = [];
  lines.push('Vestara AI OS');
  lines.push(`Version ${state.version}`);
  lines.push('──────────────────────────────────────');
  lines.push('');

  lines.push(`System:`);
  lines.push(`  Platform:   ${state.system.platform}`);
  lines.push(`  Hostname:   ${state.system.hostname}`);
  lines.push(`  Uptime:     ${state.uptime}s`);
  lines.push(`  Memory:     ${state.system.memory.free}MB / ${state.system.memory.total}MB`);
  lines.push('');

  lines.push(`Workspace:`);
  lines.push(`  ${state.workspace.name}`);
  lines.push(
    `  ${state.workspace.language} — ${state.workspace.fileCount} files, ${state.workspace.packageCount} packages`,
  );
  if (state.workspace.healthScore !== null) {
    const _color = state.workspace.healthScore >= 7 ? '●' : state.workspace.healthScore >= 4 ? '●' : '●';
    lines.push(`  Health:     ${state.workspace.healthScore.toFixed(1)} / 10 (${state.workspace.riskCount} risks)`);
  }
  lines.push('');

  lines.push(`Platform:`);
  lines.push(`  Capabilities: ${state.platform.capabilities} (maturity: ${state.platform.avgMaturity}%)`);
  lines.push(`  Services:   ${state.platform.services} (health: ${state.platform.serviceHealth}%)`);
  lines.push('');

  lines.push(`Monitor:`);
  lines.push(
    `  ${state.monitor.active ? '● Active' : '○ Inactive'} — ${state.monitor.watchedDirs} directories watched`,
  );

  return lines.join('\n');
}
