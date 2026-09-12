// @vitest-environment jsdom
/**
 * VES-DESIGN-006: navigation store regression test.
 *
 * Mounting useWorkspaceNavigation must settle — a getSnapshot that
 * returns a fresh object per call loops React into
 * "Maximum update depth exceeded" before any fetch resolves.
 */
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useWorkspaceNavigation } from '../src/lib/navigation-store.js';

describe('useWorkspaceNavigation', () => {
  it('renders the curated sidebar without an update loop', () => {
    const { result } = renderHook(() => useWorkspaceNavigation());
    expect(result.current).toHaveLength(1);
    expect(result.current[0].items.map((i) => i.title)).toEqual([
      'Home',
      'Global Assistant',
      'Activity Room',
      'Executions',
      'Agents',
      'Workflows',
      'Projects',
      'Files',
      'Terminal',
      'Marketplace',
      'Tools',
      'Settings',
    ]);
  });
});
