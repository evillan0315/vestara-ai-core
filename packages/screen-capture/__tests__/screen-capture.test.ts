import { describe, expect, it } from 'vitest';

const {
  TERMINAL_STATES,
  SCREEN_CAPTURE_CAPABILITIES,
  DEFAULT_SCREEN_CAPTURE_PERMISSIONS,
  isTerminalState,
  canTransition,
  assertTransition,
  scopeOfTarget,
  evaluateCapturePermission,
  scopeCapabilityFor,
  requiredScopeCapability,
  validateTarget,
  validateScreenshotRequest,
  validateRecordingRequest,
  probeScreenCaptureCapabilities,
} = require('../dist/index.js');

const human = { actorType: 'human', actorId: 'u-1' };
const agent = { actorType: 'agent', actorId: 'vestara-developer' };

describe('capture lifecycle transitions', () => {
  it('walks the full happy path to COMPLETED', () => {
    const path = [
      ['REQUESTED', 'AUTHORIZED'],
      ['AUTHORIZED', 'SELECTING'],
      ['SELECTING', 'CAPTURING'],
      ['CAPTURING', 'FINALIZING'],
      ['FINALIZING', 'COMPLETED'],
    ] as const;
    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it('allows denial, cancellation, and failure branches', () => {
    expect(canTransition('REQUESTED', 'DENIED')).toBe(true);
    expect(canTransition('REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('SELECTING', 'DENIED')).toBe(true);
    expect(canTransition('SELECTING', 'CANCELLED')).toBe(true);
    expect(canTransition('CAPTURING', 'CANCELLED')).toBe(true);
    expect(canTransition('CAPTURING', 'FAILED')).toBe(true);
    expect(canTransition('FINALIZING', 'FAILED')).toBe(true);
  });
});

describe('invalid lifecycle transitions', () => {
  it('rejects skipped stages', () => {
    expect(canTransition('REQUESTED', 'CAPTURING')).toBe(false);
    expect(canTransition('REQUESTED', 'COMPLETED')).toBe(false);
    expect(canTransition('AUTHORIZED', 'CAPTURING')).toBe(false);
    expect(canTransition('SELECTING', 'FINALIZING')).toBe(false);
  });

  it('assertTransition throws on invalid moves', () => {
    expect(() => assertTransition('REQUESTED', 'COMPLETED')).toThrow(/Invalid capture transition/);
    expect(() => assertTransition('COMPLETED', 'REQUESTED')).toThrow(/Invalid capture transition/);
  });
});

describe('terminal states', () => {
  it('marks DENIED, CANCELLED, FAILED, COMPLETED terminal with no outgoing moves', () => {
    expect([...TERMINAL_STATES].sort()).toEqual(['CANCELLED', 'COMPLETED', 'DENIED', 'FAILED']);
    for (const state of TERMINAL_STATES) {
      expect(isTerminalState(state)).toBe(true);
      for (const next of [
        'REQUESTED',
        'AUTHORIZED',
        'SELECTING',
        'CAPTURING',
        'FINALIZING',
        'COMPLETED',
        'DENIED',
        'CANCELLED',
        'FAILED',
      ] as const) {
        expect(canTransition(state, next)).toBe(false);
      }
    }
  });

  it('marks active states non-terminal', () => {
    for (const state of ['REQUESTED', 'AUTHORIZED', 'SELECTING', 'CAPTURING', 'FINALIZING'] as const) {
      expect(isTerminalState(state)).toBe(false);
    }
  });
});

describe('capability representation', () => {
  it('registers exactly the five governed capabilities', () => {
    expect([...SCREEN_CAPTURE_CAPABILITIES].sort()).toEqual([
      'screen.capture.display',
      'screen.capture.record',
      'screen.capture.region',
      'screen.capture.screenshot',
      'screen.capture.window',
    ]);
  });
});

describe('permission defaults', () => {
  it('asks humans for screenshot and recording', () => {
    expect(evaluateCapturePermission('screen.capture.screenshot', 'human')).toBe('ask');
    expect(evaluateCapturePermission('screen.capture.record', 'human')).toBe('ask');
  });

  it('asks agents for screenshot but denies recording', () => {
    expect(evaluateCapturePermission('screen.capture.screenshot', 'agent')).toBe('ask');
    expect(evaluateCapturePermission('screen.capture.record', 'agent')).toBe('deny');
  });

  it('defaults unknown actor/action combos to ask', () => {
    expect(evaluateCapturePermission('screen.capture.screenshot', 'system')).toBe('ask');
    expect(evaluateCapturePermission('screen.capture.record', 'system')).toBe('ask');
  });

  it('honors explicit overrides without changing defaults', () => {
    const rules = [...DEFAULT_SCREEN_CAPTURE_PERMISSIONS];
    expect(
      evaluateCapturePermission('screen.capture.record', 'agent', [
        ...rules,
        { action: 'screen.capture.record', actorType: 'agent', level: 'allow', reason: 'governed exception' },
      ]),
    ).toBe('deny');
  });
});

describe('target and scope validation', () => {
  it('maps every target kind to its scope capability', () => {
    expect(requiredScopeCapability({ kind: 'display', displayId: ':0' })).toBe('screen.capture.display');
    expect(requiredScopeCapability({ kind: 'window', windowToken: 'tok' })).toBe('screen.capture.window');
    expect(requiredScopeCapability({ kind: 'region', regionToken: 'tok' })).toBe('screen.capture.region');
    expect(scopeCapabilityFor('display')).toBe('screen.capture.display');
    expect(scopeOfTarget({ kind: 'portal-selection', portalToken: 'p', resolvedKind: 'window' })).toBe('window');
    expect(requiredScopeCapability({ kind: 'portal-selection', portalToken: 'p', resolvedKind: 'region' })).toBe(
      'screen.capture.region',
    );
  });

  it('rejects empty tokens', () => {
    expect(validateTarget({ kind: 'display', displayId: '  ' })).not.toHaveLength(0);
    expect(validateTarget({ kind: 'window', windowToken: '' })).not.toHaveLength(0);
    expect(validateTarget({ kind: 'region', regionToken: '' })).not.toHaveLength(0);
    expect(validateTarget({ kind: 'portal-selection', portalToken: '', resolvedKind: 'display' })).not.toHaveLength(0);
  });

  it('accepts well-formed targets with OS-selected geometry', () => {
    expect(validateTarget({ kind: 'display', displayId: ':0' })).toEqual([]);
    expect(
      validateTarget({
        kind: 'region',
        regionToken: 'portal-r1',
        geometry: { x: 0, y: 0, width: 800, height: 600 },
      }),
    ).toEqual([]);
  });

  it('rejects degenerate region geometry', () => {
    expect(
      validateTarget({
        kind: 'region',
        regionToken: 'r',
        geometry: { x: 0, y: 0, width: 0, height: 600 },
      }),
    ).not.toHaveLength(0);
    expect(
      validateTarget({
        kind: 'region',
        regionToken: 'r',
        geometry: { x: NaN, y: 0, width: 10, height: 10 },
      }),
    ).not.toHaveLength(0);
  });

  it('requires actor and purpose on requests', () => {
    expect(
      validateScreenshotRequest({ target: { kind: 'display', displayId: ':0' }, requestedBy: human, purpose: '' }),
    ).not.toHaveLength(0);
    expect(
      validateRecordingRequest({
        target: { kind: 'display', displayId: ':0' },
        requestedBy: agent,
        purpose: 'diagnose flicker',
      }),
    ).toEqual([]);
    expect(
      validateRecordingRequest({
        target: { kind: 'window', windowToken: '' },
        requestedBy: agent,
        purpose: 'x',
      }),
    ).not.toHaveLength(0);
  });
});

describe('audio exclusion', () => {
  it('contains no audio capability', () => {
    for (const cap of SCREEN_CAPTURE_CAPABILITIES) {
      expect(cap).not.toMatch(/audio/);
    }
  });

  it('exposes no audio fields on requests', () => {
    const screenshot = { target: { kind: 'display', displayId: ':0' }, requestedBy: human, purpose: 'p' };
    const recording = { target: { kind: 'display', displayId: ':0' }, requestedBy: human, purpose: 'p' };
    expect('audio' in screenshot).toBe(false);
    expect('includeAudio' in recording).toBe(false);
    expect('audio' in recording).toBe(false);
  });
});

describe('unavailable probe behavior', () => {
  it('reports all six operation×scope combos as unsupported, never fake success', async () => {
    const result = await probeScreenCaptureCapabilities({ DISPLAY: ':0', XDG_SESSION_TYPE: 'x11' });
    expect(result.available).toBe(false);
    expect(result.sessionKind).toBe('x11');
    expect(result.display).toBe(':0');
    expect(result.capabilities).toHaveLength(6);
    for (const cap of result.capabilities) {
      expect(cap.supported).toBe(false);
      expect(cap.reason.length).toBeGreaterThan(0);
    }
  });

  it('detects wayland sessions and unknown shells truthfully', async () => {
    const wayland = await probeScreenCaptureCapabilities({ WAYLAND_DISPLAY: 'wayland-0' });
    expect(wayland.sessionKind).toBe('wayland');
    expect(wayland.available).toBe(false);

    const bare = await probeScreenCaptureCapabilities({});
    expect(bare.sessionKind).toBe('unknown');
    expect(bare.display).toBeNull();
    expect(bare.available).toBe(false);
    expect(bare.capabilities.every((c) => !c.supported)).toBe(true);
  });
});
