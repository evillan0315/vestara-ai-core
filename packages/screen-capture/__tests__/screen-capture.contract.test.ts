import { describe, expect, it } from 'vitest';
import { evaluateCapturePermission, isTerminalState, scopeCapabilityFor, validateTarget } from '../src/index';

describe('screen capture contracts', () => {
  it('classifies terminal states and denies agent recording by default', () => {
    expect(isTerminalState('COMPLETED')).toBe(true);
    expect(isTerminalState('DENIED')).toBe(true);
    expect(evaluateCapturePermission('screen.capture.record', 'agent')).toBe('deny');
  });

  it('derives scope capabilities and validates targets', () => {
    expect(scopeCapabilityFor('display')).toBe('screen.capture.display');
    expect(validateTarget({ kind: 'display', displayId: '' } as never)).not.toHaveLength(0);
    expect(validateTarget({ kind: 'display', displayId: '0' } as never)).toHaveLength(0);
  });
});
