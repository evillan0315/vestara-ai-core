/**
 * WFO-E2E deterministic clock and identity generation.
 *
 * Every scenario uses sequential, deterministic timestamps and ids so event
 * ordering and replay assertions never depend on wall-clock time.
 */

export class DeterministicWorkflowClock {
  private cursor = 0;

  constructor(
    private readonly start: string = '2026-08-06T00:00:00.000Z',
    private readonly stepMs = 1_000,
  ) {}

  now(): string {
    const time = new Date(this.start).getTime() + this.cursor * this.stepMs;
    this.cursor += 1;
    return new Date(time).toISOString();
  }
}

export class DeterministicIdGenerator {
  private counter = 0;

  next(prefix = 'id'): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }
}
