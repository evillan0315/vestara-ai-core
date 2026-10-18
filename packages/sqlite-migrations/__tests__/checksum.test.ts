import { describe, expect, it } from 'vitest';
import { canonicalFingerprints, stepChecksum } from '../src/checksum';
import { fingerprint, makeStep } from './helpers';

describe('canonicalFingerprints', () => {
  it('sorts tables and columns so serialization is order-stable', () => {
    const forward = canonicalFingerprints([fingerprint('zeta', ['b', 'a']), fingerprint('alpha', ['y', 'x'])]);
    const reversed = canonicalFingerprints([fingerprint('alpha', ['x', 'y']), fingerprint('zeta', ['a', 'b'])]);

    expect(forward).toBe(reversed);
    expect(JSON.parse(forward)).toEqual([
      { table: 'alpha', columns: ['x', 'y'] },
      { table: 'zeta', columns: ['a', 'b'] },
    ]);
  });

  it('distinguishes different tables and columns', () => {
    expect(canonicalFingerprints([fingerprint('t', ['a'])])).not.toBe(canonicalFingerprints([fingerprint('t', ['b'])]));
    expect(canonicalFingerprints([fingerprint('t', ['a'])])).not.toBe(canonicalFingerprints([fingerprint('u', ['a'])]));
  });
});

describe('stepChecksum', () => {
  it('is deterministic and column-order independent', () => {
    const a = makeStep('agents.agent_type', [fingerprint('agents', ['id', 'agent_type'])]);
    const b = makeStep('agents.agent_type', [fingerprint('agents', ['agent_type', 'id'])]);

    expect(stepChecksum(a)).toBe(stepChecksum(b));
    expect(stepChecksum(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the step name changes', () => {
    const base = makeStep('step.one', [fingerprint('t', ['id'])]);
    const renamed = makeStep('step.two', [fingerprint('t', ['id'])]);
    expect(stepChecksum(base)).not.toBe(stepChecksum(renamed));
  });

  it('changes when a declared postcondition changes', () => {
    const base = makeStep('step.one', [fingerprint('t', ['id'])]);
    const widened = makeStep('step.one', [fingerprint('t', ['id', 'name'])]);
    expect(stepChecksum(base)).not.toBe(stepChecksum(widened));
  });
});
