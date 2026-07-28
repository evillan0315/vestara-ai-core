import type { IndividualCheckResult, VerificationCheckRequest } from '../types';
import { BaseRunner } from './base-runner';

export class TestRunner extends BaseRunner {
  readonly id = 'test';
  readonly name = 'Test Runner';
  readonly supportedCategories = ['unit_test', 'integration_test', 'e2e_test'] as const;

  async execute(check: VerificationCheckRequest): Promise<IndividualCheckResult> {
    const config = (check.config ?? {}) as Record<string, unknown>;
    const passed = config.passed as number | undefined;
    const failed = config.failed as number | undefined;
    const total = config.total as number | undefined;

    if (passed === undefined && failed === undefined) {
      return this.skipped(check.id, check.name, check.category, 'No test results provided');
    }

    const totalTests = total ?? (passed ?? 0) + (failed ?? 0);
    const passedCount = passed ?? 0;
    const failedCount = failed ?? 0;

    const evidence = [
      this.evidence(
        'test_report',
        'application/json',
        { total: totalTests, passed: passedCount, failed: failedCount, category: check.category },
        `Test results: ${passedCount}/${totalTests} passed`,
      ),
    ];

    if (failedCount === 0 && totalTests > 0) {
      return this.passed(check.id, check.name, check.category, evidence, `All ${totalTests} tests passed`, 0);
    }

    if (failedCount > 0) {
      return this.failed(
        check.id,
        check.name,
        check.category,
        evidence,
        `${failedCount}/${totalTests} tests failed`,
        0,
        `${failedCount} test(s) failed`,
      );
    }

    return this.warning(check.id, check.name, check.category, evidence, 'No tests were executed', 0);
  }
}
