/**
 * VES-DESIGN-007B: Settings Hero — canonical surface header for the Settings screen.
 *
 * Content hierarchy per UI-SETTINGS-001:
 *   "Settings" label + domain description
   Summary values (Workspace, Environment, Last updated) are projected
   from authoritative API/runtime state — never fabricated.
 * Primary CTA: Save Changes (disabled when clean, enabled when dirty,
   loading while persisting, success/after completion).
 *
 * Authority boundaries (do not blur):
 * - Summary values derive from the resolved configuration + runtime state
   supplied by the parent SettingsPage; omitted entirely until loaded,
   never invented.
 * - Save state (dirty/valid/loading/success/error) is managed by the
   parent General form — the hero merely forwards the disabled/loading
   prop.
 * - Do NOT implement save semantics inside the hero; the parent handles
   the persistence contract.
 */

import { useCallback, useState } from 'react';
import { Button } from './settings-ui';
import { Status } from './settings-ui';

interface SettingsHeroProps {
  /** Dirty state from the general form — true when values differ from persisted. */
  dirty: boolean;
  /** Whether a save operation is in progress. */
  saving: boolean;
  /** Called when the user clicks Save Changes. */
  onSave: () => void;
  /** Optional runtime data for summary chips (workspace, env, last updated). */
  data?: {
    workspace?: string;
    environment?: string;
    lastUpdated?: string | null;
  };
}

export function SettingsHero({ dirty, saving, onSave, data }: SettingsHeroProps) {
  const [saved, setSaved] = useState(false);

  // Handle save success — mark as saved after a brief moment so the UI
  // can transition from "loading" to "success" before resetting.
  const handleSaveSuccess = useCallback(() => {
    setSaved(true);
    // Reset after 2s so the user sees the success state
    const timeout = setTimeout(() => {
      setSaved(false);
    }, 2000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <section className="st-panel border-b border-[var(--vestara-color-border-subtle)] pb-6">
      <div className="flex min-w-0 flex-col lg:flex-row gap-6 lg:gap-8 items-start lg:items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-[var(--vestara-font-size-xl)] font-semibold text-[var(--vestara-color-text-primary)]">
            Settings
          </h2>
          <p className="mt-1 text-[var(--vestara-font-size-sm)] text-[var(--vestara-color-text-muted)]">
            Configure your workspace, preferences, integrations, and system behavior.
          </p>
        </div>

        {/* Summary section — only show values that have authoritative backing. */}
        {data && (
          <div className="mt-4 flex flex-col lg:flex-row gap-4 lg:gap-2 lg:mt-0">
            {/* Workspace chip */}
            <div className="st-hero-chip lg:col-span-1">
              <span className="st-hero-chip-label">Workspace</span>
              <span className="st-hero-chip-value">
                {data.workspace ?? 'Not configured'}
              </span>
            </div>

            {/* Environment chip */}
            <div className="st-hero-chip lg:col-span-1">
              <span className="st-hero-chip-label">Environment</span>
              <span className="st-hero-chip-value">
                {data.environment ?? 'Not configured'}
              </span>
            </div>

            {/* Last updated chip — only if we have a timestamp. */}
            {data.lastUpdated && (
              <div className="st-hero-chip lg:col-span-1">
                <span className="st-hero-chip-label">Last updated</span>
                <span className="st-hero-chip-value">
                  {data.lastUpdated}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Primary Save CTA — reflects dirty/loading state. */}
        <div className="mt-6 lg:mt-0 flex flex-col lg:flex-row gap-3">
          <Button
            disabled={!dirty || saving}
            primary
            onClick={onSave}
          >
            {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
          </Button>
          {saved && (
            <Status
              value="saved"
              aria-label="Settings saved successfully"
              bare
            />
          )}
        </div>
      </div>
    </section>
  );
}