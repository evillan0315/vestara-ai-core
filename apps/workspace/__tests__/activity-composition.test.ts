/**
 * VES-DESIGN-008F: adaptive work-composition signal contract.
 *
 * Pins the single derivation home shared by M11CWorkflowBrowser and the
 * Activity Room page composition: empty stream, completed-only units,
 * active units, and running/latest summaries. Pure projection leveling —
 * no DOM, no realtime, runs in the default node environment.
 */

import { describe, expect, it } from 'vitest';
import type { M11CStreamItem } from '../src/hooks/useM11CActivityRoom';
import { deriveWorkflowUnits, hasActiveWork } from '../src/pages/activity/M11CWorkflowBrowser';

// The module also imports the hook file for types; satisfy the type-only
// shape with a minimal structural item.
function item(overrides: Partial<M11CStreamItem> & { id: string }): M11CStreamItem {
  return {
    sequence: 0,
    timestamp: '2026-09-12T00:00:00.000Z',
    kind: 'activity',
    importance: 'secondary',
    actor: { type: 'agent', id: 'agent-x', displayName: 'X' },
    content: 'x',
    fresh: false,
    ...overrides,
  } as M11CStreamItem;
}

describe('adaptive work composition signal', () => {
  it('reports no work for an empty stream and null summary', () => {
    const units = deriveWorkflowUnits([]);
    expect(units).toEqual([]);
    expect(hasActiveWork(units, null)).toBe(false);
  });

  it('reports no ACTIVE work for units without activity/progress events', () => {
    // isActive is kind-based per the browser's own definition: only
    // activity/progress events mark a unit active (content text is not
    // parsed — see 008D). Tool-only units are browsable history.
    const units = deriveWorkflowUnits([
      item({ id: 'a', workflowRunId: 'wf-1', kind: 'tool-result', content: 'edit completed' }),
    ]);
    // Units exist (browsable history) but none are active.
    expect(units).toHaveLength(1);
    expect(units[0]?.isActive).toBe(false);
    expect(hasActiveWork(units, null)).toBe(false);
  });

  it('reports active work when a unit carries activity/progress events', () => {
    const units = deriveWorkflowUnits([
      item({ id: 'a', workflowRunId: 'wf-1', kind: 'activity', content: 'task started' }),
    ]);
    expect(units[0]?.isActive).toBe(true);
    expect(hasActiveWork(units, null)).toBe(true);
  });

  it('reports active work for a running summary even without units', () => {
    expect(
      hasActiveWork([], {
        workflowRunId: 'wf-9',
        status: 'running',
        taskCount: 2,
        completedTasks: 0,
        failedTasks: 0,
        startedAt: '2026-09-12T00:00:00.000Z',
        lastActivityAt: '2026-09-12T00:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('does not treat a completed summary as active work', () => {
    expect(
      hasActiveWork([], {
        workflowRunId: 'wf-9',
        status: 'completed',
        taskCount: 2,
        completedTasks: 2,
        failedTasks: 0,
        startedAt: '2026-09-12T00:00:00.000Z',
        lastActivityAt: '2026-09-12T00:00:00.000Z',
      }),
    ).toBe(false);
  });
});
