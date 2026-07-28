import type { IndividualCheckResult, VerificationResult, VerificationStatus } from '../types';

export class ResultAggregator {
  aggregate(requestId: string, jobId: string, results: IndividualCheckResult[], startedAt: string): VerificationResult {
    const now = new Date().toISOString();
    const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    const status = this.determineOverallStatus(results);

    return {
      id: `vr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      requestId,
      jobId,
      status,
      checkResults: results,
      summary: this.buildSummary(status, results),
      startedAt,
      completedAt: now,
      durationMs: totalDuration,
    };
  }

  private determineOverallStatus(results: IndividualCheckResult[]): VerificationStatus {
    if (results.length === 0) return 'skipped';

    const order: VerificationStatus[] = ['failed', 'warning', 'inconclusive', 'passed', 'skipped'];
    let worst: VerificationStatus = 'passed';
    for (const r of results) {
      const rIdx = order.indexOf(r.status);
      const wIdx = order.indexOf(worst);
      if (rIdx < wIdx) worst = r.status;
    }
    return worst;
  }

  private buildSummary(status: VerificationStatus, results: IndividualCheckResult[]): string {
    if (results.length === 0) return 'No verification checks were executed';

    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const warnings = results.filter((r) => r.status === 'warning').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;

    const parts: string[] = [`${results.length} checks`];
    if (passed > 0) parts.push(`${passed} passed`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (warnings > 0) parts.push(`${warnings} warnings`);
    if (skipped > 0) parts.push(`${skipped} skipped`);

    if (status === 'passed') return `All checks passed (${parts.join(', ')})`;
    if (status === 'failed') return `Verification failed (${parts.join(', ')})`;
    return `${status} (${parts.join(', ')})`;
  }
}
