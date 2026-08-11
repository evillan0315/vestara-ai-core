import { useSyncExternalStore } from 'react';
import { fetchVisualConfig, saveVisualConfig } from '../../lib/activity';
import type { Alignment, Density, Presentation } from './edit-manifest';

export interface VisualOverride {
  alignment?: Alignment;
  density?: Density;
  presentation?: Presentation;
}

export interface AppliedChange {
  readonly target: string;
  readonly instanceId: string;
  readonly property: 'alignment' | 'density' | 'presentation';
  readonly before?: string;
  readonly after: string;
  readonly scope: 'instance';
  readonly appliedBy: string;
  readonly mechanism: 'visual-configuration';
}

/**
 * VE-5 — the first write boundary.
 *
 * A tiny declarative visual configuration, keyed by instance id and consumed
 * by the Activity components through React (no TSX rewrite). Apply preserves
 * Design Intent scope exactly — instance scope is representable; anything else
 * is refused. The previous value is retained so the first real mutation is
 * explicitly reversible. No event-sourcing, no platform — just enough for the
 * experiment.
 */

let overrides: Record<string, VisualOverride> = {};
let lastChange: AppliedChange | null = null;
let cached = { overrides, lastChange };
const listeners = new Set<() => void>();

function emit(): void {
  cached = { overrides, lastChange };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): { overrides: Record<string, VisualOverride>; lastChange: AppliedChange | null } {
  return cached;
}

export function useVisualConfig(): { overrides: Record<string, VisualOverride>; lastChange: AppliedChange | null } {
  return useSyncExternalStore(subscribe, snapshot);
}

/** True when a config override exists for an instance (used to protect VE-5 applies). */
export function hasOverride(instanceId: string): boolean {
  return overrides[instanceId] !== undefined;
}

/** Read the current overrides (for verification after the commit settles). */
export function getOverrides(): Record<string, VisualOverride> {
  return overrides;
}

/** Apply one presentation intent to an instance, retaining the previous value. */
export function applyOverride(instanceId: string, override: VisualOverride): AppliedChange {
  const previous = overrides[instanceId];
  overrides = { ...overrides, [instanceId]: { ...previous, ...override } };
  lastChange = {
    target: 'Activity Message',
    instanceId,
    property: (Object.keys(override)[0] ?? 'alignment') as AppliedChange['property'],
    before: previous ? previous[(Object.keys(override)[0] ?? 'alignment') as keyof VisualOverride] : undefined,
    after: override[(Object.keys(override)[0] ?? 'alignment') as keyof VisualOverride] as string,
    scope: 'instance',
    appliedBy: 'Director',
    mechanism: 'visual-configuration',
  };
  emit();
  // Durability: persist the durable representation, not transient DOM state.
  void saveVisualConfig(overrides);
  return lastChange;
}

/** Load the persisted visual configuration (reconstruction across reload/restart). */
export async function hydrateVisualConfig(): Promise<void> {
  const persisted = await fetchVisualConfig();
  overrides = persisted as Record<string, VisualOverride>;
  emit();
}

/** Restore the previous value of the last applied change (rollback). */
export function undoLast(): boolean {
  if (lastChange === null) return false;
  const { instanceId, before } = lastChange;
  const current = overrides[instanceId];
  const property = lastChange.property;
  if (before === undefined) {
    const next = { ...(current ?? {}) };
    delete next[property];
    overrides = { ...overrides, [instanceId]: next };
  } else {
    overrides = { ...overrides, [instanceId]: { ...current, [property]: before as never } };
  }
  lastChange = null;
  emit();
  return true;
}

/** Map a visual override to concrete CSS for the Activity components (React renders config). */
export function overrideStyle(override: VisualOverride | undefined): React.CSSProperties {
  if (!override) return {};
  return {
    ...(override.alignment !== undefined
      ? { alignSelf: override.alignment === 'left' ? 'flex-start' : override.alignment === 'right' ? 'flex-end' : 'center' }
      : {}),
    ...(override.density !== undefined ? { padding: override.density === 'compact' ? '2px' : override.density === 'spacious' ? '14px' : '' } : {}),
    ...(override.presentation === 'minimal' ? { backgroundColor: 'rgba(0, 0, 0, 0)', border: '0' } : {}),
  };
}
