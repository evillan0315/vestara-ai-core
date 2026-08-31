/**
 * VESTARA-INTELLIGENCE GA-3: SurfaceContextProvider Behavior Tests
 *
 * Verifies:
 * - Workspace identity projection from API
 * - Route changes update surface location
 * - Selected Graph entity becomes bounded SurfaceReference
 * - Full Graph entity does not leak through the contract
 * - No selection produces undefined
 * - Selection removal clears the reference
 * - Activity Room unavailable does not break Surface Context
 * - No repository path/binding appears in output
 * - No diagnostics/conversation/connectivity fields appear
 *
 * @see VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { SurfaceContext } from '@vestara/types';

// ─── Mocks ────────────────────────────────────────────────────

const mockGetWorkspaceIdentity = vi.fn();
vi.mock('../src/lib/api', () => ({
  getWorkspaceIdentity: () => mockGetWorkspaceIdentity(),
}));

const mockUseGraph = vi.fn();
vi.mock('../src/components/graph/GraphContext', () => ({
  useGraph: () => mockUseGraph(),
}));

const mockParseEntityId = vi.fn();
vi.mock('../src/lib/graph', () => ({
  parseEntityId: (raw: string) => mockParseEntityId(raw),
}));

// Mock react-router-dom's useLocation
let currentPath = '/sessions';
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: currentPath, search: '', hash: '', state: null }),
}));

// Mock navigation with a minimal set for testing
vi.mock('../src/layouts/navigation', () => ({
  NAV_CATEGORIES: [
    {
      title: 'Workspace',
      items: [
        { to: '/overview', title: 'Overview', icon: null },
        { to: '/diagnostics', title: 'Diagnostics', icon: null },
        { to: '/activity-v2', title: 'Activity Room (M11C)', icon: null },
      ],
    },
    {
      title: 'Engineering',
      items: [
        { to: '/sessions', title: 'Sessions', icon: null },
        { to: '/artifacts', title: 'Artifacts', icon: null },
      ],
    },
  ],
}));

import { SurfaceContextProvider, useSurfaceContext } from '../src/contexts/SurfaceContext';

// ─── Test Wrapper ─────────────────────────────────────────────

function createWrapper() {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SurfaceContextProvider>{children}</SurfaceContextProvider>;
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('SurfaceContextProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPath = '/sessions';
    mockGetWorkspaceIdentity.mockResolvedValue({ id: 'ws-001', name: 'test-workspace' });
    mockUseGraph.mockReturnValue({
      inspector: { entityId: null, entity: null },
    });
    mockParseEntityId.mockReturnValue({ kind: null, id: '' });
  });

  it('projects workspace identity from API', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    // Initially unknown before API resolves
    expect(result.current.workspace.id).toBe('unknown');
    expect(result.current.workspace.name).toBe('unknown');

    // After API resolves
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.workspace.id).toBe('ws-001');
    expect(result.current.workspace.name).toBe('test-workspace');
  });

  it('derives surface location from route', async () => {
    currentPath = '/sessions';
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.surface.routeId).toBe('/sessions');
    expect(result.current.surface.path).toBe('/sessions');
    expect(result.current.surface.title).toBe('Sessions');
    expect(result.current.surface.section).toBe('Engineering');
  });

  it('returns null routeId/title/section for unmatched routes', async () => {
    currentPath = '/unknown-future-page';
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.surface.routeId).toBeNull();
    expect(result.current.surface.path).toBe('/unknown-future-page');
    expect(result.current.surface.title).toBeNull();
    expect(result.current.surface.section).toBeNull();
  });

  it('selected is undefined when no entity is inspected', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.selected).toBeUndefined();
  });

  it('selected becomes bounded SurfaceReference when entity is inspected', async () => {
    mockUseGraph.mockReturnValue({
      inspector: {
        entityId: 'agent://developer-001',
        entity: { id: 'agent://developer-001', kind: 'agent', label: 'Developer Agent' },
      },
    });
    mockParseEntityId.mockReturnValue({ kind: 'agent', id: 'developer-001' });

    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.selected).toBeDefined();
    expect(result.current.selected?.kind).toBe('agent');
    expect(result.current.selected?.id).toBe('developer-001');
    expect(result.current.selected?.label).toBe('Developer Agent');
  });

  it('full Graph entity does not leak through the contract', async () => {
    const fullEntity = {
      id: 'agent://developer-001',
      kind: 'agent',
      label: 'Developer Agent',
      status: 'active',
      owner: 'admin',
      tags: ['coding', 'review'],
      description: 'A developer agent',
      updatedAt: '2026-01-01T00:00:00Z',
      meta: { custom: 'data' },
    };
    mockUseGraph.mockReturnValue({
      inspector: { entityId: 'agent://developer-001', entity: fullEntity },
    });
    mockParseEntityId.mockReturnValue({ kind: 'agent', id: 'developer-001' });

    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Only kind, id, label are exposed — no status, owner, tags, description, updatedAt, meta
    const selected = result.current.selected!;
    expect(Object.keys(selected)).toEqual(['kind', 'id', 'label']);
    expect('status' in selected).toBe(false);
    expect('owner' in selected).toBe(false);
    expect('tags' in selected).toBe(false);
    expect('description' in selected).toBe(false);
    expect('updatedAt' in selected).toBe(false);
    expect('meta' in selected).toBe(false);
  });

  it('selection removal clears the reference', async () => {
    // Start with entity selected
    mockUseGraph.mockReturnValue({
      inspector: {
        entityId: 'agent://developer-001',
        entity: { id: 'agent://developer-001', kind: 'agent', label: 'Developer Agent' },
      },
    });
    mockParseEntityId.mockReturnValue({ kind: 'agent', id: 'developer-001' });

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.selected).toBeDefined();

    // Simulate Inspector closing
    mockUseGraph.mockReturnValue({
      inspector: { entityId: null, entity: null },
    });
    mockParseEntityId.mockReturnValue({ kind: null, id: '' });

    await act(async () => {
      rerender();
    });

    expect(result.current.selected).toBeUndefined();
  });

  it('Activity Room unavailable does not break Surface Context', async () => {
    currentPath = '/activity-v2';
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Surface Context still works — route info is from NAV_CATEGORIES, not Activity Room
    expect(result.current.surface.routeId).toBe('/activity-v2');
    expect(result.current.surface.title).toBe('Activity Room (M11C)');
    expect(result.current.workspace.id).toBeDefined();
  });

  it('no repository path or binding in output', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const ctx = result.current;
    expect('repoPath' in ctx).toBe(false);
    expect('canonicalPath' in ctx).toBe(false);
    expect('gitRoot' in ctx).toBe(false);
    expect('bindingId' in ctx).toBe(false);
    expect('workspace' in ctx && 'repoPath' in ctx.workspace).toBe(false);
  });

  it('no diagnostics/conversation/connectivity fields', async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const ctx = result.current;
    expect('diagnostics' in ctx).toBe(false);
    expect('conversation' in ctx).toBe(false);
    expect('connection' in ctx).toBe(false);
    expect('evidence' in ctx).toBe(false);
    expect('observer' in ctx).toBe(false);
    expect('routing' in ctx).toBe(false);
    expect('execution' in ctx).toBe(false);
  });

  it('workspace defaults to unknown before API resolves', async () => {
    // Make the API call hang
    mockGetWorkspaceIdentity.mockReturnValue(new Promise(() => {}));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    // Should still have a valid SurfaceContext with default workspace
    expect(result.current.workspace.id).toBe('unknown');
    expect(result.current.workspace.name).toBe('unknown');
    expect(result.current.surface).toBeDefined();
  });

  it('handles API failure gracefully', async () => {
    mockGetWorkspaceIdentity.mockRejectedValue(new Error('network error'));

    const wrapper = createWrapper();
    const { result } = renderHook(() => useSurfaceContext(), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Workspace stays at defaults — provider does not crash
    expect(result.current.workspace.id).toBe('unknown');
    expect(result.current.workspace.name).toBe('unknown');
    expect(result.current.surface).toBeDefined();
  });
});
