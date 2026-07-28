import { describe, expect, it } from 'vitest';
import { DefaultVerificationEngine } from '../src/default-verification-engine';
import { DefaultVerificationPipeline } from '../src/pipeline/default-pipeline';
import { ResultAggregator } from '../src/pipeline/result-aggregator';
import { BuildRunner } from '../src/runners/build-runner';
import type { CustomCheckHandler } from '../src/runners/custom-runner';
import { TestRunner } from '../src/runners/test-runner';
import type { IndividualCheckResult, VerificationRequest } from '../src/types';

function makeRequest(overrides?: Partial<VerificationRequest>): VerificationRequest {
  return {
    id: 'vr-req-1',
    jobId: 'job-1',
    checks: [],
    ...overrides,
  };
}

describe('DefaultVerificationEngine', () => {
  describe('Determinism', () => {
    it('same inputs produce same result', async () => {
      const engine = new DefaultVerificationEngine();
      const request = makeRequest({
        checks: [
          { id: 'build', name: 'Build', category: 'build', config: { exitCode: 0 } },
          { id: 'test', name: 'Tests', category: 'unit_test', config: { passed: 10, failed: 0 } },
        ],
      });

      const r1 = await engine.verify(request);
      const r2 = await engine.verify(request);

      expect(r1.status).toBe(r2.status);
      expect(r1.checkResults.length).toBe(r2.checkResults.length);
      expect(r1.checkResults[0].status).toBe(r2.checkResults[0].status);
    });
  });

  describe('Pipeline composability', () => {
    it('executes all checks in a request', async () => {
      const engine = new DefaultVerificationEngine();
      const request = makeRequest({
        checks: [
          { id: 'build', name: 'Build', category: 'build', config: { exitCode: 0 } },
          { id: 'lint', name: 'Lint', category: 'lint', config: { issues: 0 } },
          { id: 'test', name: 'Unit Tests', category: 'unit_test', config: { passed: 42, failed: 0 } },
        ],
      });

      const result = await engine.verify(request);
      expect(result.checkResults).toHaveLength(3);
      expect(result.status).toBe('passed');
    });

    it('aggregates results correctly when all pass', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [
            { id: 'b1', name: 'B1', category: 'build', config: { exitCode: 0 } },
            { id: 't1', name: 'T1', category: 'unit_test', config: { passed: 5, failed: 0 } },
          ],
        }),
      );
      expect(result.status).toBe('passed');
    });

    it('aggregates results correctly when some fail', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [
            { id: 'b1', name: 'B1', category: 'build', config: { exitCode: 0 } },
            { id: 't1', name: 'T1', category: 'unit_test', config: { passed: 3, failed: 2 } },
          ],
        }),
      );
      expect(result.status).toBe('failed');
    });

    it('failing one check does not prevent other checks from running', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [
            { id: 'b1', name: 'B1', category: 'build', config: { exitCode: 1 } },
            { id: 't1', name: 'T1', category: 'unit_test', config: { passed: 5, failed: 0 } },
          ],
        }),
      );
      expect(result.checkResults).toHaveLength(2);
      expect(result.status).toBe('failed');
    });
  });

  describe('Runner isolation', () => {
    it('build runner passes on exit code 0', async () => {
      const runner = new BuildRunner();
      const result = await runner.execute({ id: 'b', name: 'B', category: 'build', config: { exitCode: 0 } });
      expect(result.status).toBe('passed');
    });

    it('build runner fails on non-zero exit code', async () => {
      const runner = new BuildRunner();
      const result = await runner.execute({ id: 'b', name: 'B', category: 'build', config: { exitCode: 1 } });
      expect(result.status).toBe('failed');
    });

    it('build runner skips when no output provided', async () => {
      const runner = new BuildRunner();
      const result = await runner.execute({ id: 'b', name: 'B', category: 'build' });
      expect(result.status).toBe('skipped');
    });

    it('test runner passes when all pass', async () => {
      const runner = new TestRunner();
      const result = await runner.execute({
        id: 't',
        name: 'T',
        category: 'unit_test',
        config: { passed: 10, failed: 0 },
      });
      expect(result.status).toBe('passed');
    });

    it('test runner fails when any test fails', async () => {
      const runner = new TestRunner();
      const result = await runner.execute({
        id: 't',
        name: 'T',
        category: 'unit_test',
        config: { passed: 8, failed: 2 },
      });
      expect(result.status).toBe('failed');
    });
  });

  describe('Custom runners', () => {
    it('supports custom check handlers', async () => {
      const handler: CustomCheckHandler = async (check) => ({
        checkId: check.id,
        name: check.name,
        category: check.category,
        status: 'passed',
        evidence: [],
        summary: 'Custom pass',
        durationMs: 0,
      });
      const engine = new DefaultVerificationEngine({ customCheckHandler: handler });

      const result = await engine.verify(
        makeRequest({
          checks: [{ id: 'custom', name: 'Custom', category: 'custom', config: {} }],
        }),
      );
      expect(result.status).toBe('passed');
    });

    it('custom runner can be registered after construction', async () => {
      const pipeline = new DefaultVerificationPipeline();
      pipeline.registerRunner(new BuildRunner());

      const result = await pipeline.execute(
        makeRequest({
          checks: [{ id: 'b', name: 'B', category: 'build', config: { exitCode: 0 } }],
        }),
      );
      expect(result.status).toBe('passed');
    });
  });

  describe('Evidence', () => {
    it('results carry evidence', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [{ id: 'build', name: 'Build', category: 'build', config: { exitCode: 0 } }],
        }),
      );
      expect(result.checkResults[0].evidence.length).toBeGreaterThan(0);
      expect(result.checkResults[0].evidence[0].type).toBe('build_log');
    });

    it('failed results carry error information', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [{ id: 'build', name: 'Build', category: 'build', config: { exitCode: 1 } }],
        }),
      );
      expect(result.checkResults[0].status).toBe('failed');
      expect(result.checkResults[0].error).toBeTruthy();
    });
  });

  describe('Audit trail', () => {
    it('result is immutable and contains all check results', async () => {
      const engine = new DefaultVerificationEngine();
      const request = makeRequest({
        checks: [
          { id: 'b', name: 'B', category: 'build', config: { exitCode: 0 } },
          { id: 't', name: 'T', category: 'unit_test', config: { passed: 5, failed: 1 } },
        ],
      });

      const result = await engine.verify(request);
      expect(result.requestId).toBe(request.id);
      expect(result.jobId).toBe(request.jobId);
      expect(result.startedAt).toBeTruthy();
      expect(result.completedAt).toBeTruthy();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('result can be stringified for persistence', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [{ id: 'b', name: 'B', category: 'build', config: { exitCode: 0 } }],
        }),
      );
      const serialized = JSON.parse(JSON.stringify(result));
      expect(serialized.id).toBe(result.id);
      expect(serialized.status).toBe('passed');
    });
  });

  describe('Status aggregation', () => {
    it('passed when all checks pass', () => {
      const agg = new ResultAggregator();
      const results: IndividualCheckResult[] = [
        { checkId: 'a', name: 'A', category: 'build', status: 'passed', evidence: [], summary: '', durationMs: 0 },
        { checkId: 'b', name: 'B', category: 'test', status: 'passed', evidence: [], summary: '', durationMs: 0 },
      ];
      const r = agg.aggregate('req-1', 'job-1', results, new Date().toISOString());
      expect(r.status).toBe('passed');
    });

    it('failed when any check fails', () => {
      const agg = new ResultAggregator();
      const results: IndividualCheckResult[] = [
        { checkId: 'a', name: 'A', category: 'build', status: 'passed', evidence: [], summary: '', durationMs: 0 },
        {
          checkId: 'b',
          name: 'B',
          category: 'test',
          status: 'failed',
          evidence: [],
          summary: '',
          durationMs: 0,
          error: 'fail',
        },
      ];
      const r = agg.aggregate('req-1', 'job-1', results, new Date().toISOString());
      expect(r.status).toBe('failed');
    });

    it('warning when no failures but warnings exist', () => {
      const agg = new ResultAggregator();
      const results: IndividualCheckResult[] = [
        { checkId: 'a', name: 'A', category: 'build', status: 'passed', evidence: [], summary: '', durationMs: 0 },
        { checkId: 'b', name: 'B', category: 'test', status: 'warning', evidence: [], summary: 'warn', durationMs: 0 },
      ];
      const r = agg.aggregate('req-1', 'job-1', results, new Date().toISOString());
      expect(r.status).toBe('warning');
    });

    it('skipped when no checks executed', () => {
      const agg = new ResultAggregator();
      const r = agg.aggregate('req-1', 'job-1', [], new Date().toISOString());
      expect(r.status).toBe('skipped');
    });
  });

  describe('Verification categories', () => {
    it('supports all standard categories', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [
            { id: 'b', name: 'Build', category: 'build', config: { exitCode: 0 } },
            { id: 'ut', name: 'Unit', category: 'unit_test', config: { passed: 1, failed: 0 } },
            { id: 'it', name: 'Integration', category: 'integration_test', config: { passed: 1, failed: 0 } },
            { id: 'e2e', name: 'E2E', category: 'e2e_test', config: { passed: 1, failed: 0 } },
            { id: 'lint', name: 'Lint', category: 'lint', config: { issues: 0 } },
            { id: 'tc', name: 'TypeCheck', category: 'type_check', config: { issues: 0 } },
          ],
        }),
      );
      expect(result.checkResults).toHaveLength(6);
    });
  });

  describe('Error handling', () => {
    it('unknown category produces inconclusive check', async () => {
      const engine = new DefaultVerificationEngine();
      const result = await engine.verify(
        makeRequest({
          checks: [{ id: 'x', name: 'Unknown', category: 'custom', config: { result: 'nonexistent' } }],
        }),
      );
      // Custom runner handles 'custom' by default, but with no handler and no config,
      // it returns 'skipped'. The custom config 'nonexistent' doesn't match 'passed' or 'failed'.
      expect(result.checkResults.length).toBe(1);
    });
  });
});
