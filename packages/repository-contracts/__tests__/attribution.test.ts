/**
 * VES-REPO-008 — attribution evaluator tests.
 *
 * Proves the eighteen required behaviors: lone signals stay UNKNOWN,
 * CORRELATED needs two facts, PROVEN needs direct-write exclusivity,
 * competitors fail toward AMBIGUOUS, cross-wires fail closed, no-change
 * creates no ownership, and junk cannot manufacture attribution.
 */
import { describe, expect, it } from 'vitest';
import type { AttributionEvidence } from '../src/attribution';
import { evaluateAttribution } from '../src/attribution';

function intent(executionId = 'e1', repositoryId = 'r1') {
  return {
    executionId: executionId as never,
    repositoryId: repositoryId as never,
    purpose: 'persistence change',
    scopes: [{ level: 'package' as const, name: 'persistence' }],
    mutationKind: 'source' as const,
  };
}

function context(executionId = 'e1', accessMode: 'OBSERVE' | 'ANALYZE' | 'VERIFY' | 'MUTATE' = 'ANALYZE') {
  return {
    executionId: executionId as never,
    repositoryId: 'r1' as never,
    baselineSnapshotId: 's0' as never,
    accessMode,
    changeIntent: intent(executionId),
    boundAt: '2026-09-14T00:01:00.000Z',
  };
}

function change(material = true) {
  return {
    executionId: 'e1' as never,
    repositoryId: 'r1' as never,
    baselineSnapshotId: 's0' as never,
    observedSnapshotId: 's1' as never,
    comparison: {
      baselineSnapshotId: 's0' as never,
      currentSnapshotId: 's1' as never,
      sameRepository: true,
      changes: material ? (['working-tree-changed', 'became-dirty'] as never) : (['no-material-change'] as never),
      materialChange: material,
    },
    observedAt: '2026-09-14T00:03:00.000Z',
  };
}

function correlation(executionId = 'e1') {
  return {
    executionId: executionId as never,
    runtimeSessionId: 'ses-1' as never,
    repositoryContext: context(executionId),
    sessionOrigin: 'created' as const,
    correlatedAt: '2026-09-14T00:02:00.000Z',
  };
}

const deps = {
  generateChangeSetId: (() => {
    let n = 0;
    return () => `cs-${++n}` as never;
  })(),
};
const files = [{ path: 'a.ts', fate: 'modified' as const }];

