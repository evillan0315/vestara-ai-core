/**
 * LauncherDock anchor placement: the dock follows the movable launcher orb.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LauncherDock } from './LauncherDock.js';

afterEach(() => {
  cleanup();
});

const ITEMS = [{ id: 'c1', title: 'First chat', updatedAt: new Date().toISOString() }];

function renderDock(anchor: { x: number; y: number } | null | undefined) {
  return render(
    <LauncherDock open items={ITEMS} selectedId={null} onSelect={() => {}} anchor={anchor} />,
  );
}

describe('LauncherDock anchor placement', () => {
  it('opens below-left when the launcher is parked top-left', () => {
    // jsdom viewport is 1024x768: y + 24 <= 384 -> below; x < 320 -> left.
    const { container } = renderDock({ x: 100, y: 100 });

    expect(screen.getByTestId('launcher-dock')).toBeInTheDocument();
    const dock = container.firstElementChild;
    expect(dock).toHaveClass('top-[calc(100%+12px)]', 'left-0');
  });

  it('opens above-right when the launcher is parked bottom-right', () => {
    const { container } = renderDock({ x: 900, y: 700 });

    const dock = container.firstElementChild;
    expect(dock).toHaveClass('bottom-[calc(100%+12px)]', 'right-0');
  });

  it('keeps the legacy above-right placement without an anchor', () => {
    const { container } = renderDock(undefined);

    const dock = container.firstElementChild;
    expect(dock).toHaveClass('bottom-[calc(100%+12px)]', 'right-0');
  });
});
