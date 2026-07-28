import type { Evidence, IndividualCheckResult, VerificationCheckRequest } from '../types';
import { BaseRunner } from './base-runner';

export type CustomCheckHandler = (check: VerificationCheckRequest) => Promise<IndividualCheckResult>;

export class CustomRunner extends BaseRunner {
  readonly id = 'custom';
  readonly name = 'Custom Check';
  readonly supportedCategories = [
    'custom',
    'security',
    'performance',
    'policy_compliance',
    'human_approval',
    'documentation',
    'artifact',
  ];

  private readonly handler?: CustomCheckHandler;

  constructor(handler?: CustomCheckHandler) {
    super();
    this.handler = handler;
  }

  async execute(check: VerificationCheckRequest): Promise<IndividualCheckResult> {
    if (this.handler) {
      return this.handler(check);
    }

    const evidence: Evidence[] = [];
    if (check.config?.result === 'passed') {
      evidence.push(this.evidence('custom', 'text/plain', 'Check passed', 'Custom check result'));
      return this.passed(check.id, check.name, check.category, evidence, 'Custom check passed', 0);
    }
    if (check.config?.result === 'failed') {
      evidence.push(this.evidence('custom', 'text/plain', 'Check failed', 'Custom check result'));
      return this.failed(
        check.id,
        check.name,
        check.category,
        evidence,
        'Custom check failed',
        0,
        check.config.reason as string,
      );
    }

    return this.skipped(check.id, check.name, check.category, 'No custom handler configured');
  }
}
