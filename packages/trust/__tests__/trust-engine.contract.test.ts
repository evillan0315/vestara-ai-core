import { describe, expect, it } from 'vitest';
import { DefaultTrustEngine } from '../src/default-trust-engine';

describe('DefaultTrustEngine contract', () => {
  it('records an outcome and returns a snapshot for the source', () => {
    const engine = new DefaultTrustEngine();
    const snapshot = engine.recordVerificationOutcome({
      verificationResultId: 'vr-1',
      sourceId: 'repo-a',
      sourceType: 'repository',
      capability: 'build',
      status: 'passed',
      timestamp: new Date().toISOString(),
      totalChecks: 1,
      passedChecks: 1,
      failedChecks: 0,
      warningChecks: 0,
      categories: ['build'],
    });
    expect(snapshot.sourceId).toBe('repo-a');
    expect(engine.getTrustSnapshot('repo-a', 'repository')?.sourceId).toBe('repo-a');
  });
});
