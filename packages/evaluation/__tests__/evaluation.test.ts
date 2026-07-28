import { describe, expect, it } from 'vitest';
import { EvaluationHarness } from '../src/harness';
import { EV003B_CORPUS } from '../src/corpus-definition';

describe('EV-003b Corpus Evaluation', () => {
  it('evaluates all corpus entries without error', async () => {
    const harness = new EvaluationHarness();
    const report = await harness.evaluate(EV003B_CORPUS);

    expect(report.totalEntries).toBeGreaterThan(0);
    expect(report.totalAssertions).toBeGreaterThan(0);
    expect(report.errors).toBe(0);
  });

  it('achieves minimum accuracy threshold', async () => {
    const harness = new EvaluationHarness();
    const report = await harness.evaluate(EV003B_CORPUS);

    // At minimum, 50% of assertions should pass
    // (low bar for initial corpus — will tighten as analyzers improve)
    expect(report.metrics.overallAccuracy).toBeGreaterThanOrEqual(0.5);
  });

  it('produces traceability for all assertions', async () => {
    const harness = new EvaluationHarness();
    const report = await harness.evaluate(EV003B_CORPUS);

    // >75% of assertions should trace to observation sources
    expect(report.metrics.traceability).toBeGreaterThanOrEqual(0.75);
  });

  it('reports per-entry results with assertion detail', async () => {
    const harness = new EvaluationHarness();
    const report = await harness.evaluate(EV003B_CORPUS);

    for (const entry of report.entries) {
      expect(entry.assertions.length).toBeGreaterThan(0);
      for (const assertion of entry.assertions) {
        expect(assertion.field).toBeTruthy();
        expect(assertion.status).toMatch(/^pass|fail|error|missing$/);
        expect(assertion.confidence).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('detects regressions when previous report is provided', async () => {
    const harness = new EvaluationHarness();
    const firstReport = await harness.evaluate(EV003B_CORPUS);

    // Running again with previous report — should detect zero regressions
    // since nothing changed between runs
    const secondReport = await harness.evaluate(EV003B_CORPUS, firstReport);

    expect(secondReport.regressions.length).toBe(0);
  });
});
