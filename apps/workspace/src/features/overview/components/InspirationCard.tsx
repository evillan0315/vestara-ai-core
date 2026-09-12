/**
 * VES-OVERVIEW-001: Inspiration Card Component
 *
 * Motivational banner on the Marketplace publish-CTA grammar
 * (radial accent glow panel) with progress dots.
 */

export function InspirationCard() {
  return (
    <div className="mpg-publish-cta mpg-enter relative overflow-hidden" style={{ animationDelay: '120ms' }}>
      <div aria-hidden="true" className="absolute left-3 top-2 text-3xl leading-none text-[var(--vestara-accent-primary)]/30">“</div>
      <p className="relative z-[2] max-w-[80%] text-[12.5px] font-medium leading-relaxed text-[var(--ov-quote-text)]">
        Small steps, compounded by consistency, create extraordinary results.
      </p>
      <div className="relative z-[2] mt-2 flex items-center justify-between">
        <p className="text-[11px] text-[var(--ov-quote-sub)]">— Vestara · Daily Momentum</p>
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1.5 w-4 rounded-full bg-[var(--ov-quote-dot-active)]" style={{ boxShadow: '0 0 6px var(--ov-quote-dot-active)' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ov-quote-dot-idle)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ov-quote-dot-idle)]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--ov-quote-dot-idle)]" />
        </div>
      </div>
    </div>
  );
}
