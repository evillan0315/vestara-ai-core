import type { JSX } from 'react';

export interface VestaraWordmarkProps {
  /** Override the SVG width. Height scales proportionally. */
  width?: number | string;
  /** Override the SVG height. Width scales proportionally. */
  height?: number | string;
  /** CSS class applied to the root <svg> element. */
  className?: string;
  /** Stroke / fill color for the wordmark. Defaults to currentColor. */
  color?: string;
  /** Show the "Building Tomorrow, Together" tagline beneath the wordmark. */
  showTagline?: boolean;
  /** Color for the tagline text. Defaults to indigo-300 (#A5B4FC). */
  taglineColor?: string;
}

/**
 * SVG-based Vestara wordmark with fixed vector geometry.
 *
 * Every letter is a pure SVG path — no font dependencies, no platform
 * rendering drift.  The stylised **E** (three horizontal bars, no stem)
 * and **A** (open, no crossbar) match the canonical brand mark used in
 * wallpapers, splash screens, and documentation.
 *
 * @example
 * ```tsx
 * <VestaraWordmark />
 * <VestaraWordmark width={240} showTagline />
 * <VestaraWordmark color="#D4A843" width="100%" />
 * ```
 */
export function VestaraWordmark({
  width = 320,
  height,
  className = '',
  color = 'currentColor',
  showTagline = false,
  taglineColor = '#A5B4FC',
}: VestaraWordmarkProps): JSX.Element {
  return (
    <div className={`inline-flex flex-col ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 840 80"
        width={width}
        height={height}
        fill="none"
        stroke={color}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label="Vestara"
      >
        {/* ── V ── */}
        <path d="M5 5 L50 75 L95 5" />

        {/* ── E (stylised — three horizontal bars, no stem) ── */}
        <line x1="125" y1="5" x2="215" y2="5" />
        <line x1="125" y1="40" x2="195" y2="40" />
        <line x1="125" y1="75" x2="215" y2="75" />

        {/* ── S ── */}
        <path d="M325 18 C325 5, 245 5, 245 18 C245 31, 315 35, 325 40 C335 45, 245 49, 245 62 C245 75, 325 75, 325 62" />

        {/* ── T ── */}
        <line x1="365" y1="5" x2="455" y2="5" />
        <line x1="410" y1="5" x2="410" y2="75" />

        {/* ── A (stylised — open, no crossbar) ── */}
        <path d="M505 75 L540 5 L575 75" />

        {/* ── R ── */}
        <line x1="605" y1="75" x2="605" y2="5" />
        <path d="M605 5 L660 5 C690 5, 690 40, 660 40 L605 40" />
        <path d="M640 40 L695 75" />

        {/* ── A (stylised — open, no crossbar) ── */}
        <path d="M745 75 L780 5 L815 75" />
      </svg>

      {showTagline && (
        <div
          style={{
            marginTop: '0.75rem',
            fontFamily: '"Montserrat", sans-serif',
            fontWeight: 300,
            fontSize: '0.6rem',
            letterSpacing: '0.42em',
            textTransform: 'uppercase' as const,
            color: taglineColor,
          }}
        >
          Building Tomorrow, Together
        </div>
      )}
    </div>
  );
}
