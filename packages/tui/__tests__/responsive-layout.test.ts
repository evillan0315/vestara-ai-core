import { describe, expect, it } from 'vitest';
import { breakpointFor, clamp, computeShellLayout } from '../src/layout/responsive-layout.js';

describe('responsive breakpoints', () => {
  it('maps widths to breakpoints', () => {
    expect(breakpointFor(80)).toBe('narrow');
    expect(breakpointFor(100)).toBe('medium');
    expect(breakpointFor(120)).toBe('wide');
    expect(breakpointFor(160)).toBe('wide');
  });
});

describe('shell layout calculation', () => {
  it('hides the sidebar on narrow terminals', () => {
    const layout = computeShellLayout({ columns: 80, rows: 24 });
    expect(layout.breakpoint).toBe('narrow');
    expect(layout.showSidebar).toBe(false);
    expect(layout.showNavigation).toBe(false);
  });

  it('shows the sidebar and navigation on wide terminals', () => {
    const layout = computeShellLayout({ columns: 160, rows: 50 });
    expect(layout.breakpoint).toBe('wide');
    expect(layout.showSidebar).toBe(true);
    expect(layout.showNavigation).toBe(true);
    expect(layout.mainWidth).toBeGreaterThan(100);
  });

  it('clamps modal width to the viewport on narrow terminals', () => {
    const layout = computeShellLayout({ columns: 60, rows: 24 });
    expect(layout.modalWidth).toBeLessThanOrEqual(56);
    expect(layout.modalWidth).toBeGreaterThan(40);
  });

  it('clamps modal height to the viewport', () => {
    const layout = computeShellLayout({ columns: 120, rows: 12 });
    expect(layout.modalHeight).toBeLessThanOrEqual(12);
  });

  it('caps modal width at the configured maximum on wide terminals', () => {
    const layout = computeShellLayout({ columns: 160, rows: 50 });
    expect(layout.modalWidth).toBeLessThanOrEqual(96);
  });

  it('clamp clamps values to a range', () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(50, 10, 20)).toBe(20);
    expect(clamp(15, 10, 20)).toBe(15);
  });
});
