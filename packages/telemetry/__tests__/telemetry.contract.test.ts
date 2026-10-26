import { describe, expect, it } from 'vitest';
import { TelemetryRuntime } from '../src/index';

describe('TelemetryRuntime contract', () => {
  it('tracks events, notifies subscribers, and snapshots', () => {
    const runtime = new TelemetryRuntime();
    const seen: string[] = [];
    const unsubscribe = runtime.subscribe((event) => {
      seen.push(event.task);
    });
    runtime.track({
      agent: 'planner',
      timestamp: new Date().toISOString(),
      type: 'task',
      status: 'running',
      operation: 'plan',
      task: 'draft plan',
      progress: 0.5,
      phase: 'execute',
      detail: 'working',
    } as never);
    expect(seen).toEqual(['draft plan']);
    expect(runtime.snapshot().eventCount).toBe(1);
    unsubscribe();
    runtime.reset();
    expect(runtime.snapshot().eventCount).toBe(0);
  });
});
