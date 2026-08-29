// Renderer-neutral responsive layout calculations.
//
// The approved UX defines wide, medium, and narrow terminal behavior and
// requires composer/status to remain fixed, the sidebar to collapse on narrow
// widths, and modals to stay within the viewport.

export type Breakpoint = 'narrow' | 'medium' | 'wide';

export interface LayoutViewport {
  readonly columns: number;
  readonly rows: number;
}

export interface ShellLayout {
  readonly breakpoint: Breakpoint;
  readonly showSidebar: boolean;
  readonly showNavigation: boolean;
  readonly sidebarWidth: number;
  readonly mainWidth: number;
  readonly modalWidth: number;
  readonly modalHeight: number;
}

export const SIDEBAR_WIDTH = 32;
export const NAVIGATION_WIDTH = 16;

/** Derive the active breakpoint from terminal columns. */
export function breakpointFor(columns: number): Breakpoint {
  if (columns < 90) return 'narrow';
  if (columns < 120) return 'medium';
  return 'wide';
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Compute the shell layout. The sidebar is hidden on narrow terminals; the
 * main workspace owns the remaining width. Modal bounds are clamped so they
 * never exceed the viewport.
 */
export function computeShellLayout(viewport: LayoutViewport): ShellLayout {
  const breakpoint = breakpointFor(viewport.columns);
  const showSidebar = breakpoint !== 'narrow';
  const showNavigation = breakpoint !== 'narrow';
  const sidebarWidth = showSidebar ? SIDEBAR_WIDTH : 0;
  const reservedWidth = sidebarWidth + (showNavigation ? NAVIGATION_WIDTH : 0);
  const availableMain = Math.max(20, viewport.columns - reservedWidth);

  const modalWidth = breakpoint === 'narrow' ? viewport.columns - 4 : clamp(Math.floor(viewport.columns * 0.8), 52, 96);
  const modalHeight = clamp(viewport.rows - 6, 10, 40);

  return {
    breakpoint,
    showSidebar,
    showNavigation,
    sidebarWidth,
    mainWidth: availableMain,
    modalWidth,
    modalHeight,
  };
}
