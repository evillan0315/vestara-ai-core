/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WinData } from '../lib/types';
import { DesktopIcons } from './DesktopIcons';
import { Dock } from './Dock';
import { SystemMenu } from './SystemMenu';
import { VestaraWindow } from './VestaraWindow';

const SAMPLE_WINDOW: WinData = {
  id: 'win-overview',
  title: 'Overview',
  subtitle: 'Good afternoon Director',
  x: 120,
  y: 60,
  w: 560,
  h: 380,
  z: 1,
  minimized: false,
  maximized: false,
  type: 'overview',
};

afterEach(() => {
  cleanup();
});

const noop = () => {};

describe('desktop chrome', () => {
  it('opens an icon via double-click and Enter', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DesktopIcons onOpen={onOpen} />);
    const btn = screen.getByLabelText('Open Terminal');
    await user.dblClick(btn);
    expect(onOpen).toHaveBeenCalledWith('terminal');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith('terminal');
  });

  it('closes the system menu on Escape', () => {
    const onClose = vi.fn();
    render(<SystemMenu onAction={noop} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('nudges a window with arrow keys', () => {
    const onUpdate = vi.fn();
    render(
      <VestaraWindow data={SAMPLE_WINDOW} isFocused onFocus={noop} onClose={noop} onMinimize={noop} onUpdate={onUpdate}>
        body
      </VestaraWindow>,
    );
    fireEvent.keyDown(screen.getByTitle('Move Overview with arrow keys'), { key: 'ArrowRight' });
    expect(onUpdate).toHaveBeenCalledWith('win-overview', expect.objectContaining({ x: 130 }));
  });

  it('clamps upward arrow-key moves at the layer top (flush with top bar)', () => {
    const onUpdate = vi.fn();
    render(
      <VestaraWindow
        data={{ ...SAMPLE_WINDOW, y: 5 }}
        isFocused
        onFocus={noop}
        onClose={noop}
        onMinimize={noop}
        onUpdate={onUpdate}
      >
        body
      </VestaraWindow>,
    );
    fireEvent.keyDown(screen.getByTitle('Move Overview with arrow keys'), { key: 'ArrowUp' });
    expect(onUpdate).toHaveBeenCalledWith('win-overview', expect.objectContaining({ y: 0 }));
  });

  it('drags a window flush to the top bar instead of stopping 32px short', () => {
    const onUpdate = vi.fn();
    render(
      <VestaraWindow data={SAMPLE_WINDOW} isFocused onFocus={noop} onClose={noop} onMinimize={noop} onUpdate={onUpdate}>
        body
      </VestaraWindow>,
    );
    const header = screen.getByTitle('Move Overview with arrow keys');
    fireEvent.mouseDown(header, { clientX: 200, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 200, clientY: 10 });
    expect(onUpdate).toHaveBeenCalledWith('win-overview', expect.objectContaining({ y: 0 }));
  });

  it('maximizes a window flush with the top bar keeping dock clearance', () => {
    render(
      <VestaraWindow
        data={{ ...SAMPLE_WINDOW, maximized: true }}
        isFocused
        onFocus={noop}
        onClose={noop}
        onMinimize={noop}
        onUpdate={noop}
      >
        body
      </VestaraWindow>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Overview' });
    expect(dialog.style.top).toBe('0px');
    expect(dialog.style.height).toBe('calc(100% - 48px)');
  });

  it('exposes labelled dock actions', () => {
    render(<Dock windows={[]} onOpen={noop} onRestore={noop} />);
    expect(screen.getByLabelText('Open terminal window')).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: 'Application dock' })).toBeTruthy();
  });
});
