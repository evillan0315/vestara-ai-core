import { describe, expect, it } from 'vitest';
import { DefaultTrustEngine } from '../src/default-trust-engine';
import { DefaultTrustRepository } from '../src/repository/default-trust-repository';
import type { VerificationOutcome } from '../src/types/evidence';

function makeOutcome(overrides?: Partial<VerificationOutcome>): VerificationOutcome {
  return {
    verificationResultId: 'vr-1',
    sourceId: 'worker-1',
    sourceType: 'worker',
    capability: 'repository.commit',
    status: 'passed',
    timestamp: new Date().toISOString(),
    totalChecks: 10,
    passedChecks: 10,
    failedChecks: 0,
    warningChecks: 0,
    categories: ['build', 'test', 'lint'],
    ...overrides,
  };
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

describe('DefaultTrustEngine', () => {
  describe('Principle: Trust is derived, never authored', () => {
    it('produces a snapshot from a verification outcome', () => {
      const engine = new DefaultTrustEngine();
      const outcome = makeOutcome();
      const snapshot = engine.recordVerificationOutcome(outcome);

      expect(snapshot).toBeDefined();
      expect(snapshot.sourceId).toBe('worker-1');
      expect(snapshot.sourceType).toBe('worker');
      expect(snapshot.evidenceCount).toBe(1);
    });

    it('cannot set trust directly — no setTrustScore method exists', () => {
      const engine = new DefaultTrustEngine() as Record<string, unknown>;
      expect(typeof engine.recordVerificationOutcome).toBe('function');
      expect(typeof engine.getTrustSnapshot).toBe('function');
      expect(typeof (engine as Record<string, unknown>).setTrustScore).toBe('undefined');
    });
  });

  describe('Evidence accumulation', () => {
    it('accumulates evidence across multiple outcomes', () => {
      const engine = new DefaultTrustEngine();
      engine.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-1' }));
      engine.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-2' }));
      engine.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-3' }));

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker');
      expect(snapshot).toBeDefined();
      expect(snapshot!.evidenceCount).toBe(3);
    });

    it('produces separate snapshots for different sources', () => {
      const engine = new DefaultTrustEngine();
      engine.recordVerificationOutcome(makeOutcome({ sourceId: 'worker-1', verificationResultId: 'vr-1' }));
      engine.recordVerificationOutcome(makeOutcome({ sourceId: 'worker-2', verificationResultId: 'vr-2' }));

      const s1 = engine.getTrustSnapshot('worker-1', 'worker');
      const s2 = engine.getTrustSnapshot('worker-2', 'worker');

      expect(s1).toBeDefined();
      expect(s2).toBeDefined();
      expect(s1!.sourceId).toBe('worker-1');
      expect(s2!.sourceId).toBe('worker-2');
      expect(s1!.evidenceCount).toBe(1);
      expect(s2!.evidenceCount).toBe(1);
    });
  });

  describe('Principle: Trust is temporal', () => {
    it('returns neutral score for no evidence', () => {
      const engine = new DefaultTrustEngine();
      const snapshot = engine.getTrustSnapshot('unknown', 'worker');
      expect(snapshot).toBeUndefined();
    });

    it('recent passed outcomes dominate old failures', () => {
      const engine = new DefaultTrustEngine(undefined, {
        modelConfig: { decayRate: 0.1, decayUnit: 'day' },
      });

      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'old-fail',
          timestamp: daysAgo(30),
          status: 'failed',
        }),
      );
      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'recent-pass',
          timestamp: new Date().toISOString(),
          status: 'passed',
        }),
      );

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      // Recent pass dominates the old failure → score > 0.5
      expect(snapshot.overall.value).toBeGreaterThan(0.5);
    });

    it('recent failures dominate old passes', () => {
      const engine = new DefaultTrustEngine(undefined, {
        modelConfig: { decayRate: 0.1, decayUnit: 'day' },
      });

      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'old-pass',
          timestamp: daysAgo(30),
          status: 'passed',
        }),
      );
      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'recent-fail',
          timestamp: new Date().toISOString(),
          status: 'failed',
        }),
      );

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      // Recent failure dominates the old pass → score < 0.5
      expect(snapshot.overall.value).toBeLessThan(0.5);
    });
  });

  describe('Principle: Trust is multidimensional', () => {
    it('produces overall, reliability, and consistency scores', () => {
      const engine = new DefaultTrustEngine();
      engine.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-1' }));
      engine.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-2' }));
      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;

      expect(snapshot.overall).toBeDefined();
      expect(snapshot.overall.value).toBeGreaterThanOrEqual(0);
      expect(snapshot.overall.value).toBeLessThanOrEqual(1);

      expect(snapshot.dimensions.reliability).toBeDefined();
      expect(snapshot.dimensions.reliability.value).toBeGreaterThanOrEqual(0);
      expect(snapshot.dimensions.reliability.value).toBeLessThanOrEqual(1);

      expect(snapshot.dimensions.consistency).toBeDefined();
      expect(snapshot.dimensions.consistency.value).toBeGreaterThanOrEqual(0);
      expect(snapshot.dimensions.consistency.value).toBeLessThanOrEqual(1);
    });

    it('confidence increases with more evidence', () => {
      const engine = new DefaultTrustEngine();
      engine.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-1' }));

      const lowConf = engine.getTrustSnapshot('worker-1', 'worker')!.overall.confidence;

      for (let i = 0; i < 19; i++) {
        engine.recordVerificationOutcome(makeOutcome({ verificationResultId: `vr-${i + 2}` }));
      }

      const highConf = engine.getTrustSnapshot('worker-1', 'worker')!.overall.confidence;
      expect(highConf).toBeGreaterThan(lowConf);
    });
  });

  describe('Principle: Trust is evidence-based', () => {
    it('all-pass outcomes produce high trust', () => {
      const engine = new DefaultTrustEngine();
      for (let i = 0; i < 10; i++) {
        engine.recordVerificationOutcome(
          makeOutcome({
            verificationResultId: `vr-${i}`,
            status: 'passed',
          }),
        );
      }

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      expect(snapshot.dimensions.reliability.value).toBe(1);
    });

    it('all-fail outcomes produce low trust', () => {
      const engine = new DefaultTrustEngine();
      for (let i = 0; i < 10; i++) {
        engine.recordVerificationOutcome(
          makeOutcome({
            verificationResultId: `vr-${i}`,
            status: 'failed',
          }),
        );
      }

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      expect(snapshot.dimensions.reliability.value).toBe(0);
    });

    it('mixed outcomes produce intermediate trust', () => {
      const engine = new DefaultTrustEngine();
      for (let i = 0; i < 5; i++) {
        engine.recordVerificationOutcome(
          makeOutcome({
            verificationResultId: `vr-pass-${i}`,
            status: 'passed',
          }),
        );
      }
      for (let i = 0; i < 5; i++) {
        engine.recordVerificationOutcome(
          makeOutcome({
            verificationResultId: `vr-fail-${i}`,
            status: 'failed',
          }),
        );
      }

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      expect(snapshot.overall.value).toBeGreaterThan(0);
      expect(snapshot.overall.value).toBeLessThan(1);
    });

    it('each snapshot is traceable to verification result ids', () => {
      const engine = new DefaultTrustEngine();
      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'vr-trace-1',
        }),
      );

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      expect(snapshot.evidenceCount).toBe(1);
      expect(snapshot.id).toBeTruthy();
      expect(snapshot.computedAt).toBeTruthy();
    });
  });

  describe('Principle: Trust is contextual', () => {
    it('produces separate scores per capability', () => {
      const engine = new DefaultTrustEngine();
      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'vr-commit',
          capability: 'repository.commit',
          status: 'passed',
        }),
      );
      engine.recordVerificationOutcome(
        makeOutcome({
          verificationResultId: 'vr-review',
          capability: 'security.review',
          status: 'failed',
        }),
      );

      const snapshot = engine.getTrustSnapshot('worker-1', 'worker')!;
      expect(snapshot.byCapability['repository.commit']).toBeDefined();
      expect(snapshot.byCapability['security.review']).toBeDefined();

      expect(snapshot.byCapability['repository.commit'].value).toBeGreaterThan(
        snapshot.byCapability['security.review'].value,
      );
    });
  });

  describe('Repository isolation', () => {
    it('shared repository allows snapshot retrieval across engines', () => {
      const repo = new DefaultTrustRepository();
      const engine1 = new DefaultTrustEngine(repo);
      const engine2 = new DefaultTrustEngine(repo);

      engine1.recordVerificationOutcome(makeOutcome({ verificationResultId: 'vr-1' }));
      const snapshot = engine2.getTrustSnapshot('worker-1', 'worker')!;

      expect(snapshot.evidenceCount).toBe(1);
    });
  });
});
