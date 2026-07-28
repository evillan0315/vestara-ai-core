import type {
  IndividualCheckResult,
  VerificationCheckRequest,
  VerificationPipeline,
  VerificationRequest,
  VerificationResult,
  VerificationRunner,
} from '../types';
import { ResultAggregator } from './result-aggregator';
import { RunnerRegistry } from './runner-registry';

export class DefaultVerificationPipeline implements VerificationPipeline {
  private readonly registry: RunnerRegistry;
  private readonly aggregator: ResultAggregator;

  constructor(runners?: VerificationRunner[]) {
    this.registry = new RunnerRegistry();
    this.aggregator = new ResultAggregator();

    if (runners) {
      for (const runner of runners) {
        this.registry.register(runner);
      }
    }
  }

  registerRunner(runner: VerificationRunner): void {
    this.registry.register(runner);
  }

  async execute(request: VerificationRequest): Promise<VerificationResult> {
    const startedAt = new Date().toISOString();
    const results: IndividualCheckResult[] = [];

    for (const check of request.checks) {
      try {
        const runner = this.registry.findRunner(check);
        const result = await this.executeWithTimeout(runner, check);
        results.push(result);
      } catch (error) {
        results.push({
          checkId: check.id,
          name: check.name,
          category: check.category,
          status: 'inconclusive',
          evidence: [],
          summary: error instanceof Error ? error.message : 'Unknown error',
          durationMs: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.aggregator.aggregate(request.id, request.jobId, results, startedAt);
  }

  private async executeWithTimeout(
    runner: VerificationRunner,
    check: VerificationCheckRequest,
  ): Promise<IndividualCheckResult> {
    const timeoutMs = check.timeoutMs ?? 30000;
    const timeout = new Promise<IndividualCheckResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Check ${check.id} timed out after ${timeoutMs}ms`)), timeoutMs),
    );
    return Promise.race([runner.execute(check), timeout]);
  }
}
