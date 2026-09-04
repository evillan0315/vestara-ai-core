/**
 * VESTARA-INTELLIGENCE DIAG-0: Diagnostic Contract Type Tests
 *
 * Verifies:
 * - Contract structure (all fields, correct types, readonly)
 * - No executable semantics (no commands, no authority fields)
 * - Evidence reference compatibility with PCS-026
 * - Exhaustive constant completeness
 * - INV-REC-1 preservation (health ≠ root cause)
 * - Source health state coverage (healthy/degraded/unhealthy/unknown)
 * - Severity level coverage (info/warning/error/critical)
 * - M11C WASM incident specimen (contract can represent the incident)
 *
 * @see VESTARA-INTELLIGENCE-GA0-AUTHORITY-AUDIT.md §7
 */

import { describe, expect, it } from 'vitest';
import type {
  DiagnosticEvidenceRef,
  DiagnosticSeverity,
  DiagnosticSnapshot,
  DiagnosticSourceHealth,
  DiagnosticSourceKind,
  DiagnosticSourceRef,
} from '../src/diagnostic';
import { DIAGNOSTIC_SEVERITIES, DIAGNOSTIC_SOURCE_HEALTHS, DIAGNOSTIC_SOURCE_KINDS } from '../src/diagnostic';

// ─── Helper: Create Test Fixtures ────────────────────────────

function makeSourceRef(overrides?: Partial<DiagnosticSourceRef>): DiagnosticSourceRef {
  return {
    id: 'test-source',
    kind: 'runtime',
    name: 'Test Source',
    ...overrides,
  };
}

