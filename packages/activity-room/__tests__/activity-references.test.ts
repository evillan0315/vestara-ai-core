/**
 * AR-REF-001 — Activity reference resolution for turn context.
 *
 * Proves:
 * 1. Legacy + M9 identity spaces both resolve (legacy first, like ingress).
 * 2. Labels derive ONLY from authoritative structured fields and stay bounded
 *    (whole label ≤ LABEL_MAX; raw payloads / full output never embedded).
 * 3. Every input id yields exactly one entry in order; unresolvable ids keep
 *    the durable id with a deterministic label (no fabrication, no drop).
 * 4. Blank ids are skipped.
 */

import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_REFERENCE_LABEL_MAX,
  UNRESOLVED_ACTIVITY_REFERENCE_LABEL,
  labelLegacyActivity,
  labelM9Activity,
  resolveActivityReferences,
  type ActivityReferenceLookup,
} from '../src/activity-references';
import type { ActivityRecord as LegacyActivityRecord } from '../src/contracts';
import type { ActivityRecord as M9ActivityRecord } from '../src/m9-types';

const ACTOR = { type: 'agent', id: 'agent-developer', displayName: 'Developer' } as const;

function legacyToolFailed(output: string): LegacyActivityRecord {
  return {
    id: 'act-tool-1',
    sequence: 7,
    timestamp: new Date().toISOString(),
    actor: { ...ACTOR },
    evidenceRefs: [],
    kind: 'tool-result',
    agentId: 'agent-developer',
    toolName: 'bash',
    callID: 'call-01a0',
    status: 'failed',
    output,
  };
}

function m9ToolFailed(): M9ActivityRecord {
  return {
    activityId: 'm9-tool-9',
    eventId: 'tool.failed:evt-9',
    sequenceNumber: 9,
    type: 'tool.failed',
    timestamp: new Date().toISOString(),
    actor: { type: 'agent', id: 'agent-developer', displayName: 'Developer' },
    source: 'runtime-session',
    payload: {
      message: 'bash failed',
      data: { toolName: 'bash', callID: 'call-99' },
      error: { message: 'exit code 1', code: 'EXIT_1' },
    },
    visibility: 'all',
  };
}

function lookupWith(legacy: Record<string, LegacyActivityRecord>, m9: Record<string, M9ActivityRecord>): ActivityReferenceLookup {
  return {
    getLegacyActivity: async (id) => legacy[id] ?? null,
    getM9Activity: async (id) => m9[id] ?? null,
  };
}

// ─── Label bounds ──────────────────────────────────────────────

describe('AR-REF-001 label bounds', () => {
  it('failed tool label carries type/tool/status/call but not the full output', () => {
    const longOutput = `x${'o'.repeat(5000)}TAIL-MARKER-${'z'.repeat(5000)}`;
    const label = labelLegacyActivity(legacyToolFailed(longOutput));
    expect(label).toContain('TOOL');
    expect(label).toContain('bash');
    expect(label).toContain('Failed');
    expect(label).toContain('call-01a0');
    expect(label.length).toBeLessThanOrEqual(ACTIVITY_REFERENCE_LABEL_MAX);
    expect(label).not.toContain('TAIL-MARKER');
  });

  it('M9 failed tool label uses type taxonomy + structured error only', () => {
    const label = labelM9Activity(m9ToolFailed());
    expect(label).toContain('TOOL');
    expect(label).toContain('bash');
    expect(label).toContain('Failed');
    expect(label).toContain('exit code 1');
    expect(label.length).toBeLessThanOrEqual(ACTIVITY_REFERENCE_LABEL_MAX);
  });
});

// ─── Resolution ────────────────────────────────────────────────

describe('AR-REF-001 resolveActivityReferences', () => {
  it('resolves legacy ids first and preserves input order across spaces', async () => {
    const lookup = lookupWith({ 'act-tool-1': legacyToolFailed('boom') }, { 'm9-tool-9': m9ToolFailed() });
    const refs = await resolveActivityReferences(['m9-tool-9', 'act-tool-1'], lookup);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ kind: 'activity', id: 'm9-tool-9' });
    expect(refs[0].label).toContain('exit code 1');
    expect(refs[1]).toMatchObject({ kind: 'activity', id: 'act-tool-1' });
    expect(refs[1].label).toContain('bash');
  });

  it('prefers the legacy store when an id exists in both (ingress order)', async () => {
    const legacy = legacyToolFailed('legacy-output');
    const lookup = lookupWith(
      { same: legacy },
      { same: m9ToolFailed() },
    );
    const refs = await resolveActivityReferences(['same'], lookup);
    expect(refs).toHaveLength(1);
    expect(refs[0].label).toContain('call-01a0');
  });

  it('unresolvable ids keep the durable id with a deterministic label', async () => {
    const refs = await resolveActivityReferences(['act-missing-1'], lookupWith({}, {}));
    expect(refs).toEqual([{ kind: 'activity', id: 'act-missing-1', label: UNRESOLVED_ACTIVITY_REFERENCE_LABEL }]);
  });

  it('blank ids are skipped; empty input resolves to no references', async () => {
    const lookup = lookupWith({}, {});
    expect(await resolveActivityReferences(['', '   '], lookup)).toEqual([]);
    expect(await resolveActivityReferences([], lookup)).toEqual([]);
  });

  it('multiple references all reach the result independently (no first-only)', async () => {
    const lookup = lookupWith({ 'act-tool-1': legacyToolFailed('boom') }, { 'm9-tool-9': m9ToolFailed() });
    const refs = await resolveActivityReferences(['act-tool-1', 'm9-tool-9', 'act-gone'], lookup);
    expect(refs.map((r) => r.id)).toEqual(['act-tool-1', 'm9-tool-9', 'act-gone']);
  });
});
