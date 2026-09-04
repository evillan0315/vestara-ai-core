/**
 * VESTARA-INTELLIGENCE GA-3: SurfaceContextProvider
 *
 * Deterministic client projection composing workspace identity,
 * surface location, and optional selected-resource reference.
 *
 * No retrieval, ranking, search, generation, summarization,
 * aggregation, inference, routing, execution, or authorization.
 *
 * AR-009: Activity Room selection now flows through SurfaceContext.
 * Activity Room contributes references; SurfaceContext remains the canonical owner.
 *
 * @see VESTARA-INTELLIGENCE-GA3-PREFLIGHT.md
 * @see AR-008-assistant-surface-context.md
 * @see AR-009-activity-assistant-integration.md
 */

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { SurfaceContext, SurfaceLocation, SurfaceReference, SurfaceWorkspace } from '@vestara/types';
import { getWorkspaceIdentity } from '../lib/api';
import { useGraph } from '../components/graph/GraphContext';
import { parseEntityId } from '../lib/graph';
import { NAV_CATEGORIES } from '../layouts/navigation';

// ─── Flatten navigation items for route matching ──────────────

interface NavEntry {
  to: string;
  title: string;
  section: string;
}

const NAV_ENTRIES: NavEntry[] = NAV_CATEGORIES.flatMap((category) =>
  category.items.map((item) => ({
    to: item.to,
    title: item.title,
    section: category.title,
  })),
);

function resolveSurfaceLocation(pathname: string): SurfaceLocation {
  // Match longest path first to avoid prefix collisions (e.g., /sessions vs /sessions/:id)
  const match = [...NAV_ENTRIES]
    .sort((a, b) => b.to.length - a.to.length)
    .find((entry) => pathname === entry.to || (entry.to !== '/' && pathname.startsWith(entry.to + '/')) || (entry.to !== '/' && pathname === entry.to));

  return {
    routeId: match?.to ?? null,
    path: pathname,
    title: match?.title ?? null,
    section: match?.section ?? null,
  };
}

// ─── Context ──────────────────────────────────────────────────

const SurfaceContextInner = createContext<SurfaceContext | null>(null);

/** Callback to set Activity Room selection from child components. */
type SetActivitySelection = (ref: SurfaceReference | undefined) => void;

const SetActivitySelectionContext = createContext<SetActivitySelection | null>(null);

export interface SurfaceContextProviderProps {
  children: ReactNode;
}

export function SurfaceContextProvider({ children }: SurfaceContextProviderProps) {
  const location = useLocation();
  const { inspector } = useGraph();

  // Workspace identity — fetched once on mount, server-derived
  const [workspace, setWorkspace] = useState<SurfaceWorkspace>({
    id: 'unknown',
    name: 'unknown',
  });

  useEffect(() => {
    let cancelled = false;
    getWorkspaceIdentity()
      .then((identity) => {
        if (!cancelled && identity) {
          setWorkspace(identity);
        }
      })
      .catch(() => {
        // API failure — workspace stays at defaults. Surface Context remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Surface location — derived from React Router + NAV_CATEGORIES
  const surface: SurfaceLocation = useMemo(
    () => resolveSurfaceLocation(location.pathname),
    [location.pathname],
  );

  // AR-009: Activity Room selection — set by Activity Room components
  const [activitySelection, setActivitySelection] = useState<SurfaceReference | undefined>(undefined);

  // Selected reference — merge GraphContext inspector with Activity Room selection
  // Activity Room selection takes priority when set (deterministic replacement)
  const selected: SurfaceReference | undefined = useMemo(() => {
    // Activity Room selection takes priority
    if (activitySelection) return activitySelection;
    // Fall back to GraphContext inspector
    if (!inspector.entityId || !inspector.entity) return undefined;
    const parsed = parseEntityId(inspector.entityId);
    return {
      kind: parsed.kind ?? 'unknown',
      id: parsed.id,
      label: inspector.entity.label,
    };
  }, [activitySelection, inspector.entityId, inspector.entity]);

  // AR-009: Stable callback for Activity Room to set selection
  const handleSetActivitySelection = useCallback((ref: SurfaceReference | undefined) => {
    setActivitySelection(ref);
  }, []);

  // Compose SurfaceContext — deterministic projection
  const value: SurfaceContext = useMemo(
    () => ({
      workspace,
      surface,
      selected,
    }),
    [workspace, surface, selected],
  );

  return (
    <SetActivitySelectionContext.Provider value={handleSetActivitySelection}>
      <SurfaceContextInner.Provider value={value}>{children}</SurfaceContextInner.Provider>
    </SetActivitySelectionContext.Provider>
  );
}

// ─── Consumer Hooks ────────────────────────────────────────────

export function useSurfaceContext(): SurfaceContext {
  const ctx = useContext(SurfaceContextInner);
  if (!ctx) throw new Error('useSurfaceContext requires SurfaceContextProvider');
  return ctx;
}

/** AR-009: Hook for Activity Room to set/clear selection in SurfaceContext. */
export function useSetActivitySelection(): SetActivitySelection {
  const setter = useContext(SetActivitySelectionContext);
  if (!setter) throw new Error('useSetActivitySelection requires SurfaceContextProvider');
  return setter;
}
