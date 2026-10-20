/**
 * VES-UI-001 T2: DesktopIcons acceptance guards.
 *
 * - Five launcher icons from `desktopShellDesktopIconsFixture`.
 * - Double-click opens; Enter/Space opens; single click only selects.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DesktopIcons } from './DesktopIcons.js';
import { desktopShellDesktopIconsFixture } from './desktop-shell.fixtures.js';

afterEach(() => {
  cleanup();
});

function renderIcons() {
  const onOpen = vi.fn();
  const view = render(<DesktopIcons onOpen={onOpen} />);
  return { ...view, onOpen };
}

describe('DesktopIcons', () => {
  it('renders the five fixture icons', () => {
    renderIcons();
    expect(desktopShellDesktopIconsFixture).toHaveLength(5);
    for (const { label } of desktopShellDesktopIconsFixture) {
      expect(screen.getByRole('button', { name: `Open ${label}` })).toBeInTheDocument();
    }
  });

  it('opens on double-click', () => {
    const { onOpen } = renderIcons();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Open Terminal' }));
    expect(onOpen).toHaveBeenCalledWith('terminal');
  });

  it('opens on Enter and Space', () => {
    const { onOpen } = renderIcons();
    const icon = screen.getByRole('button', { name: 'Open Files' });
    fireEvent.keyDown(icon, { key: 'Enter' });
    fireEvent.keyDown(icon, { key: ' ' });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenNthCalledWith(1, 'files');
  });

  it('single click only selects — it does not open', () => {
    const { onOpen } = renderIcons();
    const icon = screen.getByRole('button', { name: 'Open Marketplace' });
    fireEvent.click(icon);
    expect(onOpen).not.toHaveBeenCalled();
    expect(icon).toHaveAttribute('aria-pressed', 'true');
  });
});
