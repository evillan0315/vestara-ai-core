/**
 * VES-UI-001 T2: Dock acceptance guards.
 *
 * - 48px dock (`h-[var(--ds-dock-height)]`, `--ds-dock-height: 3rem`).
 * - Eight package slots; open windows show the accent dot, minimized-only
 *   types show the warning dot, closed types show no indicator.
 * - Clicking a minimized type restores it; clicking a closed type opens it.
 * - Theme-aware `VestaraMark` cap is present.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dock } from './Dock.js';
import { desktopShellDockOrderFixture } from './desktop-shell.fixtures.js';
import type { WinData } from './types.js';

afterEach(() => {
  cleanup();
});

const BASE_WIN: WinData = {
  id: 'win-terminal',
  title: 'Terminal',
  subtitle: 'Shell session',
  x: 160,
  y: 120,
  w: 640,
  h: 360,
  z: 2,
  minimized: false,
  maximized: false,
  type: 'terminal',
};

function renderDock(windows: readonly WinData[] = []) {
  const onOpen = vi.fn();
  const onRestore = vi.fn();
  const view = render(<Dock windows={windows} onOpen={onOpen} onRestore={onRestore} />);
  return { ...view, onOpen, onRestore };
}

describe('Dock', () => {
  it('renders 48px high with all eight slots', () => {
    const { container } = renderDock();
    const toolbar = screen.getByRole('toolbar', { name: 'Application dock' });
    expect(toolbar).toHaveClass('h-[var(--ds-dock-height)]');
    expect(toolbar).toBeInTheDocument();
    expect(container.querySelectorAll('button[title]').length).toBe(8);
    expect(desktopShellDockOrderFixture).toHaveLength(8);
  });

  it('marks open windows with the accent indicator', () => {
    renderDock([{ ...BASE_WIN }]);
    const indicator = screen.getByTestId('dock-indicator-terminal');
    expect(indicator).toHaveAttribute('data-state', 'open');
    expect(indicator.className).toMatch(/bg-\[var\(--ds-accent\)\]/);
    expect(screen.getByRole('button', { name: 'Terminal (open)' })).toBeInTheDocument();
  });

  it('marks minimized-only types with the warning indicator', () => {
    renderDock([{ ...BASE_WIN, minimized: true }]);
    const indicator = screen.getByTestId('dock-indicator-terminal');
    expect(indicator).toHaveAttribute('data-state', 'minimized');
    expect(indicator.className).toMatch(/bg-\[var\(--ds-warning\)\]/);
    expect(screen.getByRole('button', { name: 'Terminal (minimized)' })).toBeInTheDocument();
  });

  it('shows no indicator for closed types', () => {
    renderDock([]);
    expect(screen.queryByTestId('dock-indicator-terminal')).toBeNull();
    expect(screen.getByRole('button', { name: 'Terminal (closed)' })).toBeInTheDocument();
  });

  it('restores a minimized window instead of opening a new one', () => {
    const { onOpen, onRestore } = renderDock([{ ...BASE_WIN, minimized: true }]);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal (minimized)' }));
    expect(onRestore).toHaveBeenCalledWith('win-terminal');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens a closed type', () => {
    const { onOpen, onRestore } = renderDock([]);
    fireEvent.click(screen.getByRole('button', { name: 'Terminal (closed)' }));
    expect(onOpen).toHaveBeenCalledWith('terminal');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('renders the VestaraMark cap', () => {
    const { container } = renderDock();
    expect(container.querySelector('svg[aria-label="Vestara"]')).toBeInTheDocument();
  });
});
