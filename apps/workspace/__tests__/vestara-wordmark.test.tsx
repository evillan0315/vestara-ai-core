/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VestaraWordmark } from '../src/components/branding/index.js';

afterEach(() => {
  cleanup();
});

describe('VestaraWordmark', () => {
  it('renders an SVG with aria-label "Vestara"', () => {
    const { container } = render(<VestaraWordmark />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('aria-label')).toBe('Vestara');
  });

  it('uses a 840x80 viewBox for fixed vector geometry', () => {
    const { container } = render(<VestaraWordmark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 840 80');
  });

  it('renders all seven letter paths/lines', () => {
    const { container } = render(<VestaraWordmark />);
    const svg = container.querySelector('svg');
    // V (path), E (3 lines), S (path), T (2 lines), A (path), R (line + path + path), A (path)
    const paths = svg?.querySelectorAll('path');
    const lines = svg?.querySelectorAll('line');
    expect((paths?.length ?? 0) + (lines?.length ?? 0)).toBeGreaterThanOrEqual(7);
  });

  it('applies custom color via stroke', () => {
    const { container } = render(<VestaraWordmark color="#D4A843" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('#D4A843');
  });

  it('defaults stroke to currentColor', () => {
    const { container } = render(<VestaraWordmark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it('applies custom width', () => {
    const { container } = render(<VestaraWordmark width={240} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('240');
  });

  it('hides tagline by default', () => {
    const { container } = render(<VestaraWordmark />);
    expect(container.textContent).not.toContain('Building Tomorrow');
  });

  it('shows tagline when showTagline is true', () => {
    render(<VestaraWordmark showTagline />);
    expect(screen.getByText('Building Tomorrow, Together')).toBeTruthy();
  });

  it('applies className to the root wrapper', () => {
    const { container } = render(<VestaraWordmark className="my-class" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.className).toContain('my-class');
  });

  it('uses Montserrat font for tagline', () => {
    render(<VestaraWordmark showTagline />);
    const tagline = screen.getByText('Building Tomorrow, Together');
    expect(tagline.style.fontFamily).toContain('Montserrat');
  });

  it('has fill="none" on the SVG (stroke-only rendering)', () => {
    const { container } = render(<VestaraWordmark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('none');
  });

  it('uses round stroke-linecap and stroke-linejoin', () => {
    const { container } = render(<VestaraWordmark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('stroke-linecap')).toBe('round');
    expect(svg?.getAttribute('stroke-linejoin')).toBe('round');
  });
});
