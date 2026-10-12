/**
 * VOS-STARTUP-001 P1: Startup Footer
 *
 * Lower quote plus corner-anchored version and attribution metadata.
 */

import type { StartupViewModel } from '../startup.types';

export function StartupFooter({ model }: { model: StartupViewModel }) {
  return (
    <div className="w-full">
      <div className="flex flex-col items-center gap-[var(--vestara-spacing-element)] text-center">
        <span aria-hidden="true" className="h-px w-24 bg-[var(--st-card-border)]" />
        <p className="text-[length:var(--vestara-font-size-sm)] text-[var(--st-quote)]">“{model.quote}”</p>
        <p className="text-[length:var(--vestara-font-size-xs)] tracking-[0.25em] text-[var(--st-muted)]">
          — {model.quoteBy}
        </p>
      </div>
      <div className="mt-[var(--vestara-spacing-section)] flex items-end justify-between gap-[var(--vestara-spacing-section)]">
        <p className="text-[length:var(--vestara-font-size-xs)] text-[var(--st-muted)]">Vestara OS · startup preview</p>
        <p className="text-right text-[length:var(--vestara-font-size-xs)] text-[var(--st-muted)]">
          POWERED BY OPENCODE
          <br />
          BUILT FOR PEOPLE AND AGENTS
        </p>
      </div>
    </div>
  );
}
