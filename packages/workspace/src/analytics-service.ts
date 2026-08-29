/**
 * AnalyticsService — Tracks workspace health history, verification trends,
 * and prediction accuracy over time.
 *
 * Architecture Traceability:
 *   Product Principle: Measure Capabilities, Not Components
 */

import { migrate } from '@vestara/sqlite-migrations';
import { ANALYTICS_MANIFEST } from './scaffold-migrations';
import type { WorkspaceSession } from './workspace-session';

export interface HealthSnapshot {
  timestamp: string;
  overall: number;
  codeQuality: number;
  testCoverage: number;
  dependencyHealth: number;
  documentation: number;
}

export interface AnalyticsReport {
  healthHistory: HealthSnapshot[];
  healthTrend: 'improving' | 'declining' | 'stable';
  totalSnapshots: number;
  firstRecorded: string | null;
  mostRecent: string | null;
}

export class AnalyticsService {
  private snapshots: HealthSnapshot[] = [];
  private store: any;

  constructor(store: any) {
    this.store = store;
    this.ensureSchema();
    this.load();
  }

  private ensureSchema(): void {
    migrate(this.store, ANALYTICS_MANIFEST);
  }

  private load(): void {
    try {
      const rows = this.store.exec('SELECT * FROM health_snapshots ORDER BY timestamp ASC');
      this.snapshots = (rows?.[0]?.values || []).map((r: any) => ({
        timestamp: r[1],
        overall: r[2],
        codeQuality: r[3],
        testCoverage: r[4],
        dependencyHealth: r[5],
        documentation: r[6],
      }));
    } catch {
      this.snapshots = [];
    }
  }

  recordSnapshot(session: WorkspaceSession): void {
    const health = session.profile.healthScore;
    if (!health) return;

    const snapshot: HealthSnapshot = {
      timestamp: new Date().toISOString(),
      overall: health.overall,
      codeQuality: health.categories.codeQuality,
      testCoverage: health.categories.testCoverage,
      dependencyHealth: health.categories.dependencyHealth,
      documentation: health.categories.documentation,
    };

    this.snapshots.push(snapshot);
    try {
      this.store.run(
        'INSERT INTO health_snapshots (timestamp, overall, code_quality, test_coverage, dependency_health, documentation) VALUES (?, ?, ?, ?, ?, ?)',
        [
          snapshot.timestamp,
          snapshot.overall,
          snapshot.codeQuality,
          snapshot.testCoverage,
          snapshot.dependencyHealth,
          snapshot.documentation,
        ],
      );
    } catch {
      /* best effort */
    }
  }

  getReport(): AnalyticsReport {
    const snaps = this.snapshots;
    const trend =
      snaps.length < 2
        ? 'stable'
        : snaps[snaps.length - 1].overall > snaps[0].overall
          ? 'improving'
          : snaps[snaps.length - 1].overall < snaps[0].overall
            ? 'declining'
            : 'stable';

    return {
      healthHistory: snaps,
      healthTrend: trend,
      totalSnapshots: snaps.length,
      firstRecorded: snaps.length > 0 ? snaps[0].timestamp : null,
      mostRecent: snaps.length > 0 ? snaps[snaps.length - 1].timestamp : null,
    };
  }

  renderReport(report: AnalyticsReport): string {
    const trendIcon = report.healthTrend === 'improving' ? '↑' : report.healthTrend === 'declining' ? '↓' : '→';
    const lines: string[] = [
      'Workspace Analytics',
      `Snapshots: ${report.totalSnapshots}`,
      `Trend: ${trendIcon} ${report.healthTrend}`,
      `First: ${report.firstRecorded ?? 'N/A'}`,
      `Latest: ${report.mostRecent ?? 'N/A'}`,
      '',
      'Health History:',
    ];

    for (const snap of report.healthHistory.slice(-10)) {
      const date = new Date(snap.timestamp).toLocaleDateString();
      lines.push(
        `  ${date}: ${snap.overall.toFixed(1)} (Q:${snap.codeQuality.toFixed(1)} T:${snap.testCoverage.toFixed(1)} D:${snap.dependencyHealth.toFixed(1)} Doc:${snap.documentation.toFixed(1)})`,
      );
    }

    return lines.join('\n');
  }
}
