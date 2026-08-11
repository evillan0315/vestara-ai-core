import { describe, expect, it } from 'vitest';
import { ConfidenceEngine, type VerificationConfidence, type VerificationEvidenceBundle } from '../src';
import {
  checksById,
  evaluateCriterion,
  evidenceForChecks,
  findContradictions,
} from '../src/verifier/criterion-evaluator';
import { VerifierService } from '../src/verifier/verifier-service';
import type { VerifierCriterionSpec } from '../src/verifier/verifier-types';

function confidence(overrides: Partial<VerificationConfidence> = {}): VerificationConfidence {
  return {
    score: 0.95,
    level: 'very-high',
    factors: [],
    limitations: [],
    ...overrides,
  };
}

function bundle(overrides: Partial<VerificationEvidenceBundle> = {}): VerificationEvidenceBundle {
  return {
    id: 'bundle-exec-1',
    executionId: 'exec-1',
    taskId: 'task-1',
    verifierId: 'verifier-test',
    profileId: 'standard',
    manifestId: 'manifest-1',
    evidence: [],
    checks: [],
    replay: { mode: 'artifact', steps: [], requires: {} },
    confidence: confidence(),
    createdAt: '2026-08-08T00:00:00.000Z',
    ...overrides,
  };
}

function criterion(overrides: Partial<VerifierCriterionSpec> = {}): VerifierCriterionSpec {
  return {
    id: 'crit-1',
    description: 'Test criterion',
    required: true,
    ...overrides,
  };
}

describe('evaluateCriterion', () => {
  it('marks a required criterion satisfied when no constraints apply', () => {
    const result = evaluateCriterion(bundle(), criterion());
    expect(result.satisfied).toBe(true);
    expect(result.gaps).toEqual([]);
  });

  it('detects missing evidence kinds', () => {
    const result = evaluateCriterion(bundle(), criterion({ expectEvidenceKinds: ['screenshot'] }));
    expect(result.satisfied).toBe(false);
    expect(result.gaps.some((gap) => gap.includes('screenshot'))).toBe(true);
  });

  it('detects when minimum evidence count is not met', () => {
    const result = evaluateCriterion(bundle(), criterion({ minEvidenceCount: 3 }));
    expect(result.satisfied).toBe(false);
    expect(result.gaps.some((gap) => gap.includes('below minimum'))).toBe(true);
  });

  it('detects when required checks have not passed', () => {
    const result = evaluateCriterion(
      bundle({ checks: [{ checkId: 'chk-1', name: 'API', status: 'failed', summary: 'boom', evidenceRefs: [] }] }),
      criterion({ requireChecksPassed: ['chk-1'] }),
    );
    expect(result.satisfied).toBe(false);
    expect(result.gaps.some((gap) => gap.includes('chk-1'))).toBe(true);
  });

  it('detects when confidence is below minimum', () => {
    const result = evaluateCriterion(
      bundle({ confidence: confidence({ score: 0.3, level: 'low' }) }),
      criterion({ minConfidenceScore: 0.8 }),
    );
    expect(result.satisfied).toBe(false);
    expect(result.gaps.some((gap) => gap.includes('Confidence score'))).toBe(true);
  });
});

describe('findContradictions', () => {
  it('returns empty when no required checks failed', () => {
    const contradictions = findContradictions(
      bundle({ checks: [{ checkId: 'chk-1', name: 'API', status: 'passed', summary: 'ok', evidenceRefs: [] }] }),
      [criterion({ requireChecksPassed: ['chk-1'] })],
    );
    expect(contradictions).toEqual([]);
  });

  it('surfaces failed required checks as contradictions', () => {
    const contradictions = findContradictions(
      bundle({
        checks: [{ checkId: 'chk-1', name: 'UI behavior', status: 'failed', summary: 'invisible', evidenceRefs: [] }],
      }),
      [criterion({ id: 'c1', required: true, requireChecksPassed: ['chk-1'] })],
    );
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0]).toContain('UI behavior');
    expect(contradictions[0]).toContain('failed');
  });

  it('ignores failures on non-required criteria', () => {
    const contradictions = findContradictions(
      bundle({ checks: [{ checkId: 'chk-1', name: 'Optional', status: 'failed', summary: 'x', evidenceRefs: [] }] }),
      [criterion({ required: false, requireChecksPassed: ['chk-1'] })],
    );
    expect(contradictions).toEqual([]);
  });
});

