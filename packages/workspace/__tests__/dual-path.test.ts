import { describe, expect, it } from 'vitest';
import { type BehaviorReport, compareBehavior, diffChangedFiles, terminalEquivalent } from '../src/dual-path.js';

function report(overrides: Partial<BehaviorReport> = {}): BehaviorReport {
  return {
    engine: 'harness',
    scenario: 'scenario',
    status: 'completed',
    operations: ['filesystem.write'],
    changedFiles: ['a.txt'],
    verification: { outcome: 'passed', confidence: 0.95 },
    eventCount: 10,
    durationMs: 100,
    tokens: { prompt: 10, completion: 5, total: 15 },
    output: 'done',
    ...overrides,
  };
}

describe('dual-path validation (post-migration)', () => {
  it('terminal statuses normalize equivalently across engines', () => {
    expect(terminalEquivalent('completed')).toBe('completed');
    expect(terminalEquivalent('failed')).toBe('failed');
    expect(terminalEquivalent('blocked')).toBe('blocked');
    expect(terminalEquivalent('awaiting-approval')).toBe('blocked');
    expect(terminalEquivalent('cancelled')).toBe('cancelled');
    expect(terminalEquivalent('passed')).toBe('completed');
  });

  it('diffChangedFiles reports only files added or changed', () => {
    expect(diffChangedFiles(['a.txt', 'b.txt'], ['a.txt', 'b.txt', 'c.txt'])).toEqual(['c.txt']);
    expect(diffChangedFiles([], ['a.txt', 'a.txt', 'b.txt'])).toEqual(['a.txt', 'b.txt']);
  });

  it('declares a harness run behaviorally compatible with an expected reference', () => {
    const reference: BehaviorReport = report({
      engine: 'legacy-orchestrator',
      operations: ['filesystem.create'],
      verification: null,
      eventCount: 0,
      output: 'legacy output',
    });
    const harness = report({ engine: 'harness', operations: ['filesystem.write'] });
    const comparison = compareBehavior(reference, harness);
    expect(comparison.compatible).toBe(true);
    expect(comparison.dimensions.every((d) => d.verdict !== 'mismatch')).toBe(true);
    expect(comparison.summary).toContain('behaviorally compatible');
  });

  it('flags a changed-file divergence as a hard mismatch', () => {
    const reference = report({ engine: 'legacy-orchestrator', changedFiles: ['a.txt'] });
    const harness = report({ engine: 'harness', changedFiles: ['b.txt'] });
    const comparison = compareBehavior(reference, harness);
    expect(comparison.compatible).toBe(false);
    expect(comparison.dimensions.find((d) => d.dimension === 'changed files')?.verdict).toBe('mismatch');
  });

  it('flags a terminal-status divergence as a hard mismatch', () => {
    const reference = report({ engine: 'legacy-orchestrator', status: 'completed' });
    const harness = report({ engine: 'harness', status: 'failed' });
    const comparison = compareBehavior(reference, harness);
    expect(comparison.compatible).toBe(false);
    expect(comparison.dimensions.find((d) => d.dimension === 'terminal status')?.verdict).toBe('mismatch');
  });
});
