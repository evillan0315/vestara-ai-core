// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspacePanelLayout } from './WorkspacePanelLayout.js';

describe('WorkspacePanelLayout (UI-FOUNDATION-006)', () => {
  it('renders hero above content in a single token-driven panel', () => {
    const { container } = render(
      <WorkspacePanelLayout hero={<div data-testid="hero">Hero</div>}>
        <div data-testid="content">Content</div>
      </WorkspacePanelLayout>,
    );
    expect(screen.getByTestId('hero').textContent).toBe('Hero');
    expect(screen.getByTestId('content').textContent).toBe('Content');
    const panel = container.firstElementChild as HTMLElement;
    // Geometry comes from tokens — no literal widths or spacing.
    expect(panel.className).toContain('max-w-[var(--vestara-page-max-width)]');
    expect(panel.className).toContain('px-[var(--vestara-spacing-page)]');
    expect(panel.className).not.toMatch(/max-w-\[\d+px\]/);
    expect(panel.className).not.toMatch(/px-\d/);
  });

  it('fluid mode drops the max-width constraint', () => {
    const { container } = render(
      <WorkspacePanelLayout fluid>
        <div>Content</div>
      </WorkspacePanelLayout>,
    );
    const panel = container.firstElementChild as HTMLElement;
    expect(panel.className).toContain('max-w-none');
    expect(panel.className).not.toContain('vestara-page-max-width');
  });
});
