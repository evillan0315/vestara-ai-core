/**
 * Marketplace Premium Gallery (v7.14) — OperationCenter.
 *
 * Premium floating activity indicator. Auto-hides when no operations
 * exist; shows a glass panel with backdrop blur when active.
 */

import { useState } from 'react';
import { Badge } from '@vestara/ui';
import type { MarketplaceOperationState } from '../../lib/useMarketplaceOperations.js';
import { useMarketplaceOperations } from '../../lib/useMarketplaceOperations.js';

const stateVariant: Record<MarketplaceOperationState, 'success' | 'error' | 'warning' | 'default' | 'info'> = {
  requested: 'default',
  planning: 'info',
  'awaiting-permission': 'warning',
  running: 'info',
  verifying: 'info',
  activating: 'success',
  'rolling-back': 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
};

const ACTIVE_STATES: readonly MarketplaceOperationState[] = [
  'running',
  'verifying',
  'awaiting-permission',
  'activating',
  'rolling-back',
];

/**
 * Marketplace operation center — live drawer of install/update/verify activity
 * driven entirely by `marketplace.*` WebSocket events (no polling).
 */
export default function OperationCenter() {
  const [open, setOpen] = useState(false);
  const { operations } = useMarketplaceOperations();
  const active = operations.filter((operation) => ACTIVE_STATES.includes(operation.state));

  // Auto-hide when there is nothing to show and the drawer is closed.
  if (operations.length === 0 && !open) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="fixed bottom-4 right-4 z-40 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur-xl transition-all hover:opacity-90"
        style={
          active.length > 0
            ? {
                background: 'color-mix(in srgb, var(--vestara-accent) 30%, transparent)',
                border: '1px solid var(--vestara-accent-border-hover)',
                boxShadow: '0 0 24px var(--vestara-surface-glow-hover)',
                color: '#fff',
              }
            : {
                background: 'color-mix(in srgb, var(--color-zinc-900) 90%, transparent)',
                border: '1px solid var(--vestara-accent-border)',
                color: 'var(--color-zinc-200)',
              }
        }
      >
        {active.length > 0 ? `Marketplace · ${active.length} active` : 'Marketplace · Operations'}
      </button>
      {open && (
        <div className="mpg-card mpg-hairline-top fixed bottom-16 right-4 z-40 max-h-96 w-80 overflow-y-auto backdrop-blur-xl">
          <div className="relative z-[2]">
            <div className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-sm font-semibold text-zinc-100">
              Marketplace Operations
            </div>
            {operations.length === 0 && (
              <div className="px-4 py-6 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                No recent operations.
              </div>
            )}
            {operations.map((operation) => (
              <div
                key={operation.key}
                className="flex items-center justify-between gap-2 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm text-zinc-200">
                    {operation.packageName ?? operation.eventType}
                  </div>
                  <div className="truncate font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                    {operation.eventType}
                  </div>
                </div>
                <Badge variant={stateVariant[operation.state]} size="md">
                  {operation.state}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
