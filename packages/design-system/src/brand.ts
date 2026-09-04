// ─── Vestara brand tokens (renderer-neutral) ─────────────────
// Canonical typography and color constants for the Vestara wordmark
// and tagline.  Consumed by both the React workspace UI and the
// terminal TUI for consistent brand presentation.

export interface BrandTypographyToken {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly letterSpacing: string;
  readonly textTransform: 'uppercase' | 'none';
}

export interface BrandColorToken {
  readonly wordmark: string;
  readonly tagline: string;
}

/** Typography tokens for the VESTARA wordmark. */
export const VESTARA_WORDMARKTypography: BrandTypographyToken = {
  fontFamily: '"Montserrat", sans-serif',
  fontWeight: 300,
  letterSpacing: '0.28em',
  textTransform: 'uppercase',
} as const;

/** Typography tokens for the "Building Tomorrow, Together" tagline. */
export const VESTARA_TAGLINETypography: BrandTypographyToken = {
  fontFamily: '"Montserrat", sans-serif',
  fontWeight: 300,
  letterSpacing: '0.42em',
  textTransform: 'uppercase',
} as const;

/** Default brand colors for the wordmark and tagline. */
export const VESTARA_BRAND_COLORS: BrandColorToken = {
  wordmark: '#FFFFFF',
  tagline: '#A5B4FC', // indigo-300
} as const;

/** Combined brand token set. */
export const vestaraBrandTokens = {
  wordmark: VESTARA_WORDMARKTypography,
  tagline: VESTARA_TAGLINETypography,
  colors: VESTARA_BRAND_COLORS,
} as const;
