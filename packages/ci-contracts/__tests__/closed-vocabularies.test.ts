/**
 * CI-OBS-001B — Closed vocabularies stay closed.
 *
 * Every vocabulary must be exactly the declared set. No additions, no removals.
 */
import { describe, expect, it } from 'vitest';
import { CI_CLASSIFICATIONS, TRANSIENT_CLASSIFICATIONS } from '../src/classification';
import { CI_CONCLUSIONS, COMPLETED_CONCLUSIONS, INCONCLUSIVE_CONCLUSIONS } from '../src/conclusion';
import { CI_FAILURE_EVIDENCE_KINDS } from '../src/evidence';
import { CI_FINDING_SEVERITIES, CI_FINDING_STATUSES } from '../src/finding';
import { CI_HYPOTHESIS_STATUSES } from '../src/hypothesis';
import { CI_OBSERVATION_STATUSES } from '../src/observation';
import { CI_STATUSES } from '../src/status';

describe('closed vocabularies', () => {
  it('CI_STATUSES is exactly discovered/queued/running/completed', () => {
    expect(CI_STATUSES).toEqual(['discovered', 'queued', 'running', 'completed']);
  });

  it('CI_CONCLUSIONS is exactly passed/failed/cancelled/timed_out/skipped/unknown', () => {
    expect(CI_CONCLUSIONS).toEqual(['passed', 'failed', 'cancelled', 'timed_out', 'skipped', 'unknown']);
  });

  it('COMPLETED_CONCLUSIONS and INCONCLUSIVE_CONCLUSIONS partition CI_CONCLUSIONS', () => {
    const all = [...COMPLETED_CONCLUSIONS, ...INCONCLUSIVE_CONCLUSIONS].sort();
    expect(all).toEqual([...CI_CONCLUSIONS].sort());
    // No overlap
    const overlap = COMPLETED_CONCLUSIONS.filter((c) => INCONCLUSIVE_CONCLUSIONS.includes(c));
    expect(overlap).toEqual([]);
  });

  it('CI_CLASSIFICATIONS is exactly 11 values', () => {
    expect(CI_CLASSIFICATIONS).toEqual([
      'CODE',
      'TEST',
      'BUILD',
      'CONTRACT',
      'CONFIGURATION',
      'DEPENDENCY',
      'INFRASTRUCTURE',
      'RESOURCE',
      'FLAKE',
      'CANCELLED',
      'UNKNOWN',
    ]);
  });

  it('TRANSIENT_CLASSIFICATIONS is a subset of CI_CLASSIFICATIONS', () => {
    for (const t of TRANSIENT_CLASSIFICATIONS) {
      expect(CI_CLASSIFICATIONS).toContain(t);
    }
  });

  it('CI_FAILURE_EVIDENCE_KINDS is exactly 7 values', () => {
    expect(CI_FAILURE_EVIDENCE_KINDS).toEqual([
      'log-excerpt',
      'error-message',
      'stack-trace',
      'test-output',
      'build-output',
      'screenshot',
      'artifact',
    ]);
  });

  it('CI_HYPOTHESIS_STATUSES is exactly 5 values', () => {
    expect(CI_HYPOTHESIS_STATUSES).toEqual(['proposed', 'investigating', 'confirmed', 'rejected', 'inconclusive']);
  });

  it('CI_FINDING_STATUSES is exactly 5 values', () => {
    expect(CI_FINDING_STATUSES).toEqual(['open', 'investigating', 'classified', 'rejected', 'superseded']);
  });

  it('CI_FINDING_SEVERITIES is exactly 4 values', () => {
    expect(CI_FINDING_SEVERITIES).toEqual(['critical', 'major', 'minor', 'info']);
  });

  it('CI_OBSERVATION_STATUSES is exactly 3 values', () => {
    expect(CI_OBSERVATION_STATUSES).toEqual(['captured', 'analyzed', 'superseded']);
  });
});
