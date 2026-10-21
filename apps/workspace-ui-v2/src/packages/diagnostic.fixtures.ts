// Diagnostic fixture — telemetry header + bar-strip parameters.
// Bar heights are derived deterministically (see lib/random.ts); this module
// holds the strip shape only. Pattern: overview.fixtures.ts.

export const DIAGNOSTIC_TITLE = 'LIVE TELEMETRY • Diagnostic Center';

export const DIAGNOSTIC_BAR_COUNT = 32;

// Fixed strip seed — bar heights reproduce exactly every render.
export const DIAGNOSTIC_SEED = 112;

export interface DiagnosticBar {
  id: string;
}

export const DIAGNOSTIC_BARS: DiagnosticBar[] = Array.from({ length: DIAGNOSTIC_BAR_COUNT }, (_, i) => ({
  id: `telemetry-bar-${String(i + 1).padStart(2, '0')}`,
}));
