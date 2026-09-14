import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../src/contracts';
import { projectEffectiveState } from '../src/effective-state';

function message(id: string, sequence: number, overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id,
    sequence,
    timestamp: `2026-08-08T10:00:${String(sequence).padStart(2, '0')}.000Z`,
    actor: { type: 'human', id: 'director', displayName: 'Director', role: 'director' },
    kind: 'agent-message',
    agentId: 'all-agents',
    messageKind: 'message',
    content: `content ${id}`,
    evidenceRefs: [],
    ...overrides,
  };
}

describe('projectEffectiveState (Direction 2)', () => {
  it('reports effective attribution when an original is corrected (never mutating history)', () => {
    const original = message('activity:orig-1', 1, { actor: { type: 'human', id: 'dev', displayName: 'Developer' } });
    const correction = message('activity:corr-1', 2, {
      effect: 'intervention',
      correctionOf: 'activity:orig-1',
      content: 'Corrected attribution: Developer → Reviewer',
    });
    const state = projectEffectiveState([original, correction]);
    expect(state.corrections).toEqual([
      expect.objectContaining({ originalId: 'activity:orig-1', correctedBy: 'Director' }),
    ]);
    expect(state.corrections[0].content).toContain('Developer → Reviewer');
    // The effective attribution includes a readable "what was corrected".
    expect(state.corrections[0].originalContent).toBe('content activity:orig-1');
    // The original is untouched in history.
    expect(original.actor.displayName).toBe('Developer');
  });

  it('keeps a hold open until a later authorization/closure resolves it in the same unit', () => {
    const hold = message('activity:hold-1', 1, { effect: 'hold', workflowId: 'wfo-1', content: 'Hold on Track 3C' });
    const state = projectEffectiveState([hold]);
    expect(state.open).toHaveLength(1);
    expect(state.open[0].effect).toBe('hold');
    expect(state.needsAttention).toBe(1);

    const authorize = message('activity:auth-1', 2, {
      effect: 'authorization',
      workflowId: 'wfo-1',
      content: 'Authorize continuation',
    });
    const resolved = projectEffectiveState([hold, authorize]);
    expect(resolved.open).toHaveLength(0);
    expect(resolved.needsAttention).toBe(0);
  });

  it('treats a hold in a different unit as still open', () => {
    const hold = message('activity:hold-1', 1, { effect: 'hold', workflowId: 'wfo-1' });
    const authorize = message('activity:auth-1', 2, { effect: 'authorization', workflowId: 'wfo-2' });
    const state = projectEffectiveState([hold, authorize]);
    expect(state.open.map((item) => item.id)).toEqual(['activity:hold-1']);
  });

  it('resolves an open item referenced by a later disposition', () => {
    const finding = message('activity:find-1', 1, { effect: 'finding', content: 'Fixture not tested' });
    const disposition = message('activity:dec-1', 2, {
      effect: 'decision',
      relatesTo: ['activity:find-1'],
      content: 'Accept finding; covered by restart test',
    });
    const state = projectEffectiveState([finding, disposition]);
    expect(state.open).toHaveLength(0);
  });

  it('derives per-unit latest disposition without mutating history', () => {
    const hold = message('activity:hold-1', 1, { effect: 'hold', workflowId: 'wfo-1' });
    const closure = message('activity:close-1', 2, { effect: 'closure', workflowId: 'wfo-1' });
    const state = projectEffectiveState([hold, closure]);
    expect(state.units).toEqual([
      expect.objectContaining({ workflowId: 'wfo-1', latestEffect: 'closure', recordCount: 2 }),
    ]);
  });

  it('keeps concurrent opens when a scoped disposition references only one target', () => {
    const hold1 = message('activity:hold-1', 1, { effect: 'hold', workflowId: 'wfo-1' });
    const hold2 = message('activity:hold-2', 2, { effect: 'hold', workflowId: 'wfo-1' });
    const scoped = message('activity:dec-1', 3, {
      effect: 'decision',
      workflowId: 'wfo-1',
      relatesTo: ['activity:hold-1'],
      content: 'Release hold-1 only',
    });
    const state = projectEffectiveState([hold1, hold2, scoped]);
    expect(state.open.map((item) => item.id)).toEqual(['activity:hold-2']);
    expect(state.needsAttention).toBe(1);
  });

  it('closes all unit opens on a broadcast disposition with no relatesTo', () => {
    const hold1 = message('activity:hold-1', 1, { effect: 'hold', workflowId: 'wfo-1' });
    const hold2 = message('activity:hold-2', 2, { effect: 'hold', workflowId: 'wfo-1' });
    const broadcast = message('activity:close-1', 3, {
      effect: 'closure',
      workflowId: 'wfo-1',
      content: 'Close track',
    });
    const state = projectEffectiveState([hold1, hold2, broadcast]);
    expect(state.open).toHaveLength(0);
  });

  it('is a pure recomputation: the same history always yields the same derived state', () => {
    const records = [
      message('activity:orig-1', 1, { actor: { type: 'human', id: 'dev', displayName: 'Developer' } }),
      message('activity:corr-1', 2, { effect: 'intervention', correctionOf: 'activity:orig-1' }),
      message('activity:hold-1', 3, { effect: 'hold', workflowId: 'wfo-1' }),
    ];
    const first = projectEffectiveState(records);
    const second = projectEffectiveState([...records].reverse());
    expect({ ...first, computedAt: '' }).toEqual({ ...second, computedAt: '' });
  });
});
