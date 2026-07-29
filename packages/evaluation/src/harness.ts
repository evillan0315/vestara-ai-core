/**
 * EvaluationHarness — runs the UnderstandingEngine against a corpus
 * and produces an EvaluationReport.
 *
 * For each corpus entry:
 *   1. Open the repository via WorkspaceRuntime
 *   2. Observe raw signals
 *   3. Derive understanding
 *   4. Evaluate every assertion against the snapshot
 *   5. Compute traceability by verifying that each asserted
 *      field can be traced to observation sources
 *   6. Detect regressions against a previous report
 *
 * The harness is stateless — it takes a corpus and optionally a
 * previous report for regression detection.
 */

import type { WorkspaceUnderstanding } from '@vestara/understanding';
import type { Corpus, CorpusEntry } from './corpus';
import type { AssertionResult, EntryResult, EvaluationReport, ProducerMetric } from './types';

export class EvaluationHarness {
  async evaluate(corpus: Corpus, previousReport?: EvaluationReport): Promise<EvaluationReport> {
    const entryResults: EntryResult[] = [];
    let totalAssertions = 0;
    let totalPassed = 0;
    let totalFailed = 0;
    let totalErrors = 0;
    let totalMissing = 0;
    let totalTraceability = 0;

    for (const entry of corpus.entries) {
      const result = await this.evaluateEntry(entry);
      entryResults.push(result);
      totalAssertions += result.total;
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalErrors += result.errors;
      totalMissing += result.missing;
      totalTraceability += result.traceabilityScore;
    }

    const overallAccuracy = totalAssertions > 0 ? totalPassed / totalAssertions : 1;
    const overallCoverage = totalAssertions > 0 ? (totalPassed + totalFailed) / totalAssertions : 1;
    const avgConfidence = this.averageConfidence(entryResults);
    const traceability = entryResults.length > 0 ? totalTraceability / entryResults.length : 1;

    // Detect regressions: assertions that passed before but fail now
    const regressions = this.detectRegressions(entryResults, previousReport);

    // Compute per-producer metrics
    const producerMetrics = this.computeProducerMetrics(entryResults);

    return {
      timestamp: new Date().toISOString(),
      totalEntries: corpus.entries.length,
      totalAssertions,
      passed: totalPassed,
      failed: totalFailed,
      errors: totalErrors,
      missing: totalMissing,
      metrics: {
        overallAccuracy,
        overallCoverage,
        avgConfidence,
        traceability,
        regressionCount: regressions.length,
        producerMetrics,
      },
      entries: entryResults,
      regressions,
    };
  }

