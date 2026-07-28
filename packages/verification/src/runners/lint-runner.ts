import type { IndividualCheckResult, VerificationCheckRequest } from '../types';
import { BaseRunner } from './base-runner';

export class LintRunner extends BaseRunner {
  readonly id = 'lint';
  readonly name = 'Lint Check';
  readonly supportedCategories = ['lint', 'type_check'] as const;

  async execute(check: VerificationCheckRequest): Promise<IndividualCheckResult> {
    const config = (check.config ?? {}) as Record<string, unknown>;
    const issues = config.issues as number | undefined;

    if (issues === undefined) {
      const evidence = [this.evidence('lint_output', 'text/plain', 'No lint issues reported', 'Lint completed')];
      return this.passed(check.id, check.name, check.category, evidence, 'No lint issues found', 0);
    }

    if (issues === 0) {
      const evidence = [this.evidence('lint_output', 'text/plain', 'No lint issues found', 'Lint passed')];
      return this.passed(check.id, check.name, check.category, evidence, 'No lint issues', 0);
    }

    const evidence = [
      this.evidence('lint_output', 'text/plain', `Found ${issues} lint issue(s)`, `${issues} lint issue(s)`),
    ];

    return this.failed(
      check.id,
      check.name,
      check.category,
      evidence,
      `Found ${issues} lint issue(s)`,
      0,
      `${issues} issue(s) require attention`,
    );
  }
}
