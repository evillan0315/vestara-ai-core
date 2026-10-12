/**
 * VOS-STARTUP-001 P1: Brand Lockup
 *
 * Centered identity lockup: Vestara mark, wordmark, and motto.
 * Presentation only — not navigation.
 */

import { VestaraMark } from '../../../components/branding/index.js';

export function BrandLockup() {
  return (
    <div className="flex flex-col items-center gap-[var(--vestara-spacing-element)] text-center">
      <div aria-hidden="true" className="st-brand-mark">
        <VestaraMark size={96} />
      </div>
      <p className="text-[length:var(--vestara-font-size-lg)] font-semibold tracking-[0.35em]">VESTARA</p>
      <p className="text-[length:var(--vestara-font-size-xs)] tracking-[0.3em] text-[var(--st-muted)]">
        AI OPERATING SYSTEM
      </p>
      <p className="text-[length:var(--vestara-font-size-xs)] tracking-[0.2em] text-[var(--st-sub)]">
        THINK · PLAN · BUILD · VERIFY · TOGETHER
      </p>
    </div>
  );
}