  private async evaluateEntry(entry: CorpusEntry): Promise<EntryResult> {
    const results: AssertionResult[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let errorCount = 0;
    let missingCount = 0;

    let understanding: WorkspaceUnderstanding;
    try {
      understanding = await this.produceUnderstanding(entry.path);
    } catch (err) {
      // If we can't even open the repo, everything is an error
      const errorResult: AssertionResult = {
        field: '_open',
        expected: entry.path,
        actual: null,
        status: 'error',
        confidence: 0,
        observationSources: [],
        detail: `Failed to open repository: ${err instanceof Error ? err.message : String(err)}`,
      };
      return {
        entry,
        total: 1,
        passed: 0,
        failed: 0,
        errors: 1,
        missing: 0,
        assertions: [errorResult],
        traceabilityScore: 0,
      };
    }

    // ── Language ────────────────────────────────────────────
    results.push(
      this.evaluateField(
        'language.primary',
        entry.assertions.language.primary,
        understanding.identity.primaryLanguage,
        understanding.identity.languageConfidence,
        entry.assertions.language.minimumConfidence ?? 0,
        ['identity.primaryLanguage'],
        understanding,
      ),
    );
    if (results[results.length - 1].status === 'pass') passedCount++;
    else if (results[results.length - 1].status === 'fail') failedCount++;
    else if (results[results.length - 1].status === 'error') errorCount++;
    else missingCount++;

    // ── Framework ───────────────────────────────────────────
    if (entry.assertions.framework) {
      results.push(
        this.evaluateField(
          'framework.kind',
          entry.assertions.framework.kind,
          understanding.identity.framework ?? '',
          understanding.identity.framework ? 1 : 0,
          entry.assertions.framework.minimumConfidence ?? 0,
          ['identity.framework'],
          understanding,
        ),
      );
      if (results[results.length - 1].status === 'pass') passedCount++;
      else if (results[results.length - 1].status === 'fail') failedCount++;
      else if (results[results.length - 1].status === 'error') errorCount++;
      else missingCount++;
    }

    // ── Architecture ────────────────────────────────────────
    results.push(
      this.evaluateField(
        'architecture.kind',
        entry.assertions.architecture.kind,
        understanding.architecture.kind,
        1, // architecture kind is deterministic
        entry.assertions.architecture.minimumConfidence ?? 0,
        ['config.isMonorepo', 'dependencies.packages.length'],
        understanding,
      ),
    );
    if (results[results.length - 1].status === 'pass') passedCount++;
    else if (results[results.length - 1].status === 'fail') failedCount++;
    else if (results[results.length - 1].status === 'error') errorCount++;
    else missingCount++;

    // ── Maturity ────────────────────────────────────────────
    results.push(
      this.evaluateField(
        'maturity.level',
        entry.assertions.maturity.level,
        understanding.maturity.level,
        1,
        0,
        ['maturity.healthScore', 'maturity.testCoverage'],
        understanding,
      ),
    );
    if (results[results.length - 1].status === 'pass') passedCount++;
    else if (results[results.length - 1].status === 'fail') failedCount++;
    else if (results[results.length - 1].status === 'error') errorCount++;
    else missingCount++;

    // ── Risks ───────────────────────────────────────────────
    const riskResult = this.evaluateRisks(entry.assertions.risks.contains, understanding);
    results.push(riskResult);
    if (riskResult.status === 'pass') passedCount++;
    else if (riskResult.status === 'fail') failedCount++;
    else if (riskResult.status === 'error') errorCount++;
    else missingCount++;

    // ── Health ──────────────────────────────────────────────
    if (entry.assertions.health) {
      const healthResult = this.evaluateHealth(
        entry.assertions.health.scoreMin,
        entry.assertions.health.scoreMax,
        understanding,
      );
      results.push(healthResult);
      if (healthResult.status === 'pass') passedCount++;
      else if (healthResult.status === 'fail') failedCount++;
      else if (healthResult.status === 'error') errorCount++;
      else missingCount++;
    }

    // ── Traceability ────────────────────────────────────────
    const traceabilityScore = this.computeTraceability(results);

    return {
      entry,
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      errors: errorCount,
      missing: missingCount,
      assertions: results,
      traceabilityScore,
    };
  }

  private evaluateField(
    field: string,
    expected: string,
    actual: string,
    confidence: number,
    minimumConfidence: number,
    observationSources: string[],
    _understanding: WorkspaceUnderstanding,
  ): AssertionResult {
    if (!actual && expected === 'unknown') {
      return {
        field,
        expected,
        actual: null,
        status: 'pass',
        confidence: 1,
        observationSources,
        detail: 'Both expected and actual are unknown/empty',
      };
    }
    if (!actual) {
      return {
        field,
        expected,
        actual: null,
        status: 'missing',
        confidence: 0,
        observationSources,
        detail: `Expected "${expected}" but no value was produced`,
      };
    }

    const normalizedActual = actual.toLowerCase().trim();
    const normalizedExpected = expected.toLowerCase().trim();

    const exactMatch = normalizedActual === normalizedExpected;
    const confOk = confidence >= minimumConfidence;

    if (exactMatch && confOk) {
      return {
        field,
        expected,
        actual,
        status: 'pass',
        confidence,
        observationSources,
        detail: null,
      };
    }

    if (!exactMatch) {
      return {
        field,
        expected,
        actual,
        status: 'fail',
        confidence,
        observationSources,
        detail: `Expected "${expected}", got "${actual}"`,
      };
    }

    // Match but confidence too low
    return {
      field,
      expected,
      actual,
      status: 'fail',
      confidence,
      observationSources,
      detail: `Value matches but confidence ${confidence.toFixed(2)} is below minimum ${minimumConfidence}`,
    };
  }

  private evaluateRisks(expectedRisks: readonly string[], understanding: WorkspaceUnderstanding): AssertionResult {
    const actualCategories = understanding.maturity.risks.map((r) => r.category);
    const missing = expectedRisks.filter((er) => !actualCategories.includes(er));

    const sources = understanding.maturity.risks.map((r) => r.observationSource);

    if (missing.length === 0) {
      return {
        field: 'risks.contains',
        expected: expectedRisks.join(', '),
        actual: actualCategories.join(', '),
        status: 'pass',
        confidence: 1,
        observationSources: [...new Set(sources)],
        detail: null,
      };
    }

    return {
      field: 'risks.contains',
      expected: expectedRisks.join(', '),
      actual: actualCategories.join(', '),
      status: expectedRisks.length === 0 ? 'pass' : 'fail',
      confidence: 1,
      observationSources: [...new Set(sources)],
      detail: expectedRisks.length > 0 ? `Missing risks: ${missing.join(', ')}` : null,
    };
  }

  private evaluateHealth(scoreMin: number, scoreMax: number, understanding: WorkspaceUnderstanding): AssertionResult {
    const score = understanding.maturity.healthScore;
    const inRange = score >= scoreMin && score <= scoreMax;

    return {
      field: 'health.score',
      expected: `${scoreMin}-${scoreMax}`,
      actual: score.toFixed(1),
      status: inRange ? 'pass' : 'fail',
      confidence: 1,
      observationSources: ['maturity.healthScore'],
      detail: inRange ? null : `Health score ${score.toFixed(1)} outside expected range ${scoreMin}-${scoreMax}`,
    };
  }

  private computeProducerMetrics(entries: EntryResult[]): readonly ProducerMetric[] {
    const FIELD_TO_PRODUCER: Record<string, string> = {
      'language.primary': 'language',
      'framework.kind': 'framework',
      'architecture.kind': 'architecture',
      'maturity.level': 'maturity',
      'risks.contains': 'risks',
      'health.score': 'health',
    };

    const producerData: Record<string, { passed: number; total: number; confidenceTotal: number }> = {};

    for (const entry of entries) {
      for (const assertion of entry.assertions) {
        const producer = FIELD_TO_PRODUCER[assertion.field];
        if (!producer) continue;

        if (!producerData[producer]) {
          producerData[producer] = { passed: 0, total: 0, confidenceTotal: 0 };
        }
        producerData[producer].total++;
        producerData[producer].confidenceTotal += assertion.confidence;
        if (assertion.status === 'pass') {
          producerData[producer].passed++;
        }
      }
    }

    return Object.entries(producerData)
      .map(([producer, data]) => ({
        producer,
        accuracy: data.total > 0 ? data.passed / data.total : 1,
        avgConfidence: data.total > 0 ? data.confidenceTotal / data.total : 1,
        assertionCount: data.total,
      }))
      .sort((a, b) => a.accuracy - b.accuracy);
  }

  private computeTraceability(assertions: AssertionResult[]): number {
    const withSources = assertions.filter((a) => a.observationSources.length > 0).length;
    return assertions.length > 0 ? withSources / assertions.length : 1;
  }

  private averageConfidence(entries: EntryResult[]): number {
    let total = 0;
    let count = 0;
    for (const entry of entries) {
      for (const a of entry.assertions) {
        total += a.confidence;
        count++;
      }
    }
    return count > 0 ? total / count : 1;
  }

  private detectRegressions(current: EntryResult[], previous?: EvaluationReport): AssertionResult[] {
    if (!previous) return [];
    const regressions: AssertionResult[] = [];

    for (const entry of current) {
      const prevEntry = previous.entries.find((e) => e.entry.name === entry.entry.name);
      if (!prevEntry) continue;

      for (const assertion of entry.assertions) {
        const prevAssertion = prevEntry.assertions.find((a) => a.field === assertion.field);
        if (prevAssertion && prevAssertion.status === 'pass' && assertion.status !== 'pass') {
          regressions.push(assertion);
        }
      }
    }

    return regressions;
  }

  private async produceUnderstanding(repoPath: string): Promise<WorkspaceUnderstanding> {
    const { WorkspaceRuntime } = await import('@vestara/workspace');

    const runtime = new WorkspaceRuntime({});
    await runtime.open(repoPath);
    const session = runtime.getSession();

    return session.understanding!;
  }
}
