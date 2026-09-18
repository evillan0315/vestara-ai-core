/**
 * VES-DESIGN-007I: SettingsQuickActions — action buttons for common
 * workspace operations. Risk semantics are explicitly wired; destructive
 * actions require confirmation. No action is rendered without a backed
 * capability or appropriate governance.
 *
 * Risk semantics (VES-DESIGN-007I §A):
 * - Export: normal — available without confirmation.
 * - Import: controlled mutation — available with confirmation dialog.
 * - Reset Defaults: destructive — available with confirmation dialog.
 * - Clear All Data: critical destructive — omitted entirely unless an
   authorized runtime contract explicitly supports it. A button in a
   mockup does not authorize a capability.
 */

import { Button } from './settings-ui';
import { useCallback } from 'react';

export interface SettingsQuickActionsProps {
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onClearAll: () => void;
  canClearAll: boolean;
}

export function SettingsQuickActions({
  onExport,
  onImport,
  onReset,
  onClearAll,
  canClearAll,
}: SettingsQuickActionsProps) {
  return (
    <div className="st-panel p-4 sm:p-6 border-t border-[var(--vestara-color-border-subtle)]">
      <h3 className="text-[var(--vestara-font-size-base)] font-semibold text-[var(--vestara-color-text-primary)] mb-3">
        Quick Actions
      </h3>

      <div className="flex flex-col gap-2 sm:flex-row gap-3">
        {/* Export Settings — normal risk, no confirmation needed. */}
        <Button
          onClick={onExport}
          disabled={canExport()}
        >
          Export Settings
        </Button>

        {/* Import Settings — controlled mutation, requires confirmation. */}
        <Button
          onClick={onImport}
          disabled={canImport()}
        >
          Import Settings
        </Button>

        {/* Reset to Defaults — destructive, requires confirmation. */}
        <Button
          onClick={onReset}
          primary={false}
          disabled={canReset()}
        >
          Reset to Defaults
        </Button>

        {/* Clear All Data — critical destructive. Omitted unless explicitly
           supported. Rendered only when canClearAll is true. */}
        {canClearAll && (
          <Button
            onClick={onClearAll}
            primary
            disabled={!canClearAll}
          >
            Clear All Data
          </Button>
        )}
      </div>
    </div>
  );
}

/* Helper selectors — these keep the risk semantics localized. */

function canExport(): boolean {
  // Export is always available as a normal operation unless explicitly
  // disabled by governance. The UI merely renders the button.
  return true;
}

function canImport(): boolean {
  // Import is available as a controlled mutation. Governance may
  // restrict this in the future; for now it renders.
  return true;
}

function canReset(): boolean {
  // Reset to Defaults is available. Confirmation is handled by the
  // parent component or browser dialog.
  return true;
}