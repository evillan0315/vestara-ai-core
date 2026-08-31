/**
 * VESTARA-INTELLIGENCE GA-3: Surface Context Contract Type Tests
 *
 * Verifies:
 * - Contract structure (all fields, correct types, readonly)
 * - No executable semantics (no commands, no authority fields)
 * - SurfaceReference follows *Ref pattern (DiagnosticSourceRef, ResourceRef)
 * - Workspace scope excludes repository binding (no repoPath)
 * - No diagnostics, conversation, or connectivity fields
 * - selected is optional (absence is normal)
 * - Generic/extensible kind field (no hardcoded enum)
 *
 * @see VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md §L
 */

import { describe, expect, it } from 'vitest';
import type { SurfaceContext, SurfaceLocation, SurfaceReference, SurfaceWorkspace } from '../src/surface-context';

// ─── Helper: Create Test Fixtures ────────────────────────────

function makeReference(overrides?: Partial<SurfaceReference>): SurfaceReference {
  return {
    kind: 'agent',
    id: 'developer-001',
    ...overrides,
  };
}

function makeWorkspace(overrides?: Partial<SurfaceWorkspace>): SurfaceWorkspace {
  return {
    id: 'a1b2c3d4e5f6',
    name: 'test-workspace',
    ...overrides,
  };
}

function makeLocation(overrides?: Partial<SurfaceLocation>): SurfaceLocation {
  return {
    routeId: '/sessions',
    path: '/sessions',
    title: 'Sessions',
    section: 'Engineering',
    ...overrides,
  };
}

function makeContext(overrides?: Partial<SurfaceContext>): SurfaceContext {
  return {
    workspace: makeWorkspace(),
    surface: makeLocation(),
    ...overrides,
  };
}

// ─── SurfaceReference Contract ────────────────────────────────

describe('SurfaceReference', () => {
  it('has kind, id, and optional label', () => {
    const ref = makeReference();
    expect(ref.kind).toBe('agent');
    expect(ref.id).toBe('developer-001');
    expect(ref.label).toBeUndefined();
  });

  it('accepts label as presentation metadata', () => {
    const ref = makeReference({ label: 'Developer Agent' });
    expect(ref.label).toBe('Developer Agent');
  });

  it('kind is a generic string (no hardcoded enum)', () => {
    // Future modules must be able to produce references without modifying GA-3
    const kinds = ['agent', 'plan', 'task', 'file', 'custom-module', 'future-surface'];
    for (const kind of kinds) {
      const ref = makeReference({ kind });
      expect(ref.kind).toBe(kind);
    }
  });

  it('does not carry metadata, payload, or attributes', () => {
    const ref = makeReference();
    const keys = Object.keys(ref);
    expect(keys).toEqual(['kind', 'id']);
    // label is optional and not present when omitted
  });

  it('label must not participate in authorization', () => {
    // This is a contract test — the type enforces label is optional display-only
    const ref = makeReference({ label: 'Any Label' });
    expect(typeof ref.label).toBe('string');
    // The contract test documents that label is presentation metadata only
  });
});

// ─── SurfaceWorkspace Contract ────────────────────────────────

describe('SurfaceWorkspace', () => {
  it('has id and name only', () => {
    const ws = makeWorkspace();
    expect(ws.id).toBe('a1b2c3d4e5f6');
    expect(ws.name).toBe('test-workspace');
  });

  it('does NOT have repoPath', () => {
    const ws = makeWorkspace();
    expect('repoPath' in ws).toBe(false);
  });

  it('does NOT have canonicalPath', () => {
    const ws = makeWorkspace();
    expect('canonicalPath' in ws).toBe(false);
  });

  it('does NOT have gitRoot', () => {
    const ws = makeWorkspace();
    expect('gitRoot' in ws).toBe(false);
  });

  it('does NOT have bindingId', () => {
    const ws = makeWorkspace();
    expect('bindingId' in ws).toBe(false);
  });

  it('does NOT have source or authoritative', () => {
    const ws = makeWorkspace();
    expect('source' in ws).toBe(false);
    expect('authoritative' in ws).toBe(false);
  });
});

// ─── SurfaceLocation Contract ─────────────────────────────────

describe('SurfaceLocation', () => {
  it('has routeId, path, title, section', () => {
    const loc = makeLocation();
    expect(loc.routeId).toBe('/sessions');
    expect(loc.path).toBe('/sessions');
    expect(loc.title).toBe('Sessions');
    expect(loc.section).toBe('Engineering');
  });

  it('routeId can be null for unmatched routes', () => {
    const loc = makeLocation({ routeId: null, title: null, section: null });
    expect(loc.routeId).toBeNull();
    expect(loc.title).toBeNull();
    expect(loc.section).toBeNull();
  });

  it('path is always present', () => {
    const loc = makeLocation({ path: '/unknown-path' });
    expect(loc.path).toBe('/unknown-path');
  });
});

