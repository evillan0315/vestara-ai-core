/**
 * VOS-STARTUP-001 P1: Readiness Card
 *
 * Translucent card with loading indicator, headline, subline, checklist,
 * and degraded diagnostics when present.
 */

import type { StartupViewModel } from '../startup.types';
import { ReadinessChecklist } from './ReadinessChecklist';

export function ReadinessCard({ model }: { model: StartupViewModel }) {
  const degraded = model.state === 'degraded';
  return (
    <section
      aria-live="polite"
      aria-label="Startup readiness"
      className="w-full max-w-md rounded-[var(--vestara-radius-lg)] border border-[var(--st-card-border)] bg-[var(--st-card-bg)] p-[var(--vestara-spacing-section)] shadow-[var(--st-card-shadow)]"
    >
      <div className="flex items-center gap-[var(--vestara-spacing-element)]">
        <span
          aria-hidden="true"
          className={
            degraded
              ? 'size-6 rounded-[var(--vestara-radius-full)] bg-[var(--st-check-failed-bg)]'
              : 'size-6 animate-spin rounded-[var(--vestara-radius-full)] border border-[var(--st-accent-border)] border-t-[var(--st-accent)]'
          }
        />
        <div>
          <h2 className="text-[length:var(--vestara-font-size-base)] font-semibold">{model.headline}</h2>
          <p className="text-[length:var(--vestara-font-size-sm)] text-[var(--st-sub)]">{model.subline}</p>
        </div>
      </div>
      <div className="mt-[var(--vestara-spacing-section)]">
        <ReadinessChecklist rows={model.checklist} />
      </div>
      {degraded && model.diagnosticsCode ? (
        <div className="mt-[var(--vestara-spacing-section)] rounded-[var(--vestara-radius)] border border-[var(--st-accent-border)] bg-[var(--st-accent-soft)] p-[var(--vestara-spacing-element)]">
          <p className="text-[length:var(--vestara-font-size-sm)] font-medium">{model.diagnosticsCode}</p>
          {model.recoveryAction ? (
            <p className="text-[length:var(--vestara-font-size-sm)] text-[var(--st-sub)]">{model.recoveryAction}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
