import type { Evidence, IndividualCheckResult, VerificationCheckRequest, VerificationRunner } from '../types';

export abstract class BaseRunner implements VerificationRunner {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly supportedCategories: readonly string[];

  abstract execute(check: VerificationCheckRequest): Promise<IndividualCheckResult>;

  protected passed(
    checkId: string,
    name: string,
    category: string,
    evidence: Evidence[],
    summary: string,
    durationMs: number,
  ): IndividualCheckResult {
    return { checkId, name, category, status: 'passed', evidence, summary, durationMs };
  }

  protected failed(
    checkId: string,
    name: string,
    category: string,
    evidence: Evidence[],
    summary: string,
    durationMs: number,
    error?: string,
  ): IndividualCheckResult {
    return { checkId, name, category, status: 'failed', evidence, summary, durationMs, error };
  }

  protected warning(
    checkId: string,
    name: string,
    category: string,
    evidence: Evidence[],
    summary: string,
    durationMs: number,
  ): IndividualCheckResult {
    return { checkId, name, category, status: 'warning', evidence, summary, durationMs };
  }

  protected skipped(checkId: string, name: string, category: string, reason: string): IndividualCheckResult {
    return { checkId, name, category, status: 'skipped', evidence: [], summary: reason, durationMs: 0 };
  }

  protected evidence(type: Evidence['type'], contentType: string, data: unknown, description: string): Evidence {
    return { type, contentType, data, description, timestamp: new Date().toISOString() };
  }
}
