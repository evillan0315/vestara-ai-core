/**
 * VES-UI-D11: Responsive Layout Utilities
 *
 * Hooks and utilities for responsive layout behavior.
 * Uses CSS custom properties from @vestara/ui-tokens.
 *
 * Architecture Traceability:
 *   VES-UI-D: Layout Shell (phases 9-11)
 *   @see docs/blueprint/VESTARA-SHARED-UI-PLATFORM.md VES-UI-009
 *
 * @see VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md §8, §9
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { BREAKPOINTS } from '@vestara/ui-tokens';

// ─── Types ─────────────────────────────────────────────────────

export type ResponsiveBreakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

export interface ResponsiveState {
  /** Current breakpoint */
  breakpoint: ResponsiveBreakpoint;

  /** Current viewport width */
  width: number;

  /** Current viewport height */
  height: number;

  /** Whether viewport is mobile (< 768px) */
  isMobile: boolean;

  /** Whether viewport is tablet (768px - 1199px) */
  isTablet: boolean;

  /** Whether viewport is desktop (≥ 1200px) */
  isDesktop: boolean;

  /** Whether viewport is wide (≥ 1536px) */
  isWide: boolean;

  /** Whether viewport is portrait orientation */
  isPortrait: boolean;

  /** Whether viewport is landscape orientation */
  isLandscape: boolean;
}

export interface UseResponsiveLayoutOptions {
  /** Custom breakpoint values */
  breakpoints?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    wide?: number;
  };
}

// ─── Default Breakpoints ───────────────────────────────────────

const DEFAULT_BREAKPOINTS = {
  mobile: 768,
  tablet: 1200,
  desktop: 1536,
  wide: 1920,
};

// ─── useResponsiveLayout Hook ──────────────────────────────────

/**
 * VES-UI-D11: React hook for responsive layout state.
 *
 * Tracks viewport size and provides breakpoint information.
 *
 * @param options - Optional configuration
 */
export function useResponsiveLayout(
  options?: UseResponsiveLayoutOptions,
): ResponsiveState {
  const breakpoints = { ...DEFAULT_BREAKPOINTS, ...options?.breakpoints };

  const [state, setState] = useState<ResponsiveState>(() => {
    if (typeof window === 'undefined') {
      return {
        breakpoint: 'desktop',
        width: 1920,
        height: 1080,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isWide: true,
        isPortrait: false,
        isLandscape: true,
      };
    }

    const width = window.innerWidth;
    const height = window.innerHeight;
    return computeState(width, height, breakpoints);
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setState(computeState(width, height, breakpoints));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoints.mobile, breakpoints.tablet, breakpoints.desktop, breakpoints.wide]);

  return state;
}

function computeState(
  width: number,
  height: number,
  breakpoints: { mobile: number; tablet: number; desktop: number; wide: number },
): ResponsiveState {
  let breakpoint: ResponsiveBreakpoint;
  if (width < breakpoints.mobile) breakpoint = 'mobile';
  else if (width < breakpoints.tablet) breakpoint = 'tablet';
  else if (width < breakpoints.desktop) breakpoint = 'desktop';
  else breakpoint = 'wide';

  return {
    breakpoint,
    width,
    height,
    isMobile: width < breakpoints.mobile,
    isTablet: width >= breakpoints.mobile && width < breakpoints.tablet,
    isDesktop: width >= breakpoints.tablet && width < breakpoints.desktop,
    isWide: width >= breakpoints.desktop,
    isPortrait: height > width,
    isLandscape: width > height,
  };
}

// ─── useBreakpoint Hook ────────────────────────────────────────

/**
 * VES-UI-D11: Simple hook that returns current breakpoint.
 */
export function useBreakpoint(): ResponsiveBreakpoint {
  const { breakpoint } = useResponsiveLayout();
  return breakpoint;
}

// ─── useMediaQuery Hook ────────────────────────────────────────

/**
 * VES-UI-D11: Hook for CSS media query matching.
 *
 * @param query - CSS media query string
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// ─── Responsive Utility Functions ──────────────────────────────

/**
 * VES-UI-D11: Check if current breakpoint matches.
 */
export function matchesBreakpoint(
  current: ResponsiveBreakpoint,
  target: ResponsiveBreakpoint | ResponsiveBreakpoint[],
): boolean {
  const targets = Array.isArray(target) ? target : [target];
  return targets.includes(current);
}

/**
 * VES-UI-D11: Get responsive value based on breakpoint.
 */
export function responsive<T>(
  state: ResponsiveState,
  values: { mobile?: T; tablet?: T; desktop?: T; wide?: T; default: T },
): T {
  if (state.isWide && values.wide !== undefined) return values.wide;
  if (state.isDesktop && values.desktop !== undefined) return values.desktop;
  if (state.isTablet && values.tablet !== undefined) return values.tablet;
  if (state.isMobile && values.mobile !== undefined) return values.mobile;
  return values.default;
}

// ─── CSS Breakpoint Utilities ──────────────────────────────────

/**
 * VES-UI-D11: Generate CSS media query string.
 */
export function mediaQuery(
  breakpoint: ResponsiveBreakpoint,
  direction: 'min' | 'max' = 'min',
): string {
  const widths: Record<ResponsiveBreakpoint, number> = {
    mobile: 0,
    tablet: parseInt(BREAKPOINTS.sm),
    desktop: parseInt(BREAKPOINTS.lg),
    wide: parseInt(BREAKPOINTS['2xl']),
  };

  return `@media (${direction}-width: ${widths[breakpoint]}px)`;
}

/**
 * VES-UI-D11: Generate responsive CSS classes.
 */
export function responsiveClasses(
  classes: {
    mobile?: string;
    tablet?: string;
    desktop?: string;
    wide?: string;
    base: string;
  },
): string {
  const parts = [classes.base];
  if (classes.mobile) parts.push(`max-sm:${classes.mobile}`);
  if (classes.tablet) parts.push(`sm:${classes.tablet}`);
  if (classes.desktop) parts.push(`lg:${classes.desktop}`);
  if (classes.wide) parts.push(`xl:${classes.wide}`);
  return parts.join(' ');
}