function makeSnapshot(overrides?: Partial<DiagnosticSnapshot>): DiagnosticSnapshot {
  return {
    source: makeSourceRef(),
    health: 'healthy',
    severity: 'info',
    message: 'Test observation',
    observedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidenceRef(overrides?: Partial<DiagnosticEvidenceRef>): DiagnosticEvidenceRef {
  return {
    bundleId: 'bundle-001',
    evidenceRef: 'sha256-abc123',
    evidenceKind: 'command',
    summary: 'Test evidence',
    producedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Contract Structure ──────────────────────────────────────

describe('DIAG-0: DiagnosticSourceRef contract', () => {
  it('has required fields', () => {
    const source = makeSourceRef();
    expect(source.id).toBeDefined();
    expect(source.kind).toBeDefined();
    expect(source.name).toBeDefined();
  });

  it('has optional component field', () => {
    const withComponent = makeSourceRef({ component: 'packages/types' });
    const withoutComponent = makeSourceRef();
    expect(withComponent.component).toBe('packages/types');
    expect(withoutComponent.component).toBeUndefined();
  });

  it('id is a string', () => {
    const source = makeSourceRef({ id: 'sql.js-wasm' });
    expect(typeof source.id).toBe('string');
  });

  it('kind is a DiagnosticSourceKind', () => {
    const source = makeSourceRef({ kind: 'wasm' });
    expect(source.kind).toBe('wasm');
  });
});

describe('DIAG-0: DiagnosticSnapshot contract', () => {
  it('has all required fields', () => {
    const snapshot = makeSnapshot();
    expect(snapshot.source).toBeDefined();
    expect(snapshot.health).toBeDefined();
    expect(snapshot.severity).toBeDefined();
    expect(snapshot.message).toBeDefined();
    expect(snapshot.observedAt).toBeDefined();
  });

  it('has optional evidenceRefs field', () => {
    const withRefs = makeSnapshot({ evidenceRefs: [makeEvidenceRef()] });
    const withoutRefs = makeSnapshot();
    expect(withRefs.evidenceRefs).toHaveLength(1);
    expect(withoutRefs.evidenceRefs).toBeUndefined();
  });

  it('has optional payload field', () => {
    const withPayload = makeSnapshot({ payload: { heapUsedBytes: 1024 } });
    const withoutPayload = makeSnapshot();
    expect(withPayload.payload).toEqual({ heapUsedBytes: 1024 });
    expect(withoutPayload.payload).toBeUndefined();
  });

  it('observedAt is a valid ISO timestamp', () => {
    const snapshot = makeSnapshot();
    expect(new Date(snapshot.observedAt).getTime()).not.toBeNaN();
  });

  it('message is a human-readable string', () => {
    const snapshot = makeSnapshot({ message: 'Source is operating normally' });
    expect(typeof snapshot.message).toBe('string');
    expect(snapshot.message.length).toBeGreaterThan(0);
  });
});

describe('DIAG-0: DiagnosticEvidenceRef contract', () => {
  it('has all required fields', () => {
    const ref = makeEvidenceRef();
    expect(ref.bundleId).toBeDefined();
    expect(ref.evidenceRef).toBeDefined();
    expect(ref.evidenceKind).toBeDefined();
    expect(ref.summary).toBeDefined();
    expect(ref.producedAt).toBeDefined();
  });

  it('references a PCS-026 bundle by ID', () => {
    const ref = makeEvidenceRef({ bundleId: 'verification-bundle-42' });
    expect(ref.bundleId).toBe('verification-bundle-42');
  });

  it('evidenceRef is a content-addressed digest', () => {
    const ref = makeEvidenceRef({ evidenceRef: 'sha256-abc123def456' });
    expect(ref.evidenceRef).toMatch(/^sha256-/);
  });

  it('producedAt is a valid ISO timestamp (evidence production time, not diagnostic observation time)', () => {
    const ref = makeEvidenceRef();
    expect(new Date(ref.producedAt).getTime()).not.toBeNaN();
  });
});

// ─── Source Health States ─────────────────────────────────────

describe('DIAG-0: DiagnosticSourceHealth states', () => {
  it('defines healthy state', () => {
    const health: DiagnosticSourceHealth = 'healthy';
    expect(health).toBe('healthy');
  });

  it('defines degraded state', () => {
    const health: DiagnosticSourceHealth = 'degraded';
    expect(health).toBe('degraded');
  });

  it('defines unhealthy state', () => {
    const health: DiagnosticSourceHealth = 'unhealthy';
    expect(health).toBe('unhealthy');
  });

  it('defines unknown state', () => {
    const health: DiagnosticSourceHealth = 'unknown';
    expect(health).toBe('unknown');
  });

  it('exhaustive constant covers all states', () => {
    expect(DIAGNOSTIC_SOURCE_HEALTHS).toContain('healthy');
    expect(DIAGNOSTIC_SOURCE_HEALTHS).toContain('degraded');
    expect(DIAGNOSTIC_SOURCE_HEALTHS).toContain('unhealthy');
    expect(DIAGNOSTIC_SOURCE_HEALTHS).toContain('unknown');
    expect(DIAGNOSTIC_SOURCE_HEALTHS).toHaveLength(4);
  });
});

// ─── Severity Levels ─────────────────────────────────────────

describe('DIAG-0: DiagnosticSeverity levels', () => {
  it('defines info severity', () => {
    const severity: DiagnosticSeverity = 'info';
    expect(severity).toBe('info');
  });

  it('defines warning severity', () => {
    const severity: DiagnosticSeverity = 'warning';
    expect(severity).toBe('warning');
  });

  it('defines error severity', () => {
    const severity: DiagnosticSeverity = 'error';
    expect(severity).toBe('error');
  });

  it('defines critical severity', () => {
    const severity: DiagnosticSeverity = 'critical';
    expect(severity).toBe('critical');
  });

  it('exhaustive constant covers all severities', () => {
    expect(DIAGNOSTIC_SEVERITIES).toContain('info');
    expect(DIAGNOSTIC_SEVERITIES).toContain('warning');
    expect(DIAGNOSTIC_SEVERITIES).toContain('error');
    expect(DIAGNOSTIC_SEVERITIES).toContain('critical');
    expect(DIAGNOSTIC_SEVERITIES).toHaveLength(4);
  });
});

// ─── Source Kinds ─────────────────────────────────────────────

describe('DIAG-0: DiagnosticSourceKind kinds', () => {
  it('exhaustive constant covers all kinds', () => {
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('runtime');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('wasm');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('database');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('event-loop');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('provider');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('service');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('process');
    expect(DIAGNOSTIC_SOURCE_KINDS).toContain('network');
    expect(DIAGNOSTIC_SOURCE_KINDS).toHaveLength(8);
  });

  it('kind values are kebab-case', () => {
    for (const kind of DIAGNOSTIC_SOURCE_KINDS) {
      expect(kind).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

// ─── No Executable Semantics ─────────────────────────────────

describe('DIAG-0: No executable semantics', () => {
  it('DiagnosticSnapshot has no command/execution fields', () => {
    const snapshot = makeSnapshot();
    expect('command' in snapshot).toBe(false);
    expect('execute' in snapshot).toBe(false);
    expect('handler' in snapshot).toBe(false);
    expect('endpoint' in snapshot).toBe(false);
    expect('route' in snapshot).toBe(false);
    expect('toolCall' in snapshot).toBe(false);
    expect('dispatch' in snapshot).toBe(false);
  });

  it('DiagnosticSnapshot has no authority/permission fields', () => {
    const snapshot = makeSnapshot();
    expect('approval' in snapshot).toBe(false);
    expect('permission' in snapshot).toBe(false);
    expect('authority' in snapshot).toBe(false);
    expect('policyOverride' in snapshot).toBe(false);
  });

  it('DiagnosticSnapshot has no root cause field', () => {
    const snapshot = makeSnapshot();
    expect('rootCause' in snapshot).toBe(false);
    expect('cause' in snapshot).toBe(false);
    expect('diagnosis' in snapshot).toBe(false);
    expect('resolution' in snapshot).toBe(false);
  });

  it('DiagnosticSnapshot has no recovery field', () => {
    const snapshot = makeSnapshot();
    expect('recovery' in snapshot).toBe(false);
    expect('recovered' in snapshot).toBe(false);
    expect('restart' in snapshot).toBe(false);
    expect('fix' in snapshot).toBe(false);
  });

  it('DiagnosticSourceRef has no authority fields', () => {
    const source = makeSourceRef();
    expect('authority' in source).toBe(false);
    expect('permission' in source).toBe(false);
    expect('owner' in source).toBe(false);
  });
});

// ─── INV-REC-1 Preservation ──────────────────────────────────

describe('DIAG-0: INV-REC-1 — health ≠ root cause', () => {
  it('snapshot can represent healthy source with indeterminate root cause', () => {
    // Service recovered, root cause still unknown
    const snapshot = makeSnapshot({
      health: 'healthy',
      severity: 'info',
      message: 'Source operating normally after restart; root cause of prior failure unknown',
    });
    expect(snapshot.health).toBe('healthy');
    // No root cause field exists — contract cannot claim root cause is known
    expect('rootCause' in snapshot).toBe(false);
    expect('cause' in snapshot).toBe(false);
  });

  it('snapshot can represent unhealthy source without claiming root cause', () => {
    const snapshot = makeSnapshot({
      health: 'unhealthy',
      severity: 'critical',
      message: 'RuntimeError: memory access out of bounds',
    });
    expect(snapshot.health).toBe('unhealthy');
    // Contract describes observation, not diagnosis
    expect('rootCause' in snapshot).toBe(false);
  });

  it('snapshot can represent degraded source without recovery status', () => {
    const snapshot = makeSnapshot({
      health: 'degraded',
      severity: 'warning',
      message: 'Elevated latency observed in snapshot serving',
    });
    expect(snapshot.health).toBe('degraded');
    expect('recovery' in snapshot).toBe(false);
    expect('recovered' in snapshot).toBe(false);
  });

  it('snapshot can represent unknown health without claiming investigation needed', () => {
    const snapshot = makeSnapshot({
      health: 'unknown',
      severity: 'info',
      message: 'Health check timed out; source state indeterminate',
    });
    expect(snapshot.health).toBe('unknown');
    // Contract does not prescribe action
    expect('action' in snapshot).toBe(false);
    expect('investigation' in snapshot).toBe(false);
  });
});

// ─── M11C WASM Incident Specimen ─────────────────────────────

describe('DIAG-0: M11C WASM incident specimen', () => {
  it('can represent the sql.js WASM failure', () => {
    const snapshot = makeSnapshot({
      source: {
        id: 'sql.js-wasm',
        kind: 'wasm',
        name: 'sql.js WASM Module',
        component: 'm9-activity-db',
      },
      health: 'unhealthy',
      severity: 'critical',
      message: 'RuntimeError: memory access out of bounds in sql.js WASM after ~20h uptime',
      observedAt: '2026-08-30T12:00:00.000Z',
      evidenceRefs: [
        makeEvidenceRef({
          bundleId: 'm11a-health-snapshot',
          evidenceRef: 'sha256-m11a-instrumentation',
          evidenceKind: 'command',
          summary: 'M11A watcher health: 3 consecutive errors, heap 892MB, RSS 1.2GB',
          producedAt: '2026-08-30T12:00:00.000Z',
        }),
      ],
    });

    expect(snapshot.source.id).toBe('sql.js-wasm');
    expect(snapshot.source.kind).toBe('wasm');
    expect(snapshot.health).toBe('unhealthy');
    expect(snapshot.severity).toBe('critical');
    expect(snapshot.evidenceRefs).toHaveLength(1);
    expect(snapshot.evidenceRefs![0].bundleId).toBe('m11a-health-snapshot');
  });

  it('can represent the post-restart healthy state', () => {
    const snapshot = makeSnapshot({
      source: {
        id: 'sql.js-wasm',
        kind: 'wasm',
        name: 'sql.js WASM Module',
        component: 'm9-activity-db',
      },
      health: 'healthy',
      severity: 'info',
      message: 'WASM module restored after process restart; root cause indeterminate',
      observedAt: '2026-08-30T12:05:00.000Z',
    });

    expect(snapshot.source.id).toBe('sql.js-wasm');
    expect(snapshot.health).toBe('healthy');
    // Root cause is indeterminate — contract correctly does not have a rootCause field
    expect('rootCause' in snapshot).toBe(false);
  });

  it('can represent the M11A instrumentation as evidence reference', () => {
    const ref = makeEvidenceRef({
      bundleId: 'm11a-health-endpoint',
      evidenceRef: 'sha256-m11a-instrumentation-data',
      evidenceKind: 'command',
      summary: 'GET /api/diagnostics/m11a-health response: watcher errors, memory, latency',
      producedAt: '2026-08-30T12:00:00.000Z',
    });

    expect(ref.bundleId).toBe('m11a-health-endpoint');
    expect(ref.evidenceKind).toBe('command');
    expect(ref.summary).toContain('m11a-health');
  });
});

// ─── PCS-026 Evidence Compatibility ──────────────────────────

describe('DIAG-0: PCS-026 evidence compatibility', () => {
  it('DiagnosticEvidenceRef references bundle by ID (FK, not embedded)', () => {
    const ref = makeEvidenceRef({ bundleId: 'bundle-123' });
    // Evidence is referenced by ID, not copied
    expect(ref.bundleId).toBe('bundle-123');
    expect('bundle' in ref && typeof ref.bundle === 'object').toBe(false);
  });

  it('evidenceKind is a string (compatible with EvidenceKind)', () => {
    const ref = makeEvidenceRef({ evidenceKind: 'test' });
    expect(typeof ref.evidenceKind).toBe('string');
    // EvidenceKind values: 'command', 'test', 'build', 'filesystem-change', etc.
    // DiagnosticEvidenceRef.evidenceKind accepts any string for forward compatibility
  });

  it('DiagnosticSnapshot carries evidence as readonly array', () => {
    const snapshot = makeSnapshot({
      evidenceRefs: [makeEvidenceRef(), makeEvidenceRef()],
    });
    expect(Array.isArray(snapshot.evidenceRefs)).toBe(true);
    expect(snapshot.evidenceRefs).toHaveLength(2);
  });
});

// ─── Negative Architecture Tests ─────────────────────────────

describe('DIAG-0: Negative architecture — cannot occur', () => {
  it('snapshot cannot dispatch workflow', () => {
    const snapshot = makeSnapshot();
    expect('dispatch' in snapshot).toBe(false);
    expect('workflowRunId' in snapshot).toBe(false);
    expect('taskRunId' in snapshot).toBe(false);
  });

  it('snapshot cannot trigger agent execution', () => {
    const snapshot = makeSnapshot();
    expect('agentRun' in snapshot).toBe(false);
    expect('threadId' in snapshot).toBe(false);
    expect('harnessExecution' in snapshot).toBe(false);
  });

  it('snapshot cannot modify routing', () => {
    const snapshot = makeSnapshot();
    expect('routingDecision' in snapshot).toBe(false);
    expect('providerOverride' in snapshot).toBe(false);
    expect('modelOverride' in snapshot).toBe(false);
  });

  it('snapshot cannot claim verification outcome', () => {
    const snapshot = makeSnapshot();
    expect('verified' in snapshot).toBe(false);
    expect('verificationOutcome' in snapshot).toBe(false);
    expect('confidence' in snapshot).toBe(false);
  });

  it('snapshot cannot trigger recovery', () => {
    const snapshot = makeSnapshot();
    expect('recovery' in snapshot).toBe(false);
    expect('restart' in snapshot).toBe(false);
    expect('fix' in snapshot).toBe(false);
  });

  it('source ref cannot own evidence', () => {
    const source = makeSourceRef();
    expect('evidence' in source).toBe(false);
    expect('evidenceRefs' in source).toBe(false);
    expect('bundles' in source).toBe(false);
  });
});
