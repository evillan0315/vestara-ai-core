/**
 * VES-UI-001 T1 (G12): Startup Wallpaper
 *
 * Single-size optimized canvas artwork served as AVIF → WebP → PNG
 * (progressive enhancement; the PNG fallback keeps older renderers working).
 * The art is decorative (`aria-hidden`, empty `alt`), below-the-fold safe
 * (`loading="lazy"`, `decoding="async"`), and fills its positioned parent
 * (`object-cover`).
 *
 * Source: `assets/wallpapers/wallpaper-teal-giant-planet-mountain-lake.png`
 * (1671×941, byte-identical to the previously vendored PNG) transcoded with
 * ffmpeg (`libwebp` q80 / `libaom-av1` crf 28) to ONE optimized size —
 * no responsive ladder. The remaining `assets/wallpapers/` PNGs stay
 * archived (unshipped — nothing imports them); the prototype's
 * byte-identical `…_1.png` dead duplicate (A6) was dropped.
 *
 * `treatment="boot"` preserves the prototype boot treatment (10% opacity,
 * 20px blur — `BootScreen`'s `opacity-[0.10] blur-[20px]`) for the T4
 * boot/login state machine; `treatment="full"` (default) is the scrimmed
 * startup-canvas presentation.
 *
 * Architecture Traceability:
 *   VES-UI-001 Phase 1 (T1/G12 wallpaper pipeline)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §1.3
 */

export type StartupWallpaperTreatment = 'full' | 'boot';

export interface StartupWallpaperProps {
  treatment?: StartupWallpaperTreatment;
}

const SOURCES = {
  avif: '/startup/vestara-startup-bg.avif',
  webp: '/startup/vestara-startup-bg.webp',
  png: '/startup/vestara-startup-bg.png',
} as const;

export function StartupWallpaper({ treatment = 'full' }: StartupWallpaperProps) {
  return (
    <picture
      aria-hidden="true"
      data-treatment={treatment}
      className={treatment === 'boot' ? 'st-wallpaper st-wallpaper--boot' : 'st-wallpaper'}
    >
      <source srcSet={SOURCES.avif} type="image/avif" />
      <source srcSet={SOURCES.webp} type="image/webp" />
      <img
        src={SOURCES.png}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </picture>
  );
}
