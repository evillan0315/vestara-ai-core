import { DefaultVerificationPipeline } from './pipeline/default-pipeline';
import { BuildRunner } from './runners/build-runner';
import type { CustomCheckHandler } from './runners/custom-runner';
import { CustomRunner } from './runners/custom-runner';
import { LintRunner } from './runners/lint-runner';
import { TestRunner } from './runners/test-runner';
import type { VerificationRequest, VerificationResult, VerificationRunner } from './types';

export interface VerificationEngineConfig {
  runners?: VerificationRunner[];
  customCheckHandler?: CustomCheckHandler;
}

export class DefaultVerificationEngine {
  private readonly pipeline: DefaultVerificationPipeline;

  constructor(config?: VerificationEngineConfig) {
    const runners = config?.runners ?? [
      new BuildRunner(),
      new TestRunner(),
      new LintRunner(),
      new CustomRunner(config?.customCheckHandler),
    ];
    this.pipeline = new DefaultVerificationPipeline(runners);
  }

  async verify(request: VerificationRequest): Promise<VerificationResult> {
    return this.pipeline.execute(request);
  }

  registerRunner(runner: VerificationRunner): void {
    this.pipeline.registerRunner(runner);
  }
}