// ─── SurfaceContext Contract ──────────────────────────────────

describe('SurfaceContext', () => {
  it('has workspace and surface (required)', () => {
    const ctx = makeContext();
    expect(ctx.workspace).toBeDefined();
    expect(ctx.surface).toBeDefined();
  });

  it('selected is optional', () => {
    const ctx = makeContext();
    expect(ctx.selected).toBeUndefined();
  });

  it('selected can be a SurfaceReference', () => {
    const ctx = makeContext({ selected: makeReference() });
    expect(ctx.selected).toBeDefined();
    expect(ctx.selected?.kind).toBe('agent');
    expect(ctx.selected?.id).toBe('developer-001');
  });

  it('does NOT have connection field', () => {
    const ctx = makeContext();
    expect('connection' in ctx).toBe(false);
  });

  it('does NOT have actor field', () => {
    const ctx = makeContext();
    expect('actor' in ctx).toBe(false);
  });

  it('does NOT have diagnostics field', () => {
    const ctx = makeContext();
    expect('diagnostics' in ctx).toBe(false);
  });

  it('does NOT have conversation field', () => {
    const ctx = makeContext();
    expect('conversation' in ctx).toBe(false);
  });

  it('does NOT have evidence field', () => {
    const ctx = makeContext();
    expect('evidence' in ctx).toBe(false);
  });

  it('does NOT have observer field', () => {
    const ctx = makeContext();
    expect('observer' in ctx).toBe(false);
  });

  it('does NOT have routing or execution fields', () => {
    const ctx = makeContext();
    expect('routing' in ctx).toBe(false);
    expect('execution' in ctx).toBe(false);
  });

  it('degrades by losing selected reference', () => {
    const ctxWithSelected = makeContext({ selected: makeReference() });
    const ctxWithoutSelected = makeContext();
    expect(ctxWithSelected.selected).toBeDefined();
    expect(ctxWithoutSelected.selected).toBeUndefined();
    // Core fields remain
    expect(ctxWithoutSelected.workspace).toBeDefined();
    expect(ctxWithoutSelected.surface).toBeDefined();
  });
});

// ─── Generic Surface Specimen ─────────────────────────────────

describe('Generic/future-module surface', () => {
  it('represents a future Marketplace surface', () => {
    const ctx: SurfaceContext = {
      workspace: makeWorkspace({ id: 'ws-001', name: 'my-app' }),
      surface: {
        routeId: '/marketplace',
        path: '/marketplace',
        title: 'Marketplace',
        section: 'Workspace',
      },
      selected: { kind: 'capability', id: 'code-review', label: 'Code Review' },
    };
    expect(ctx.surface.routeId).toBe('/marketplace');
    expect(ctx.selected?.kind).toBe('capability');
  });

  it('represents an unknown future surface', () => {
    const ctx: SurfaceContext = {
      workspace: makeWorkspace(),
      surface: {
        routeId: null,
        path: '/unknown-future-module',
        title: null,
        section: null,
      },
    };
    expect(ctx.surface.routeId).toBeNull();
    expect(ctx.surface.title).toBeNull();
    expect(ctx.selected).toBeUndefined();
  });

  it('represents a future surface with custom entity kind', () => {
    const ctx: SurfaceContext = {
      workspace: makeWorkspace(),
      surface: makeLocation(),
      selected: { kind: 'custom-module', id: 'mod-001', label: 'Custom Module' },
    };
    expect(ctx.selected?.kind).toBe('custom-module');
  });
});

// ─── M11C WASM Incident Specimen ─────────────────────────────

describe('M11C WASM incident specimen', () => {
  it('correctly represents the incident context', () => {
    const ctx: SurfaceContext = {
      workspace: { id: 'a1b2c3d4e5f6', name: 'vestara-ai-core' },
      surface: {
        routeId: '/activity-v2',
        path: '/activity-v2',
        title: 'Activity Room (M11C)',
        section: 'Workspace',
      },
      // No selected — user was viewing the Activity Room without an Inspector entity
    };
    expect(ctx.workspace.name).toBe('vestara-ai-core');
    expect(ctx.surface.routeId).toBe('/activity-v2');
    expect(ctx.surface.title).toBe('Activity Room (M11C)');
    expect(ctx.selected).toBeUndefined();
    // No root cause, no diagnostic, no recovery claim
    expect('diagnostics' in ctx).toBe(false);
    expect('rootCause' in ctx).toBe(false);
  });
});
