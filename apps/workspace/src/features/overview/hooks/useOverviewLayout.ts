/**
 * VES-OVERVIEW-001: Persisted Overview panel layout.
 *
 * Two-column order persisted to localStorage so Directors can rearrange
 * panels once and keep the arrangement. Unknown ids are dropped, missing
 * defaults are re-appended — a corrupt payload can never lose a panel.
 */

import { useCallback, useState } from 'react';

export type OverviewPanelId = 'todayFocus' | 'continueWorking' | 'recentActivity' | 'milestones' | 'systemStatus' | 'workspaceHealth';

const STORAGE_KEY = 'vestara:overview-layout:v1';

const DEFAULT_LEFT: readonly OverviewPanelId[] = ['todayFocus', 'continueWorking', 'recentActivity'];
const DEFAULT_RIGHT: readonly OverviewPanelId[] = ['workspaceHealth', 'milestones', 'systemStatus'];

const ALL: readonly OverviewPanelId[] = ['todayFocus', 'continueWorking', 'recentActivity', 'milestones', 'systemStatus', 'workspaceHealth'];

export interface OverviewLayout {
  readonly left: readonly OverviewPanelId[];
  readonly right: readonly OverviewPanelId[];
}

function sanitize(ids: readonly string[] | undefined, fallback: readonly OverviewPanelId[]): OverviewPanelId[] {
  const clean = (ids ?? []).filter((id): id is OverviewPanelId => (ALL as readonly string[]).includes(id));
  return clean.length > 0 ? [...new Set(clean)] : [...fallback];
}

function load(): OverviewLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
    const parsed = JSON.parse(raw) as { left?: string[]; right?: string[] };
    const left = sanitize(parsed.left, DEFAULT_LEFT);
    const right = sanitize(parsed.right, DEFAULT_RIGHT);
    // Re-append any panel missing from both columns (forward-compat).
    const seen = new Set([...left, ...right]);
    for (const id of ALL) {
      if (!seen.has(id)) {
        (left.length <= right.length ? left : right).push(id);
      }
    }
    // De-dupe across columns (left wins).
    const leftSet = new Set(left);
    const dedupedRight = right.filter((id) => !leftSet.has(id));
    return { left, right: dedupedRight };
  } catch {
    return { left: DEFAULT_LEFT, right: DEFAULT_RIGHT };
  }
}

export function useOverviewLayout() {
  const [layout, setLayout] = useState<OverviewLayout>(load);

  const persist = useCallback((next: OverviewLayout) => {
    setLayout(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full/blocked — layout still applies for this session.
    }
  }, []);

  const move = useCallback(
    (column: 'left' | 'right', index: number, dir: -1 | 1) => {
      const ids = [...layout[column]];
      const target = index + dir;
      if (target < 0 || target >= ids.length) return;
      const [id] = ids.splice(index, 1);
      if (!id) return;
      ids.splice(target, 0, id);
      persist({ ...layout, [column]: ids });
    },
    [layout, persist],
  );

  const moveAcross = useCallback(
    (from: 'left' | 'right', fromIndex: number, to: 'left' | 'right', toIndex: number) => {
      if (from === to) return;
      const source = [...layout[from]];
      const dest = [...layout[to]];
      const [id] = source.splice(fromIndex, 1);
      if (!id) return;
      dest.splice(Math.min(toIndex, dest.length), 0, id);
      persist({ ...layout, [from]: source, [to]: dest });
    },
    [layout, persist],
  );

  const reset = useCallback(() => {
    persist({ left: DEFAULT_LEFT, right: DEFAULT_RIGHT });
  }, [persist]);

  return { layout, move, moveAcross, reset };
}
