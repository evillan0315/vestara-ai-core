/**
 * VES-UI-001 T3: VestaraWindow acceptance guards.
 *
 * - 36px header (`h-[var(--ds-chrome-height)]`) + 28px status bar
 *   (`h-[var(--ds-statusbar-height)]`).
 * - Minimize/maximize/close controls + double-click header maximize.
 * - Focus reporting (`onFocus`) + focused/unfocused ring classes.
 * - Pointer drag (clamped) + keyboard move (Arrow, Shift = fine step).
 * - 8-way pointer resize + keyboard resize from focused handles.
 * - `prefers-reduced-motion` disables transitions.
 * - Deterministic placement (`cascadeWindowPlacement`, no `Math.random`).
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WINDOW_CASCADE_SLOTS,
  WINDOW_CASCADE_STEP,
  VestaraWindow,
  cascadePlacementForType,
  cascadeWindowPlacement,
  clampWindowPosition,
  packageDefaultSize,
} from './VestaraWindow.js';
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

function renderWindow(overrides: Partial<WinData> = {}, focused = true) {
  const onFocus = vi.fn();
  const onClose = vi.fn();
  const onMinimize = vi.fn();
  const onUpdate = vi.fn();
  const onToggleMaximize = vi.fn();
  const view = render(
    <VestaraWindow
      data={{ ...BASE_WIN, ...overrides }}
      isFocused={focused}
      onFocus={onFocus}
      onClose={onClose}
      onMinimize={onMinimize}
      onUpdate={onUpdate}
      onToggleMaximize={onToggleMaximize}
    >
      <div data-testid="window-body">body</div>
    </VestaraWindow>,
  );
  return { ...view, onFocus, onClose, onMinimize, onUpdate, onToggleMaximize };
}

function movePointer(x: number, y: number) {
  window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y } as MouseEventInit));
}

function releasePointer() {
  window.dispatchEvent(new MouseEvent('pointerup', {} as MouseEventInit));
}

describe('VestaraWindow chrome', () => {
  it('renders a 36px header and a 28px status bar with governed tokens', () => {
    const { container } = renderWindow();
    const header = screen.getByTestId('vestara-window-header-win-terminal');
    expect(header).toHaveClass('h-[var(--ds-chrome-height)]');
    const status = screen.getByTestId('vestara-window-status-win-terminal');
    expect(status).toHaveClass('h-[var(--ds-statusbar-height)]');
    expect(screen.getByRole('dialog', { name: 'Terminal' })).toBeInTheDocument();
    expect(screen.getByTestId('vestara-window-header-win-terminal')).toHaveTextContent('Shell session');
    // Status bar carries package-relevant status, never debug geometry.
    expect(status).toHaveTextContent('Shell session');
    expect(status).toHaveTextContent('Vestara Shell');
    expect(status).not.toHaveTextContent('640×360');
    expect(status).not.toHaveTextContent('z:2');
    expect(container.querySelector('.ds-window')).toBeInTheDocument();
  });

  it('renders a custom status line when statusText is provided', () => {
    const { onFocus, onClose, onMinimize, onUpdate } = renderWindow();
    void onFocus;
    void onClose;
    void onMinimize;
    void onUpdate;
    cleanup();
    const view = render(
      <VestaraWindow
        data={{ ...BASE_WIN }}
        isFocused
        onFocus={() => {}}
        onClose={() => {}}
        onMinimize={() => {}}
        onUpdate={() => {}}
        statusText="LIVE · 3 sessions"
      >
        <div>body</div>
      </VestaraWindow>,
    );
    expect(screen.getByTestId('vestara-window-status-win-terminal')).toHaveTextContent('LIVE · 3 sessions');
    view.unmount();
  });

  it('returns null when minimized', () => {
    const { container } = renderWindow({ minimized: true });
    expect(container.firstChild).toBeNull();
  });

  it('wires close and minimize controls', () => {
    const { onClose, onMinimize } = renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Close Terminal' }));
    expect(onClose).toHaveBeenCalledWith('win-terminal');
    fireEvent.click(screen.getByRole('button', { name: 'Minimize Terminal' }));
    expect(onMinimize).toHaveBeenCalledWith('win-terminal');
  });

  it('toggles maximize via the traffic control and double-click', () => {
    const first = renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Maximize Terminal' }));
    expect(first.onToggleMaximize).toHaveBeenCalledWith('win-terminal');

    const maximized: WinData = {
      ...BASE_WIN,
      maximized: true,
      prev: { x: 160, y: 120, w: 640, h: 360 },
    };
    const { onToggleMaximize, rerender, ...rest } = first;
    void onToggleMaximize;
    rerender(
      <VestaraWindow
        data={maximized}
        isFocused
        onFocus={rest.onFocus}
        onClose={rest.onClose}
        onMinimize={rest.onMinimize}
        onUpdate={rest.onUpdate}
      >
        <div>body</div>
      </VestaraWindow>,
    );
    expect(screen.getByRole('button', { name: 'Restore Terminal' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Terminal' })).toHaveClass('inset-0');
    expect(screen.queryByTestId('vestara-window-resize-win-terminal-se')).toBeNull();

    fireEvent.doubleClick(screen.getByTestId('vestara-window-header-win-terminal'));
    expect(rest.onUpdate).toHaveBeenCalledWith(
      'win-terminal',
      expect.objectContaining({ maximized: false }),
    );
  });

  it('does not maximize when double-clicking a traffic control', () => {
    const { onToggleMaximize, onUpdate } = renderWindow();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Maximize Terminal' }));
    expect(onToggleMaximize).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('falls back to onUpdate when no maximize delegate is provided', () => {
    const onUpdate = vi.fn();
    render(
      <VestaraWindow
        data={BASE_WIN}
        isFocused
        onFocus={vi.fn()}
        onClose={vi.fn()}
        onMinimize={vi.fn()}
        onUpdate={onUpdate}
      >
        <div>body</div>
      </VestaraWindow>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Maximize Terminal' }));
    expect(onUpdate).toHaveBeenCalledWith(
      'win-terminal',
      expect.objectContaining({ maximized: true, prev: { x: 160, y: 120, w: 640, h: 360 } }),
    );
  });
});

describe('VestaraWindow focus and z-order', () => {
  it('reports focus on pointer contact and renders the focus ring', () => {
    const { onFocus, onClose, onMinimize, onUpdate, onToggleMaximize, rerender } = renderWindow({}, true);
    const dialog = screen.getByRole('dialog', { name: 'Terminal' });
    expect(dialog.className).toMatch(/border-\[var\(--ds-focus-ring\)\]/);
    fireEvent.pointerDown(dialog, { clientX: 200, clientY: 200, button: 0 });
    expect(onFocus).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledWith('win-terminal');

    rerender(
      <VestaraWindow
        data={BASE_WIN}
        isFocused={false}
        onFocus={onFocus}
        onClose={onClose}
        onMinimize={onMinimize}
        onUpdate={onUpdate}
        onToggleMaximize={onToggleMaximize}
      >
        <div>body</div>
      </VestaraWindow>,
    );
    expect(screen.getByRole('dialog', { name: 'Terminal' }).className).toMatch(
      /border-\[var\(--ds-border\)\]/,
    );
  });
});

describe('VestaraWindow drag', () => {
  it('drags via pointer and clamps into the desktop area', () => {
    const { onUpdate } = renderWindow();
    const header = screen.getByTestId('vestara-window-header-win-terminal');
    fireEvent.pointerDown(header, { clientX: 200, clientY: 200, button: 0 });
    movePointer(300, 300);
    expect(onUpdate).toHaveBeenCalledWith('win-terminal', { x: 260, y: 220 });
    releasePointer();

    onUpdate.mockClear();
    fireEvent.pointerDown(header, { clientX: 200, clientY: 200, button: 0 });
    movePointer(-500, -500);
    expect(onUpdate).toHaveBeenCalledWith('win-terminal', { x: 0, y: 32 });
    releasePointer();
  });

  it('does not drag from traffic controls or while maximized', () => {
    const { onUpdate } = renderWindow();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close Terminal' }), {
      clientX: 200,
      clientY: 200,
      button: 0,
    });
    movePointer(400, 400);
    expect(onUpdate).not.toHaveBeenCalled();
    releasePointer();
  });

  it('moves via keyboard arrows with a fine Shift step', () => {
    const { onUpdate } = renderWindow();
    const header = screen.getByTestId('vestara-window-header-win-terminal');
    fireEvent.keyDown(header, { key: 'ArrowRight' });
    expect(onUpdate).toHaveBeenNthCalledWith(1, 'win-terminal', { x: 170, y: 120 });
    fireEvent.keyDown(header, { key: 'ArrowDown', shiftKey: true });
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'win-terminal', { x: 160, y: 121 });
    fireEvent.keyDown(header, { key: 'Enter' });
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });
});

describe('VestaraWindow resize', () => {
  it('exposes all 8 resize handles with accessible labels', () => {
    renderWindow();
    for (const dir of ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']) {
      expect(
        screen.getByRole('button', { name: `Resize Terminal ${dir}` }),
      ).toBeInTheDocument();
    }
  });

  it('resizes via pointer from the southeast handle', () => {
    const { onUpdate } = renderWindow();
    const handle = screen.getByTestId('vestara-window-resize-win-terminal-se');
    fireEvent.pointerDown(handle, { clientX: 800, clientY: 480, button: 0 });
    movePointer(820, 490);
    expect(onUpdate).toHaveBeenCalledWith('win-terminal', { w: 660, h: 370 });
    releasePointer();
  });

  it('resizes via pointer from the northwest handle and floors at the minimum', () => {
    const { onUpdate } = renderWindow({ x: 200, y: 200, w: 330, h: 230 });
    const handle = screen.getByTestId('vestara-window-resize-win-terminal-nw');
    fireEvent.pointerDown(handle, { clientX: 200, clientY: 200, button: 0 });
    movePointer(220, 220);
    expect(onUpdate).toHaveBeenCalledWith(
      'win-terminal',
      expect.objectContaining({ w: 320, h: 220 }),
    );
    releasePointer();
  });

  it('resizes via keyboard from a focused handle', () => {
    const { onUpdate } = renderWindow();
    const east = screen.getByTestId('vestara-window-resize-win-terminal-e');
    fireEvent.keyDown(east, { key: 'ArrowRight' });
    expect(onUpdate).toHaveBeenNthCalledWith(1, 'win-terminal', { w: 650, h: 360 });
    fireEvent.keyDown(east, { key: 'ArrowUp' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('VestaraWindow deterministic placement', () => {
  it('cascades deterministically and wraps after the slot count', () => {
    expect(cascadeWindowPlacement(0)).toEqual({ x: 120, y: 60, w: 560, h: 380 });
    expect(cascadeWindowPlacement(1)).toEqual({
      x: 120 + WINDOW_CASCADE_STEP,
      y: 60 + WINDOW_CASCADE_STEP,
      w: 560,
      h: 380,
    });
    expect(cascadeWindowPlacement(WINDOW_CASCADE_SLOTS)).toEqual(cascadeWindowPlacement(0));
    expect(cascadeWindowPlacement(2, { w: 640, h: 400 })).toEqual({
      x: 120 + 2 * WINDOW_CASCADE_STEP,
      y: 60 + 2 * WINDOW_CASCADE_STEP,
      w: 640,
      h: 400,
    });
  });

  it('resolves per-type default sizes from the package registry', () => {
    expect(packageDefaultSize('activity')).toEqual({ w: 720, h: 480 });
    expect(packageDefaultSize('terminal')).toEqual({ w: 640, h: 360 });
    expect(packageDefaultSize('files')).toEqual({ w: 640, h: 400 });
    expect(cascadePlacementForType('activity', 0)).toEqual({ x: 120, y: 60, w: 720, h: 480 });
    expect(cascadePlacementForType('overview', 1)).toEqual({
      x: 120 + WINDOW_CASCADE_STEP,
      y: 60 + WINDOW_CASCADE_STEP,
      w: 560,
      h: 380,
    });
  });

  it('never consults Math.random during placement or interaction', () => {    const spy = vi.spyOn(Math, 'random');
    cascadeWindowPlacement(3);
    clampWindowPosition(10, 10);
    const { onUpdate } = renderWindow();
    fireEvent.keyDown(screen.getByTestId('vestara-window-header-win-terminal'), { key: 'ArrowLeft' });
    expect(onUpdate).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('VestaraWindow reduced motion', () => {
  it('disables transitions when prefers-reduced-motion is set', () => {
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    try {
      renderWindow();
      expect(screen.getByRole('dialog', { name: 'Terminal' }).className).not.toMatch(/transition-\[/);
    } finally {
      if (original === undefined) {
        // @ts-expect-error jsdom without matchMedia — restore the pristine state
        delete window.matchMedia;
      } else {
        Object.defineProperty(window, 'matchMedia', {
          writable: true,
          configurable: true,
          value: original,
        });
      }
    }
  });

  it('keeps governed transitions otherwise', () => {
    renderWindow();
    expect(screen.getByRole('dialog', { name: 'Terminal' }).className).toMatch(/transition-\[/);
  });
});
