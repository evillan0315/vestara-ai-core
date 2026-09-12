/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DynamicFavicon, VestaraMark } from '../src/components/branding/index.js';
import { ThemeProvider } from '../src/lib/theme.js';

afterEach(() => {
  cleanup();
});

describe('VestaraMark', () => {
  it('renders an SVG with aria-label "Vestara"', () => {
    const { container } = render(<VestaraMark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toBe('Vestara');
  });

  it('binds the gold gradient to the live accent tokens', () => {
    const { container } = render(<VestaraMark />);
    const styles = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('style') ?? '');
    expect(styles.some((s) => s.includes('var(--vestara-accent-light)'))).toBe(true);
    expect(styles.some((s) => s.includes('var(--vestara-accent-dark)'))).toBe(true);
    // The plain accent appears as a stop or not at all — never a hardcoded gold hex.
    const stops = [...container.querySelectorAll('stop')].map((s) => s.getAttribute('stop-color') ?? '');
    expect(stops.join(' ')).not.toMatch(/#F5C542|#C98A1F|#8E5A12/i);
  });

  it('uses unique gradient ids per instance', () => {
    const { container } = render(
      <>
        <VestaraMark />
        <VestaraMark />
      </>,
    );
    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applies custom size', () => {
    const { container } = render(<VestaraMark size={32} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('32');
  });
});

describe('DynamicFavicon', () => {
  it('replaces the icon link with an accent-built data URL', () => {
    render(
      <ThemeProvider>
        <DynamicFavicon />
      </ThemeProvider>,
    );
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link?.href).toContain('data:image/svg+xml');
    // Default accent is gold (#D4A843) — proves the URL derives from the theme.
    expect(link?.href).toContain('D4A843');
  });
});
