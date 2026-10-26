import { describe, expect, it } from 'vitest';
import { DefaultVerificationEngine } from '../src/default-verification-engine';
import type { VerificationRunner } from '../src/types';

const passingRunner: VerificationRunner = {
  id: 'fake',
  name: 'fake',
  supportedCategories: ['custom'],
  async execute(check) {
    return {
      checkId: check.id,
      name: check.name,
      category: check.category,
      status: 'passed',
      evidence: [],
      summary: 'ok',
      durationMs: 1,
    };
  },
};

describe('DefaultVerificationEngine contract', () => {
  it('executes a custom runner and returns a result', async () => {
    const engine = new DefaultVerificationEngine({ runners: [passingRunner] });
    const result = await engine.verify({
      id: 'req-1',
      jobId: 'job-1',
      checks: [{ id: 'c1', name: 'custom check', category: 'custom' }],
    });
    expect(result.requestId).toBe('req-1');
    expect(result.checkResults).toHaveLength(1);
    expect(result.checkResults[0].status).toBe('passed');
  });
});
