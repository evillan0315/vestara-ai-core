import { useState } from 'react';
import type { MarketplaceOperationState } from '../../lib/useMarketplaceOperations.js';
import { useMarketplaceOperations } from '../../lib/useMarketplaceOperations.js';
import { chip, muted, panel } from './styles.js';

const stateStyles: Record<MarketplaceOperationState, string> = {
  requested: 'text-zinc-400',
  planning: 'text-sky-400',
  'awaiting-permission': 'text-amber-400',
  running: 'text-sky-400',
  verifying: 'text-violet-400',
  activating: 'text-emerald-400',
  'rolling-back': 'text-orange-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-zinc-500',
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className={`fixed bottom-4 right-4 z-40 rounded-full px-4 py-2 text-sm shadow-lg ${active.length > 0 ? 'bg-sky-700 text-white' : 'bg-zinc-800 text-zinc-200'} hover:opacity-90`}
      >
        {active.length > 0 ? `Marketplace · ${active.length} active` : 'Marketplace · Operations'}
      </button>
      {open && (
        <div className={`fixed bottom-16 right-4 z-40 w-80 max-h-96 overflow-y-auto ${panel}`}>
          <div className="border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-3 text-sm font-semibold">
            Marketplace Operations
          </div>
          {operations.length === 0 && <div className={`px-4 py-6 text-sm ${muted}`}>No recent operations.</div>}
          {operations.map((operation) => (
            <div
              key={operation.key}
              className="flex items-center justify-between gap-2 border-b border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] px-4 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{operation.packageName ?? operation.eventType}</div>
                <div className={`truncate text-xs ${muted}`}>{operation.eventType}</div>
              </div>
              <span className={`${chip} ${stateStyles[operation.state]}`}>{operation.state}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
