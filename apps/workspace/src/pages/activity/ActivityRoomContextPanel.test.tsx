/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ActivityRoomContextPanel from './ActivityRoomContextPanel';

describe('Activity Room Inventory control', () => {
  it('offers a keyboard-operable Inventory action', () => {
    const onInventory = vi.fn();
    render(
      <ActivityRoomContextPanel
        stream={[]}
        participantCount={0}
        activeAgentCount={0}
        connectionState="live"
        dataAvailable
        snapshotComplete
        onInventory={onInventory}
      />,
    );

    const action = screen.getByRole('button', { name: 'Inventory' });
    expect(action).toBeEnabled();
    fireEvent.keyDown(action, { key: 'Enter' });
    fireEvent.click(action);
    expect(onInventory).toHaveBeenCalledTimes(1);
  });
});
