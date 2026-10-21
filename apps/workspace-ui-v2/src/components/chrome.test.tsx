/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOWS } from '../lib/desktop.fixtures';
import { DesktopIcons } from './DesktopIcons';
import { Dock } from './Dock';
import { SystemMenu } from './SystemMenu';
import { VestaraWindow } from './VestaraWindow';

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
      <VestaraWindow
        data={DEFAULT_WINDOWS[0]}
        isFocused
        onFocus={noop}
        onClose={noop}
        onMinimize={noop}
        onUpdate={onUpdate}
      >
        body
      </VestaraWindow>,
    );
    fireEvent.keyDown(screen.getByTitle('Move Overview with arrow keys'), { key: 'ArrowRight' });
    expect(onUpdate).toHaveBeenCalledWith('win-overview', expect.objectContaining({ x: 130 }));
  });

  it('exposes labelled dock actions', () => {
    render(<Dock windows={[]} onOpen={noop} onRestore={noop} />);
    expect(screen.getByLabelText('Open terminal window')).toBeTruthy();
    expect(screen.getByRole('toolbar', { name: 'Application dock' })).toBeTruthy();
  });
});
