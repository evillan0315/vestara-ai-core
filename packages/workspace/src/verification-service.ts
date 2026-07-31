/**
 * VerificationService — Transforms a Change Set into a VerificationReport.
 *
 * Runs deterministic checks against the filesystem and build tools.
 * The AI never decides pass/fail — verification is evidence-based.
 *
 * Architecture Traceability:
 *   PCS: PCS-005 — Verification
 *   Product Principle: Evolve Intelligence Before Autonomy
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AccuracyStorage } from './accuracy-storage';
import type { ChangeSetStorage } from './change-set-storage';
import type { PlanStorage } from './plan-storage';
import type { PluginRuntime } from './plugin-runtime';
import type { CheckTrend, TrendReport, VerificationCheck, VerificationReport } from './types';
import type { VerificationStorage } from './verification-storage';
import type { WorkspaceSession } from './workspace-session';

/** Callback invoked during verification lifecycle for telemetry. */
export interface TelemetryCheckResult {
  name: string;
  status: string;
  durationMs: number;
}

export type TelemetryCallback = (event: {
  phase: 'started' | 'check.started' | 'check.completed' | 'completed';
  checkId?: string;
  checkName?: string;
  status?: string;
  progress: number;
  duration?: number;
  detail: string;
  checks?: TelemetryCheckResult[];
}) => void;

export interface VerifyResult {
  report: VerificationReport;
  duration: number;
}

export class VerificationService {
  private csStorage: ChangeSetStorage;
  private vrStorage: VerificationStorage;
  private planStorage?: PlanStorage;
  private accuracyStorage?: AccuracyStorage;
  private pluginRuntime?: PluginRuntime;
  private onTelemetry?: TelemetryCallback;

  constructor(opts: {
    csStorage: ChangeSetStorage;
    vrStorage: VerificationStorage;
    planStorage?: PlanStorage;
    accuracyStorage?: AccuracyStorage;
    pluginRuntime?: PluginRuntime;
    onTelemetry?: TelemetryCallback;
  }) {
    this.csStorage = opts.csStorage;
    this.vrStorage = opts.vrStorage;
    this.planStorage = opts.planStorage;
    this.accuracyStorage = opts.accuracyStorage;
    this.pluginRuntime = opts.pluginRuntime;
    this.onTelemetry = opts.onTelemetry;
  }

