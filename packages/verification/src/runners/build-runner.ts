import type { IndividualCheckResult, VerificationCheckRequest } from '../types';
import { BaseRunner } from './base-runner';

export class BuildRunner extends BaseRunner {
  readonly id = 'build';
  readonly name = 'Build Check';
  readonly supportedCategories = ['build'] as const;

  async execute(check: VerificationCheckRequest): Promise<IndividualCheckResult> {
    const config = (check.config ?? {}) as Record<string, unknown>;
    const exitCode = config.exitCode as number | undefined;

    if (exitCode === undefined) {
      return this.skipped(check.id, check.name, 'build', 'No build output provided');
    }

    if (exitCode === 0) {
      return this.passed(
        check.id,
        check.name,
        'build',
        [this.evidence('build_log', 'text/plain', `Build completed with exit code 0`, 'Build succeeded')],
        'Build completed successfully',
        0,
      );
    }

    return this.failed(
      check.id,
      check.name,
      'build',
      [this.evidence('build_log', 'text/plain', `Build failed with exit code ${exitCode}`, `Build failure`)],
      `Build failed with exit code ${exitCode}`,
      0,
      `Build exited with code ${exitCode}`,
    );
  }
}