describe('evidenceForChecks + checksById', () => {
  it('collects evidence referenced by specific checks', () => {
    const evidenceRefs = [
      {
        ref: 'digest-1',
        kind: 'screenshot' as const,
        mediaType: 'image/png',
        size: 10,
        summary: 'a',
        provenance: { producer: 'test', executionId: 'exec-1' },
      },
      {
        ref: 'digest-2',
        kind: 'command' as const,
        mediaType: 'text/plain',
        size: 5,
        summary: 'b',
        provenance: { producer: 'test', executionId: 'exec-1' },
      },
    ];
    const checks = [
      { checkId: 'chk-1', name: 'UI', status: 'passed' as const, summary: 'ok', evidenceRefs: ['digest-1'] },
    ];
    const result = evidenceForChecks(bundle({ evidence: evidenceRefs, checks }), ['chk-1']);
    expect(result).toHaveLength(1);
    expect(result[0].ref).toBe('digest-1');
  });

  it('builds a check-id lookup map', () => {
    const checks = [{ checkId: 'chk-1', name: 'API', status: 'passed' as const, summary: 'ok', evidenceRefs: [] }];
    const map = checksById(bundle({ checks }));
    expect(map.get('chk-1')?.name).toBe('API');
  });
});

describe('VerifierService.evaluate', () => {
  const service = new VerifierService({ now: () => '2026-08-08T00:00:00.000Z' });

  it('returns INDETERMINATE when no evidence or checks exist', () => {
    const verdict = service.evaluate(bundle(), [criterion()], 'Empty claim');
    expect(verdict.status).toBe('INDETERMINATE');
  });

  it('returns VERIFIED when all criteria are satisfied', () => {
    const verdict = service.evaluate(
      bundle({
        evidence: [
          {
            ref: 'd1',
            kind: 'screenshot',
            mediaType: 'image/png',
            size: 1,
            summary: 'shot',
            provenance: { producer: 'test', executionId: 'exec-1' },
          },
        ],
        checks: [{ checkId: 'chk-1', name: 'API', status: 'passed', summary: 'ok', evidenceRefs: ['d1'] }],
        confidence: confidence({ score: 0.95, level: 'very-high' }),
      }),
      [criterion({ expectEvidenceKinds: ['screenshot'], requireChecksPassed: ['chk-1'], minConfidenceScore: 0.9 })],
      'Agent creation works',
    );
    expect(verdict.status).toBe('VERIFIED');
    expect(verdict.criteria[0].satisfied).toBe(true);
  });

  it('returns FAILED when a required criterion has explicit contradictions', () => {
    const verdict = service.evaluate(
      bundle({
        evidence: [
          {
            ref: 'd1',
            kind: 'screenshot',
            mediaType: 'image/png',
            size: 1,
            summary: 'shot',
            provenance: { producer: 'test', executionId: 'exec-1' },
          },
        ],
        checks: [
          {
            checkId: 'chk-1',
            name: 'UI behavior',
            status: 'failed',
            summary: 'invisible in normal state',
            evidenceRefs: ['d1'],
          },
        ],
        confidence: confidence({ score: 0.4, level: 'low' }),
      }),
      [criterion({ requireChecksPassed: ['chk-1'] })],
      'Phase 1 verified',
    );
    expect(verdict.status).toBe('FAILED');
    expect(verdict.contradictions.length).toBeGreaterThan(0);
  });

  it('returns UNVERIFIED when a required criterion has gaps but no contradiction', () => {
    const verdict = service.evaluate(
      bundle({
        evidence: [],
        checks: [{ checkId: 'chk-1', name: 'API', status: 'passed', summary: 'ok', evidenceRefs: [] }],
        confidence: confidence({ score: 0.6, level: 'moderate' }),
      }),
      [criterion({ minEvidenceCount: 5, requireChecksPassed: ['chk-1'] })],
      'Persistence claim',
    );
    expect(verdict.status).toBe('UNVERIFIED');
    expect(verdict.gaps.length).toBeGreaterThan(0);
  });

  it('returns UNVERIFIED when only non-required criteria fail', () => {
    const verdict = service.evaluate(
      bundle({
        evidence: [
          {
            ref: 'd1',
            kind: 'command',
            mediaType: 'text/plain',
            size: 1,
            summary: 'run',
            provenance: { producer: 'test', executionId: 'exec-1' },
          },
        ],
        checks: [],
        confidence: confidence({ score: 0.95, level: 'very-high' }),
      }),
      [criterion({ required: false, minEvidenceCount: 5 })],
      'Nice-to-have evidence',
    );
    expect(verdict.status).toBe('UNVERIFIED');
  });

  it('includes reasoning summarizing the verdict', () => {
    const verdict = service.evaluate(
      bundle({
        evidence: [
          {
            ref: 'd1',
            kind: 'command',
            mediaType: 'text/plain',
            size: 1,
            summary: 'run',
            provenance: { producer: 'test', executionId: 'exec-1' },
          },
        ],
        checks: [],
        confidence: confidence(),
      }),
      [criterion({ expectEvidenceKinds: ['command'] })],
      'Command runs',
    );
    expect(verdict.reasoning).toContain('VERIFIED');
    expect(verdict.reasoning).toContain('very-high');
  });

  it('preserves the bundle confidence on the verdict', () => {
    const verdict = service.evaluate(
      bundle({ confidence: confidence({ score: 0.82, level: 'high' }) }),
      [criterion()],
      'Claim',
    );
    expect(verdict.confidence.score).toBe(0.82);
    expect(verdict.confidence.level).toBe('high');
  });
});