  /**
   * Verify a Change Set — run all checks and produce a VerificationReport.
   */
  async verify(changeSetId: string, session: WorkspaceSession): Promise<VerifyResult> {
    const startTime = performance.now();

    // Load the Change Set
    const cs = await this.csStorage.get(changeSetId);
    if (!cs) throw new Error(`Change Set "${changeSetId}" not found.`);

    const planId = cs.planId;
    const rootDir = session.rootPath;

    // Create the report
    const report = await this.vrStorage.create(changeSetId, planId, session.fingerprint.id);

    // Run checks
    const checks: VerificationCheck[] = [];
    const summary = { total: 0, passed: 0, failed: 0, skipped: 0 };

    this.onTelemetry?.({ phase: 'started', progress: 0, detail: `Verifying Change Set ${changeSetId}` });

    const checkFns: Array<() => Promise<VerificationCheck>> = [
      () => this.checkFilesystemIntegrity(cs.id, rootDir, cs.files),
      () => this.checkChangeSetConsistency(cs.id, rootDir, cs.files),
      () => this.checkTypeScript(rootDir),
      () => this.checkTests(rootDir),
      () => this.checkBuild(rootDir),
    ];
    const checkLabels = ['filesystem', 'consistency', 'typecheck', 'tests', 'build'];
    const totalChecks = checkFns.length;

    for (let i = 0; i < checkFns.length; i++) {
      const checkLabel = checkLabels[i];
      const progress = Math.round((i / totalChecks) * 100);

      this.onTelemetry?.({
        phase: 'check.started',
        checkId: checkLabel,
        checkName: checkLabel,
        progress,
        detail: `Running ${checkLabel} check...`,
      });

      const check = await checkFns[i]();
      checks.push(check);
      summary.total++;
      if (check.status === 'passed') summary.passed++;
      else if (check.status === 'failed') summary.failed++;
      else if (check.status === 'skipped') summary.skipped++;

      this.onTelemetry?.({
        phase: 'check.completed',
        checkId: checkLabel,
        checkName: checkLabel,
        status: check.status,
        progress: Math.round(((i + 1) / totalChecks) * 100),
        duration: check.durationMs,
        detail: `${checkLabel}: ${check.status}`,
      });
    }

    // Finalize report
    report.checks = checks;
    report.summary = summary;
    report.status = summary.failed > 0 ? 'failed' : 'passed';
    report.completedAt = new Date().toISOString();
    await this.vrStorage.save(report);

    this.onTelemetry?.({
      phase: 'completed',
      progress: 100,
      duration: Math.round(performance.now() - startTime),
      detail: `Verification ${report.status}: ${summary.passed}/${summary.total} passed`,
      checks: checks.map((c) => ({
        name: c.type,
        status: c.status,
        durationMs: c.durationMs,
      })),
    });

    // Fire after-verify plugin hooks
    if (this.pluginRuntime) {
      try {
        this.pluginRuntime.executeHook('after-verify', null as any).catch(() => {});
      } catch {
        /* best effort */
      }
    }

    // Record prediction accuracy if assessment data is available
    if (this.accuracyStorage) {
      try {
        const cs = await this.csStorage.get(changeSetId);
        if (cs?.assessmentId) {
          const { ImpactStorage } = await import('./impact-storage.js');
          const impactDb = (this as any).impactDb || (this.csStorage as any).db;
          const impactStorage = new ImpactStorage(impactDb);
          const assessment = await impactStorage.get(cs.assessmentId);
          if (assessment?.health) {
            const now = session?.profile?.healthScore;
            const actualDelta = now ? now.overall - assessment.health.current : 0;
            const predicted = assessment.health.delta;
            await this.accuracyStorage.save({
              id: `pa-${Date.now()}`,
              assessmentId: cs.assessmentId,
              changeSetId: cs.id,
              verificationId: report.id,
              predictedHealthDelta: predicted,
              actualHealthDelta: Math.round(actualDelta * 10) / 10,
              error: Math.round((predicted - actualDelta) * 10) / 10,
              absoluteError: Math.round(Math.abs(predicted - actualDelta) * 10) / 10,
              recordedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        /* best effort */
      }
    }

    return {
      report,
      duration: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Get a verification report by ID.
   */
  async getReport(id: string): Promise<VerificationReport | null> {
    return this.vrStorage.get(id);
  }

  /**
   * Get verification trend analysis for a workspace.
   * Computes pass rates, flaky check detection, and overall trends.
   */
  async getTrends(workspaceId: string): Promise<TrendReport> {
    const reports = await this.vrStorage.listByWorkspace(workspaceId);

    // Aggregate check results by type
    const checkMap = new Map<
      string,
      { total: number; passed: number; failed: number; skipped: number; statuses: string[] }
    >();

    for (const report of reports) {
      for (const check of report.checks) {
        const key = check.type;
        if (!checkMap.has(key)) {
          checkMap.set(key, { total: 0, passed: 0, failed: 0, skipped: 0, statuses: [] });
        }
        const entry = checkMap.get(key)!;
        entry.total++;
        entry.statuses.push(check.status);
        if (check.status === 'passed') entry.passed++;
        else if (check.status === 'failed') entry.failed++;
        else if (check.status === 'skipped') entry.skipped++;
      }
    }

    const checkTrends: CheckTrend[] = [];
    const flakyChecks: string[] = [];

    for (const [type, data] of checkMap.entries()) {
      const passRate = data.total > 0 ? data.passed / data.total : 0;

      // Detect flaky checks: alternates between pass and fail across runs
      let transitions = 0;
      for (let i = 1; i < data.statuses.length; i++) {
        const prev = data.statuses[i - 1];
        const curr = data.statuses[i];
        if ((prev === 'passed' && curr === 'failed') || (prev === 'failed' && curr === 'passed')) {
          transitions++;
        }
      }
      const isFlaky = transitions >= 2 && data.failed > 0 && data.passed > 0;

      checkTrends.push({
        type,
        totalRuns: data.total,
        passed: data.passed,
        failed: data.failed,
        skipped: data.skipped,
        passRate: Math.round(passRate * 100) / 100,
        isFlaky,
      });

      if (isFlaky) flakyChecks.push(type);
    }

    const totalChecks = checkTrends.reduce((s, c) => s + c.totalRuns, 0);
    const totalPassed = checkTrends.reduce((s, c) => s + c.passed, 0);
    const overallPassRate = totalChecks > 0 ? totalPassed / totalChecks : 0;

    return {
      workspaceId,
      totalReports: reports.length,
      checkTrends,
      overallPassRate: Math.round(overallPassRate * 100) / 100,
      flakyChecks,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get prediction accuracy summary.
   */
  async getAccuracySummary(): Promise<{
    count: number;
    avgError: number;
    recent: Array<{ assessmentId: string; predicted: number; actual: number; error: number }>;
  }> {
    if (!this.accuracyStorage) return { count: 0, avgError: 0, recent: [] };
    const records = await this.accuracyStorage.list();
    const avgError =
      records.length > 0
        ? Math.round((records.reduce((s, r) => s + r.absoluteError, 0) / records.length) * 100) / 100
        : 0;
    return {
      count: records.length,
      avgError,
      recent: records.slice(0, 10).map((r) => ({
        assessmentId: r.assessmentId,
        predicted: r.predictedHealthDelta,
        actual: r.actualHealthDelta,
        error: r.error,
      })),
    };
  }

  /**
   * Render prediction accuracy summary for terminal.
   */
  renderAccuracy(summary: {
    count: number;
    avgError: number;
    recent: Array<{ assessmentId: string; predicted: number; actual: number; error: number }>;
  }): string {
    const lines: string[] = [];
    lines.push(`Prediction Accuracy (${summary.count} records)`);
    lines.push(`Average Error: ${summary.avgError.toFixed(2)}`);
    lines.push('');
    if (summary.recent.length > 0) {
      lines.push('Recent:');
      for (const r of summary.recent) {
        lines.push(
          `  ${r.assessmentId}: predicted ${r.predicted > 0 ? '+' : ''}${r.predicted}, actual ${r.actual > 0 ? '+' : ''}${r.actual}, error ${r.error > 0 ? '+' : ''}${r.error}`,
        );
      }
    }
    return lines.join('\n');
  }

  /**
   * Render a trend report for terminal display.
   */
  renderTrends(trends: TrendReport): string {
    const lines: string[] = [];
    lines.push(`Verification Trends (${trends.totalReports} reports)`);
    lines.push(`Overall Pass Rate: ${(trends.overallPassRate * 100).toFixed(0)}%`);
    lines.push('');

    if (trends.checkTrends.length > 0) {
      lines.push('Check Trends:');
      for (const ct of trends.checkTrends) {
        const icon = ct.passRate >= 0.9 ? '✓' : ct.passRate >= 0.5 ? '∼' : '✗';
        const flakyMark = ct.isFlaky ? ' ⚠ flaky' : '';
        lines.push(
          `  ${icon} ${ct.type}: ${(ct.passRate * 100).toFixed(0)}% pass rate (${ct.passed}/${ct.totalRuns})${flakyMark}`,
        );
      }
      lines.push('');
    }

    if (trends.flakyChecks.length > 0) {
      lines.push('Flaky Checks Detected:');
      for (const fc of trends.flakyChecks) {
        lines.push(`  ⚠ ${fc} — alternates between pass and fail`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Verify a plan — validate that all plan tasks are reflected in linked ChangeSets.
   */
  async verifyPlan(planId: string, session: WorkspaceSession): Promise<string> {
    if (!this.planStorage) return 'PlanStorage not available.';
    const plan = await this.planStorage.get(planId);
    if (!plan) return `Plan "${planId}" not found.`;

    const changeSets = await this.csStorage.listByWorkspace(session.fingerprint.id);
    const relevant = changeSets.filter((cs) => cs.planId === planId);

    const lines: string[] = [];
    lines.push(`Plan Validation: ${planId}`);
    lines.push(`Tasks: ${plan.tasks.length} total`);
    lines.push(`ChangeSets: ${relevant.length} linked`);
    lines.push('');

    if (relevant.length > 0) {
      const allFiles = relevant.flatMap((cs) => cs.files.map((f) => f.path));
      const planFiles = plan.tasks.flatMap((t) => t.files);
      const covered = planFiles.filter((pf) => allFiles.some((af) => af.includes(pf) || pf.includes(af)));
      lines.push(`Files covered: ${covered.length}/${planFiles.length}`);
      lines.push(covered.length === planFiles.length ? '✓ All plan files changed' : '∼ Some plan files may be missing');
    } else {
      lines.push('⚠ No ChangeSets linked to this plan');
    }

    return lines.join('\n');
  }

  /**
   * Verify workspace — overall health and outcome validation.
   */
  async verifyWorkspace(session: WorkspaceSession): Promise<string> {
    const health = session.profile.healthScore;
    const changeSets = await this.csStorage.listByWorkspace(session.fingerprint.id);
    const applied = changeSets.filter((cs) => cs.status === 'applied');

    const lines: string[] = [];
    lines.push('Workspace Verification');
    lines.push('──────────────────────────────────────');
    lines.push(`Health Score: ${health ? health.overall.toFixed(1) : 'N/A'} / 10`);

    if (health) {
      const level = health.overall >= 7 ? 'Good' : health.overall >= 4 ? 'Fair' : 'Needs attention';
      lines.push(`Status: ${level}`);
      lines.push('');
      lines.push('Categories:');
      lines.push(`  Code Quality:       ${health.categories.codeQuality.toFixed(1)} / 10`);
      lines.push(`  Test Coverage:      ${health.categories.testCoverage.toFixed(1)} / 10`);
      lines.push(`  Dependency Health:  ${health.categories.dependencyHealth.toFixed(1)} / 10`);
      lines.push(`  Documentation:      ${health.categories.documentation.toFixed(1)} / 10`);
    }

    lines.push('');
    lines.push(`Total ChangeSets: ${changeSets.length}`);
    lines.push(`Applied: ${applied.length}`);
    if (applied.length > 0) {
      const totalFiles = applied.reduce((s, cs) => s + cs.files.length, 0);
      lines.push(`Files changed: ${totalFiles}`);
    }

    // Accuracy summary
    if (this.accuracyStorage) {
      const accRecords = await this.accuracyStorage.list();
      if (accRecords.length > 0) {
        const avgError = accRecords.reduce((s, r) => s + r.absoluteError, 0) / accRecords.length;
        lines.push('');
        lines.push(`Prediction Accuracy: ${accRecords.length} records, avg error ${avgError.toFixed(2)}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Check 1: Filesystem integrity — all Change Set files exist and are readable.
   */
  private async checkFilesystemIntegrity(
    _id: string,
    rootDir: string,
    files: Array<{ path: string }>,
  ): Promise<VerificationCheck> {
    const check: VerificationCheck = {
      id: 'fs-integrity',
      type: 'filesystem',
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: 0,
    };

    const t0 = performance.now();
    const results: string[] = [];

    for (const fc of files) {
      const fullPath = path.resolve(rootDir, fc.path);
      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          results.push(`✓ ${fc.path} (${stat.size} bytes)`);
        } else {
          results.push(`✗ ${fc.path} (not found)`);
        }
      } catch {
        results.push(`✗ ${fc.path} (error reading)`);
      }
    }

    const failures = results.filter((r) => r.startsWith('✗'));
    check.status = failures.length === 0 ? 'passed' : 'failed';
    check.output = results.join('\n');
    check.durationMs = Math.round(performance.now() - t0);
    check.completedAt = new Date().toISOString();
    return check;
  }

  /**
   * Check 2: Change Set consistency — file content on disk matches proposed content.
   */
  private async checkChangeSetConsistency(
    _id: string,
    rootDir: string,
    files: Array<{ path: string; proposedContent: string }>,
  ): Promise<VerificationCheck> {
    const check: VerificationCheck = {
      id: 'cs-consistency',
      type: 'artifact-consistency',
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: 0,
    };

    const t0 = performance.now();
    const results: string[] = [];

    for (const fc of files) {
      const fullPath = path.resolve(rootDir, fc.path);
      try {
        const diskContent = fs.readFileSync(fullPath, 'utf-8');
        if (diskContent === fc.proposedContent) {
          results.push(`✓ ${fc.path} (content matches)`);
        } else {
          results.push(`~ ${fc.path} (content differs — may have been edited)`);
        }
      } catch {
        results.push(`✗ ${fc.path} (cannot read)`);
      }
    }

    const failures = results.filter((r) => r.startsWith('✗'));
    check.status = failures.length === 0 ? 'passed' : 'failed';
    check.output = results.join('\n');
    check.durationMs = Math.round(performance.now() - t0);
    check.completedAt = new Date().toISOString();
    return check;
  }

  /**
   * Check 3: TypeScript typecheck — run tsc --noEmit if available.
   */
  private async checkTypeScript(rootDir: string): Promise<VerificationCheck> {
    const check: VerificationCheck = {
      id: 'typecheck',
      type: 'typecheck',
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: 0,
    };

    // Check if TypeScript is available
    const tsconfigPath = path.join(rootDir, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      check.status = 'skipped';
      check.output = 'No tsconfig.json found — skipping typecheck';
      check.completedAt = new Date().toISOString();
      return check;
    }

    check.command = 'npx tsc --noEmit';
    const t0 = performance.now();

    try {
      execSync(check.command, {
        cwd: rootDir,
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      check.status = 'passed';
      check.output = 'TypeScript compilation passed — no errors.';
    } catch (error) {
      check.status = 'failed';
      check.output = (error as Error).message.slice(0, 2000);
    }

    check.durationMs = Math.round(performance.now() - t0);
    check.completedAt = new Date().toISOString();
    return check;
  }

  /**
   * Check 4: Test execution — run pnpm test if available.
   */
  private async checkTests(rootDir: string): Promise<VerificationCheck> {
    const check: VerificationCheck = {
      id: 'tests',
      type: 'test',
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: 0,
    };

    const pkgPath = path.join(rootDir, 'package.json');
    let hasTestScript = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      hasTestScript = !!pkg.scripts?.test && pkg.scripts.test !== 'echo' && pkg.scripts.test !== '';
    } catch {
      check.status = 'skipped';
      check.output = 'No package.json found — skipping tests';
      check.completedAt = new Date().toISOString();
      return check;
    }

    if (!hasTestScript) {
      check.status = 'skipped';
      check.output = 'No test script configured — skipping tests';
      check.completedAt = new Date().toISOString();
      return check;
    }

    check.command = 'pnpm test';
    const t0 = performance.now();

    try {
      const output = execSync(check.command, {
        cwd: rootDir,
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      check.status = 'passed';
      check.output = output.slice(0, 2000);
    } catch (error) {
      check.status = 'failed';
      check.output = (error as Error).message.slice(0, 2000);
    }

    check.durationMs = Math.round(performance.now() - t0);
    check.completedAt = new Date().toISOString();
    return check;
  }

  /**
   * Check 5: Build validation — run pnpm build if available.
   */
  private async checkBuild(rootDir: string): Promise<VerificationCheck> {
    const check: VerificationCheck = {
      id: 'build',
      type: 'build',
      status: 'running',
      startedAt: new Date().toISOString(),
      durationMs: 0,
    };

    const pkgPath = path.join(rootDir, 'package.json');
    let hasBuildScript = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      hasBuildScript = !!pkg.scripts?.build && pkg.scripts.build !== '';
    } catch {
      check.status = 'skipped';
      check.output = 'No package.json found — skipping build';
      check.completedAt = new Date().toISOString();
      return check;
    }

    if (!hasBuildScript) {
      check.status = 'skipped';
      check.output = 'No build script configured — skipping build';
      check.completedAt = new Date().toISOString();
      return check;
    }

    check.command = 'pnpm build';
    const t0 = performance.now();

    try {
      const output = execSync(check.command, {
        cwd: rootDir,
        encoding: 'utf-8',
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      check.status = 'passed';
      check.output = output.slice(0, 2000);
    } catch (error) {
      check.status = 'failed';
      check.output = (error as Error).message.slice(0, 2000);
    }

    check.durationMs = Math.round(performance.now() - t0);
    check.completedAt = new Date().toISOString();
    return check;
  }

  /**
   * Render a VerificationReport for terminal display.
   */
  renderReport(report: VerificationReport): string {
    const lines: string[] = [];
    lines.push(`Verification Report ${report.id}`);
    lines.push(`──────────────────────────────────────`);
    lines.push(`Change Set: ${report.changeSetId}`);
    lines.push(`Plan: ${report.planId}`);
    lines.push(`Status: ${report.status === 'passed' ? '✓ PASSED' : '✗ FAILED'}`);
    lines.push(`Created: ${report.createdAt}`);
    if (report.completedAt) lines.push(`Completed: ${report.completedAt}`);
    lines.push('');

    lines.push(`Summary: ${report.summary.passed}/${report.summary.total} passed`);
    if (report.summary.failed > 0) lines.push(`Failures: ${report.summary.failed}`);
    if (report.summary.skipped > 0) lines.push(`Skipped: ${report.summary.skipped}`);
    lines.push('');

    lines.push('Checks:');
    for (const check of report.checks) {
      const icon =
        check.status === 'passed' ? '✓' : check.status === 'failed' ? '✗' : check.status === 'skipped' ? '−' : '→';
      lines.push(`  ${icon} ${check.type}${check.command ? ` | ${check.command}` : ''}`);
      if (check.durationMs > 0) {
        lines.push(`     ${check.durationMs}ms`);
      }
      if (check.status === 'failed' && check.output) {
        // Show first 2 lines of failure output
        const failLines = check.output.split('\n').slice(0, 4);
        for (const fl of failLines) {
          lines.push(`     ${fl}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
