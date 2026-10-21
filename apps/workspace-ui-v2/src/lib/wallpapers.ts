/**
 * U4 — bundled wallpaper manifest (workspace-ui-v2).
 *
 * Single-size transcoded set shipped in the Tauri bundle via Vite asset
 * graph (`frontendDist: ../dist`). Budget: no 1.8 MB+ PNG in the bundle
 * (VES-UI-002 U4 gate) — PNG 222 KB / WebP 54 KB / AVIF 36 KB @ 1671×941.
 *
 * Architecture Traceability:
 *   U4: wallpaper assets in bundle (transcoded, budgeted)
 */

export const WALLPAPER_WIDTH = 1671;
export const WALLPAPER_HEIGHT = 941;

/** Maximum bytes for any single shipped wallpaper file (1.8 MB gate). */
export const WALLPAPER_FILE_BUDGET_BYTES = 1_800_000;

export const WALLPAPER_SOURCES = {
  avif: new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.avif', import.meta.url).href,
  webp: new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.webp', import.meta.url).href,
  png: new URL('../assets/wallpaper-teal-giant-planet-mountain-lake.png', import.meta.url).href,
} as const;