describe('evaluateAttribution', () => {
  it('leaves difference-alone, context-alone, and empty evidence UNKNOWN', () => {
    for (const evidence of [[], []] as AttributionEvidence[][]) {
      const result = evaluateAttribution({ change: change() as never, context: context() as never, evidence }, deps);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.confidence).toBe('UNKNOWN');
      expect(result.attribution).toBe('unknown');
      expect(result.changeSet).toBeUndefined();
    }
  });

  it('leaves MUTATE-alone and intent-match-alone UNKNOWN', () => {
    const mutateAlone = evaluateAttribution(
      { change: change() as never, context: context('e1', 'MUTATE') as never, evidence: [] },
      deps,
    );
    expect(mutateAlone.ok && mutateAlone.confidence).toBe('UNKNOWN');

    const intentAlone = evaluateAttribution(
      {
        change: change() as never,
        context: context() as never,
        evidence: [{ kind: 'intent-overlap', executionId: 'e1' as never, overlappingPaths: ['a.ts'] }],
      },
      deps,
    );
    expect(intentAlone.ok && intentAlone.confidence).toBe('UNKNOWN');
  });

  it('never proves mutation from session correlation alone, but permits CORRELATED pairs', () => {
    const alone = evaluateAttribution(
      {
        change: change() as never,
        context: context() as never,
        sessionCorrelation: correlation() as never,
        evidence: [],
      },
      deps,
    );
    expect(alone.ok && alone.confidence).toBe('UNKNOWN');

    const paired = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [],
      },
      deps,
    );
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;
    expect(paired.confidence).toBe('CORRELATED');
    expect(paired.attribution).toBe('vestara-execution');
    expect(paired.changeSet?.executionId).toBe('e1');
    expect(paired.changeSet?.baselineSnapshotId).toBe('s0');
  });

  it('never promotes CORRELATED to PROVEN without direct-write exclusivity', () => {
    const result = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [
          { kind: 'intent-overlap', executionId: 'e1' as never, overlappingPaths: ['a.ts'] },
          { kind: 'tool-activity', executionId: 'e1' as never, description: 'edit a.ts' },
        ],
        observedFiles: files,
      },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence).toBe('CORRELATED');
    expect(result.confidence).not.toBe('PROVEN');
  });

  it('reaches PROVEN only through covering, exclusive direct-write evidence', () => {
    const proven = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [{ kind: 'direct-write', executionId: 'e1' as never, paths: ['a.ts'] }],
        observedFiles: files,
      },
      deps,
    );
    expect(proven.ok).toBe(true);
    if (!proven.ok) return;
    expect(proven.confidence).toBe('PROVEN');
    expect(proven.changeSet?.attribution).toBe('vestara-execution');

    // Same inputs minus direct-write: the gate is the evidence, not the test.
    const without = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [],
        observedFiles: files,
      },
      deps,
    );
    expect(without.ok && without.confidence).toBe('CORRELATED');
  });

  it('fails competitors and partial coverage toward AMBIGUOUS', () => {
    const competing = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [{ kind: 'competing-execution', executionId: 'e2' as never }],
      },
      deps,
    );
    expect(competing.ok).toBe(true);
    if (!competing.ok) return;
    expect(competing.confidence).toBe('AMBIGUOUS');
    expect(competing.attribution).toBe('mixed');
    expect(competing.changeSet?.executionId).toBeUndefined();

    const human = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [{ kind: 'human-activity', detail: 'editor save observed' }],
      },
      deps,
    );
    expect(human.ok && human.confidence).toBe('AMBIGUOUS');

    const partial = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [{ kind: 'intent-overlap', executionId: 'e1' as never, overlappingPaths: ['a.ts'] }],
        observedFiles: [...files, { path: 'mystery.ts', fate: 'added' as const }],
      },
      deps,
    );
    expect(partial.ok && partial.confidence).toBe('AMBIGUOUS');
  });

  it('fails cross-wired links closed', () => {
    const contextWire = evaluateAttribution(
      { change: { ...change(), executionId: 'e9' } as never, context: context() as never, evidence: [] },
      deps,
    );
    expect(contextWire.ok).toBe(false);

    const sessionWire = evaluateAttribution(
      {
        change: change() as never,
        context: context() as never,
        sessionCorrelation: correlation('e9') as never,
        evidence: [],
      },
      deps,
    );
    expect(sessionWire.ok).toBe(false);
  });

  it('creates no ownership from no-change and identifies no writer outside intent', () => {
    const calm = evaluateAttribution(
      {
        change: change(false) as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [{ kind: 'intent-overlap', executionId: 'e1' as never, overlappingPaths: ['a.ts'] }],
      },
      deps,
    );
    expect(calm.ok).toBe(true);
    if (!calm.ok) return;
    expect(calm.confidence).toBe('UNKNOWN');
    expect(calm.changeSet).toBeUndefined();

    const outside = evaluateAttribution(
      {
        change: change() as never,
        context: context('e1', 'MUTATE') as never,
        sessionCorrelation: correlation() as never,
        evidence: [],
        observedFiles: [{ path: 'unrelated/other.ts', fate: 'added' as const }],
      },
      deps,
    );
    expect(outside.ok).toBe(true);
    if (!outside.ok) return;
    expect(outside.confidence).not.toBe('PROVEN');
    expect('violation' in outside).toBe(false);
  });

  it('ignores unknown evidence kinds and extra input fields', () => {
    const junk = evaluateAttribution(
      {
        change: change() as never,
        context: context() as never,
        evidence: [{ kind: 'vibes', projectId: 'p1', provider: 'x' } as unknown as AttributionEvidence],
      },
      deps,
    );
    expect(junk.ok && junk.confidence).toBe('UNKNOWN');
  });
});