describe('VerifierService.applyOverride', () => {
  const service = new VerifierService({ now: () => '2026-08-08T00:00:00.000Z' });
  const verdict = service.evaluate(bundle(), [criterion()], 'Claim');

  it('preserves the original verdict unchanged', () => {
    const withOverride = service.applyOverride(verdict, {
      decision: 'PROCEED',
      reason: 'Accept known risk',
      decidedBy: 'director-1',
    });
    expect(withOverride.verdict).toBe(verdict);
    expect(withOverride.verdict.status).toBe('INDETERMINATE');
  });

  it('records a PROCEED override with effective decision', () => {
    const withOverride = service.applyOverride(verdict, {
      decision: 'PROCEED',
      reason: 'Accept known risk',
      decidedBy: 'director-1',
    });
    expect(withOverride.override?.decision).toBe('PROCEED');
    expect(withOverride.override?.reason).toBe('Accept known risk');
    expect(withOverride.override?.decidedBy).toBe('director-1');
    expect(withOverride.effectiveDecision).toBe('PROCEEDING_BY_OVERRIDE');
  });

  it('records a REJECT override with effective decision', () => {
    const withOverride = service.applyOverride(verdict, {
      decision: 'REJECT',
      reason: 'Insufficient evidence',
      decidedBy: 'director-1',
    });
    expect(withOverride.effectiveDecision).toBe('REJECTED_BY_OVERRIDE');
  });
});

describe('VerifierService.reverify', () => {
  const service = new VerifierService({ now: () => '2026-08-08T00:00:00.000Z' });
  const prior = service.evaluate(bundle(), [criterion()], 'Claim');

  it('produces a fresh verdict referencing the prior one', () => {
    const fresh = service.reverify(
      bundle({
        evidence: [
          {
            ref: 'd1',
            kind: 'command',
            mediaType: 'text/plain',
            size: 1,
            summary: 'run',
            provenance: { producer: 'test', executionId: 'exec-1' },
          },
        ],
        checks: [],
        confidence: confidence(),
      }),
      [criterion({ expectEvidenceKinds: ['command'] })],
      'Claim',
      prior,
    );
    expect(fresh.id).not.toBe(prior.id);
    expect(fresh.previousVerdictId).toBe(prior.id);
    expect(fresh.status).toBe('VERIFIED');
  });

  it('does not mutate the prior verdict', () => {
    const priorStatus = prior.status;
    service.reverify(bundle(), [criterion()], 'Claim', prior);
    expect(prior.status).toBe(priorStatus);
  });
});

describe('VerifierService.redactForTransport', () => {
  const service = new VerifierService({ now: () => '2026-08-08T00:00:00.000Z' });

  it('redacts secrets embedded in reasoning', () => {
    const verdict = service.evaluate(bundle(), [criterion()], 'Claim');
    const withSecret = { ...verdict, reasoning: 'Token sk-abc123def456ghi789jkl012mno345pqr found' };
    const redacted = service.redactForTransport(withSecret);
    expect(redacted.reasoning).toContain('[REDACTED]');
    expect(redacted.reasoning).not.toContain('sk-abc');
  });

  it('preserves verdict structure', () => {
    const verdict = service.evaluate(bundle(), [criterion()], 'Claim');
    const redacted = service.redactForTransport(verdict);
    expect(redacted.status).toBe(verdict.status);
    expect(redacted.criteria).toEqual(verdict.criteria);
  });
});

describe('ConfidenceEngine (PCS-026)', () => {
  it('computes a product of six factors', () => {
    const engine = new ConfidenceEngine();
    const result = engine.compute({
      checks: [
        { checkId: 'c1', name: 'API', status: 'passed', summary: 'ok', evidenceRefs: ['d1'] },
        { checkId: 'c2', name: 'UI', status: 'passed', summary: 'ok', evidenceRefs: ['d2'] },
      ],
      evidenceCount: 2,
      distinctEvidenceRefs: 2,
      replayableCount: 2,
      createdAt: new Date().toISOString(),
      profileChecksExpected: 2,
    });
    expect(result.factors).toHaveLength(6);
    expect(result.score).toBeGreaterThan(0);
    expect(result.level).toBe('very-high');
  });

  it('surfaces limitations when evidence is missing', () => {
    const engine = new ConfidenceEngine();
    const result = engine.compute({
      checks: [],
      evidenceCount: 0,
      distinctEvidenceRefs: 0,
      replayableCount: 0,
      createdAt: new Date().toISOString(),
    });
    expect(result.limitations).toContain('no verification checks ran');
    expect(result.limitations).toContain('no content-addressed evidence collected');
    expect(result.level).toBe('low');
  });
});
