import type { VerificationCheckRequest, VerificationRunner } from '../types';
import { RunnerNotFoundError } from '../types/errors';

export class RunnerRegistry {
  private readonly runners = new Map<string, VerificationRunner>();

  register(runner: VerificationRunner): void {
    this.runners.set(runner.id, runner);
  }

  unregister(id: string): void {
    this.runners.delete(id);
  }

  findRunner(check: VerificationCheckRequest): VerificationRunner {
    const runners = Array.from(this.runners.values());
    const matched = runners.find((r) => r.supportedCategories.includes(check.category));
    if (!matched) {
      throw new RunnerNotFoundError(check.category);
    }
    return matched;
  }

  list(): readonly VerificationRunner[] {
    return Array.from(this.runners.values());
  }
}
