export class VerificationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'VerificationError';
    this.code = code;
  }
}

export class RunnerNotFoundError extends VerificationError {
  constructor(category: string) {
    super('RUNNER_NOT_FOUND', `No runner found for category: ${category}`);
  }
}

export class CheckTimeoutError extends VerificationError {
  constructor(checkId: string, timeoutMs: number) {
    super('CHECK_TIMEOUT', `Check ${checkId} timed out after ${timeoutMs}ms`);
  }
}
