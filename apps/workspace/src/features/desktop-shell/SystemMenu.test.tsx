/**
 * VES-UI-001 T2: SystemMenu acceptance guards.
 *
 * - All five actions (lockscreen / switch / settings / logout / shutdown) fire `onAction`.
 * - Outside-click and Escape invoke `onClose`.
 * - Focus moves into the menu on mount and returns to the trigger on unmount.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemMenu, type SystemMenuActionId } from './SystemMenu.js';

afterEach(() => {
  cleanup();
});

function renderMenu(props?: Partial<React.ComponentProps<typeof SystemMenu>>) {
  const onAction = vi.fn();
  const onClose = vi.fn();
  const view = render(<SystemMenu onAction={onAction} onClose={onClose} {...props} />);
  return { ...view, onAction, onClose };
}

describe('SystemMenu', () => {
  it('renders the user card and all five actions', () => {
    renderMenu();
    expect(screen.getByText('Workspace Operator')).toBeInTheDocument();
    for (const label of ['Lockscreen', 'Switch User', 'Settings', 'Logout', 'Shutdown']) {
      expect(screen.getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
  });

  it('fires onAction for every action id', () => {
    const { onAction } = renderMenu();
    const expected: Array<[string, SystemMenuActionId]> = [
      ['Lockscreen', 'lockscreen'],
      ['Switch User', 'switch'],
      ['Settings', 'settings'],
      ['Logout', 'logout'],
      ['Shutdown', 'shutdown'],
    ];
    for (const [label, id] of expected) {
      fireEvent.click(screen.getByRole('menuitem', { name: label }));
    }
    expect(onAction.mock.calls.map((call) => call[0])).toEqual(expected.map(([, id]) => id));
  });

  it('closes on outside-click', () => {
    const { onClose } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Close system menu' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const { onClose } = renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the menu and returns it to the trigger on unmount', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'avatar';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const view = renderMenu();
    expect(screen.getByRole('menuitem', { name: 'Lockscreen' })).toHaveFocus();

    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('renders a custom operator identity', () => {
    renderMenu({ user: { id: 'op-2', displayName: 'Ada Lovelace', initials: 'AL' } });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
  });
});
