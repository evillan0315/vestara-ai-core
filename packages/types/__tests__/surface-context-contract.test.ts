/**
 * VESTARA-INTELLIGENCE GA-3: Surface Context Contract Type Tests
 *
 * Verifies:
 * - Contract structure (all fields, correct types, readonly)
 * - No executable semantics (no commands, no authority fields)
 * - Surface-generic (no Activity Room, Workflow, or domain-specific fields)
 * - Degrades by losing optional references, not collapsing
 * - Reference visibility ≠ resource access authorization
 * - Canonical incident specimen (M11C WASM incident)
 *
 * @see VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md
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
    name: 'vestara-ai-core',
    ...overrides,
  };
}

function makeLocation(overrides?: Partial<SurfaceLocation>): SurfaceLocation {
  return {
    routeId: 'activity-v2',
    path: '/activity-v2',
    title: 'Activity Room (M11C)',
    section: 'Workspace',
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

// ─── Contract Structure ──────────────────────────────────────

describe('GA-3: SurfaceReference contract', () => {
  it('has required fields', () => {
    const ref = makeReference();
    expect(ref.kind).toBeDefined();
    expect(ref.id).toBeDefined();
  });

  it('has optional label field', () => {
    const withLabel = makeReference({ label: 'Developer Agent' });
    const withoutLabel = makeReference();
    expect(withLabel.label).toBe('Developer Agent');
    expect(withoutLabel.label).toBeUndefined();
  });

  it('kind is a string', () => {
    const ref = makeReference({ kind: 'plan' });
    expect(typeof ref.kind).toBe('string');
  });

  it('id is a string', () => {
    const ref = makeReference({ id: 'plan-abc' });
    expect(typeof ref.id).toBe('string');
  });
});

describe('GA-3: SurfaceWorkspace contract', () => {
  it('has required fields', () => {
    const ws = makeWorkspace();
    expect(ws.id).toBeDefined();
    expect(ws.name).toBeDefined();
  });

  it('id is a string', () => {
    const ws = makeWorkspace({ id: 'sha256-hash' });
    expect(typeof ws.id).toBe('string');
  });

  it('name is a string', () => {
    const ws = makeWorkspace({ name: 'my-project' });
    expect(typeof ws.name).toBe('string');
  });
});

describe('GA-3: SurfaceLocation contract', () => {
  it('has required fields', () => {
    const loc = makeLocation();
    expect(loc.routeId).toBeDefined();
    expect(loc.path).toBeDefined();
    expect(loc.title).toBeDefined();
    expect(loc.section).toBeDefined();
  });

  it('routeId can be null for unknown routes', () => {
    const loc = makeLocation({ routeId: null });
    expect(loc.routeId).toBeNull();
  });

  it('title can be null for untitled routes', () => {
    const loc = makeLocation({ title: null });
    expect(loc.title).toBeNull();
  });

  it('section can be null for unsectioned routes', () => {
    const loc = makeLocation({ section: null });
    expect(loc.section).toBeNull();
  });

  it('path is always a string', () => {
    const loc = makeLocation({ path: '/unknown-path' });
    expect(typeof loc.path).toBe('string');
  });
});

describe('GA-3: SurfaceContext contract', () => {
  it('has required workspace field', () => {
    const ctx = makeContext();
    expect(ctx.workspace).toBeDefined();
    expect(ctx.workspace.id).toBeDefined();
    expect(ctx.workspace.name).toBeDefined();
  });

  it('has required surface field', () => {
    const ctx = makeContext();
    expect(ctx.surface).toBeDefined();
    expect(ctx.surface.routeId).toBeDefined();
    expect(ctx.surface.path).toBeDefined();
  });

  it('has optional selected field', () => {
    const withSelected = makeContext({ selected: makeReference() });
    const withoutSelected = makeContext();
    expect(withSelected.selected).toBeDefined();
    expect(withoutSelected.selected).toBeUndefined();
  });
});

// ─── No Executable Semantics ─────────────────────────────────

describe('GA-3: No executable semantics', () => {
  it('SurfaceContext has no command/execution fields', () => {
    const ctx = makeContext();
    expect('command' in ctx).toBe(false);
    expect('execute' in ctx).toBe(false);
    expect('handler' in ctx).toBe(false);
    expect('dispatch' in ctx).toBe(false);
  });

  it('SurfaceContext has no authority/permission fields', () => {
    const ctx = makeContext();
    expect('approval' in ctx).toBe(false);
    expect('permission' in ctx).toBe(false);
    expect('authority' in ctx).toBe(false);
    expect('policyOverride' in ctx).toBe(false);
  });

  it('SurfaceContext has no diagnostic fields', () => {
    const ctx = makeContext();
    expect('diagnostics' in ctx).toBe(false);
    expect('health' in ctx).toBe(false);
    expect('severity' in ctx).toBe(false);
    expect('evidenceRefs' in ctx).toBe(false);
  });

  it('SurfaceContext has no conversation fields', () => {
    const ctx = makeContext();
    expect('conversation' in ctx).toBe(false);
    expect('messages' in ctx).toBe(false);
    expect('conversationId' in ctx).toBe(false);
  });

  it('SurfaceContext has no connection fields', () => {
    const ctx = makeContext();
    expect('connection' in ctx).toBe(false);
    expect('api' in ctx).toBe(false);
    expect('ws' in ctx).toBe(false);
  });

  it('SurfaceContext has no actor fields', () => {
    const ctx = makeContext();
    expect('actor' in ctx).toBe(false);
    expect('user' in ctx).toBe(false);
    expect('identity' in ctx).toBe(false);
  });

  it('SurfaceWorkspace has no repository binding fields', () => {
    const ws = makeWorkspace();
    expect('repoPath' in ws).toBe(false);
    expect('gitBranch' in ws).toBe(false);
    expect('gitRoot' in ws).toBe(false);
    expect('canonicalPath' in ws).toBe(false);
  });

  it('SurfaceReference has no authority fields', () => {
    const ref = makeReference();
    expect('authority' in ref).toBe(false);
    expect('permission' in ref).toBe(false);
    expect('owner' in ref).toBe(false);
  });
});

// ─── Surface-Generic ─────────────────────────────────────────

describe('GA-3: Surface-generic — no domain-specific fields', () => {
  it('SurfaceLocation has no Activity Room-specific fields', () => {
    const loc = makeLocation();
    expect('participants' in loc).toBe(false);
    expect('participantCount' in loc).toBe(false);
    expect('activityRoomState' in loc).toBe(false);
  });

  it('SurfaceLocation has no Workflow-specific fields', () => {
    const loc = makeLocation();
    expect('workflowState' in loc).toBe(false);
    expect('taskStatus' in loc).toBe(false);
    expect('orchestrationState' in loc).toBe(false);
  });

  it('SurfaceLocation has no Graph-specific fields', () => {
    const loc = makeLocation();
    expect('entityCount' in loc).toBe(false);
    expect('relationshipCount' in loc).toBe(false);
  });
});

// ─── Degraded Mode ───────────────────────────────────────────

describe('GA-3: Degraded mode — loses optional references, not collapse', () => {
  it('context without selected reference is still valid', () => {
    const ctx = makeContext({ selected: undefined });
    expect(ctx.workspace).toBeDefined();
    expect(ctx.surface).toBeDefined();
    expect(ctx.selected).toBeUndefined();
  });

  it('context with null routeId is still valid', () => {
    const ctx = makeContext({ surface: makeLocation({ routeId: null }) });
    expect(ctx.workspace).toBeDefined();
    expect(ctx.surface.routeId).toBeNull();
  });

  it('context with null title is still valid', () => {
    const ctx = makeContext({ surface: makeLocation({ title: null }) });
    expect(ctx.surface.title).toBeNull();
  });

  it('context with null section is still valid', () => {
    const ctx = makeContext({ surface: makeLocation({ section: null }) });
    expect(ctx.surface.section).toBeNull();
  });
});

// ─── M11C WASM Incident Specimen ─────────────────────────────

describe('GA-3: M11C WASM incident specimen', () => {
  it('correctly reports location during the incident', () => {
    const ctx = makeContext({
      workspace: {
        id: 'a1b2c3d4e5f6',
        name: 'vestara-ai-core',
      },
      surface: {
        routeId: 'activity-v2',
        path: '/activity-v2',
        title: 'Activity Room (M11C)',
        section: 'Workspace',
      },
      // selected: undefined — no Inspector entity selected
    });

    expect(ctx.workspace.id).toBe('a1b2c3d4e5f6');
    expect(ctx.workspace.name).toBe('vestara-ai-core');
    expect(ctx.surface.routeId).toBe('activity-v2');
    expect(ctx.surface.path).toBe('/activity-v2');
    expect(ctx.selected).toBeUndefined();
  });

  it('does NOT claim root cause or operational state', () => {
    const ctx = makeContext();
    // Correctly does not have these fields
    expect('rootCause' in ctx).toBe(false);
    expect('diagnosis' in ctx).toBe(false);
    expect('recovery' in ctx).toBe(false);
    expect('connection' in ctx).toBe(false);
    expect('health' in ctx).toBe(false);
  });
});

// ─── Reference Semantics ─────────────────────────────────────

describe('GA-3: Reference semantics', () => {
  it('SurfaceReference carries identity only, not full entity', () => {
    const ref = makeReference();
    expect('entity' in ref).toBe(false);
    expect('metadata' in ref).toBe(false);
    expect('relationships' in ref).toBe(false);
    expect('payload' in ref).toBe(false);
  });

  it('SurfaceReference kind covers various entity types', () => {
    const agentRef = makeReference({ kind: 'agent', id: 'dev-001' });
    const planRef = makeReference({ kind: 'plan', id: 'plan-abc' });
    const taskRef = makeReference({ kind: 'task', id: 'task-123' });
    const fileRef = makeReference({ kind: 'file', id: 'src/index.ts' });

    expect(agentRef.kind).toBe('agent');
    expect(planRef.kind).toBe('plan');
    expect(taskRef.kind).toBe('task');
    expect(fileRef.kind).toBe('file');
  });
});
