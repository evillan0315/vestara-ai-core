import { useId, type JSX } from 'react';

export interface VestaraMarkProps {
  /** Rendered pixel size (square). */
  size?: number;
  /** CSS class applied to the root <svg> element. */
  className?: string;
}

/**
 * Inline Vestara "V" mark with theme-aware metallic gradient.
 *
 * Same geometry as `public/logo.svg`, but the gold ramp derives from the
 * live theme tokens (`--vestara-accent-light` → `--vestara-accent` →
 * `--vestara-accent-dark`, set at runtime by `theme.tsx`), so the mark
 * re-tints automatically when the user picks a different accent color.
 * The black-metal core, shine sweep, and drop shadow stay neutral.
 *
 * Must stay inline (never `<img src>`) — external SVG files are opaque
 * to CSS and cannot follow theme variables.
 */
export function VestaraMark({ size = 46, className = '' }: VestaraMarkProps): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gold = `vestara-mark-gold-${uid}`;
  const goldDark = `vestara-mark-gold-dark-${uid}`;
  const blackMetal = `vestara-mark-black-${uid}`;
  const shine = `vestara-mark-shine-${uid}`;
  const shadow = `vestara-mark-shadow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      role="img"
      aria-label="Vestara"
    >
      <defs>
        {/* Themed metallic ramp — follows the selected accent */}
        <linearGradient id={gold} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: 'var(--vestara-accent-light)' }} />
          <stop offset="35%" style={{ stopColor: 'var(--vestara-accent)' }} />
          <stop offset="70%" style={{ stopColor: 'var(--vestara-accent-dark)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--vestara-accent-dark)' }} />
        </linearGradient>

        {/* Themed edge metal — dark ↔ light ends of the accent */}
        <linearGradient id={goldDark} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: 'var(--vestara-accent-dark)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--vestara-accent-light)' }} />
        </linearGradient>

        {/* Neutral black-metal core (unchanged across themes) */}
        <linearGradient id={blackMetal} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4A4A4A" />
          <stop offset="28%" stopColor="#202020" />
          <stop offset="45%" stopColor="#111111" />
          <stop offset="60%" stopColor="#040404" />
          <stop offset="100%" stopColor="#000000" />
        </linearGradient>

        {/* Neutral shine sweep */}
        <linearGradient id={shine} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <filter id={shadow} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000000" floodOpacity="0.18" />
        </filter>
      </defs>

      <g filter={`url(#${shadow})`} transform="translate(46 46) scale(0.82)">
        {/* Outer V */}
        <path
          d="M40 40 L190 40 L256 170 L322 40 L472 40 L282 470 L230 470 Z"
          fill={`url(#${gold})`}
        />
        {/* Inner black */}
        <path
          d="M105 80 L180 80 L256 235 L332 80 L407 80 L270 410 L242 410 Z"
          fill={`url(#${blackMetal})`}
        />
        {/* Inner border */}
        <path
          d="M122 97 L187 97 L256 243 L325 97 L390 97 L267 387 L245 387 Z"
          fill="none"
          stroke={`url(#${goldDark})`}
          strokeWidth="8"
          strokeLinejoin="round"
        />
        {/* Center spine */}
        <path d="M252 168 L260 168 L260 470 L252 470 Z" fill={`url(#${goldDark})`} />
        {/* Metallic highlight */}
        <path
          d="M58 45 L182 45 L256 185 L330 45 L454 45 L270 458 L242 458 Z"
          fill={`url(#${shine})`}
          opacity="0.35"
        />
      </g>
    </svg>
  );
}
