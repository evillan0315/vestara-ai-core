/** @vitest-environment jsdom */

/**
 * AR-REPORT — report icon trigger in the Activity Room header.
 */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GlobalDrawerProvider } from '../../contexts/GlobalDrawerContext';
import ActivityRoomHeader from './ActivityRoomHeader';

function headerProps(): React.ComponentProps<typeof ActivityRoomHeader> {
  return {
    roomName: 'Activity Room',
    state: 'live',
    paused: false,
    recordCount: 3,
    dataAvailable: true,
    snapshotComplete: true,
    onPause: vi.fn(),
    onClear: vi.fn(),
  };
}

function renderHeader(props: Partial<React.ComponentProps<typeof ActivityRoomHeader>> = {}) {
  return render(
    <GlobalDrawerProvider>
      <ActivityRoomHeader {...headerProps()} {...props} />
    </GlobalDrawerProvider>,
  );
}

describe('ActivityRoomHeader report trigger', () => {
  it('opens the report when the report menu item is clicked', () => {
    const onOpenReport = vi.fn();
    renderHeader({ onOpenReport });
    fireEvent.click(screen.getByRole('button', { name: 'Activity actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Report' }));
    expect(onOpenReport).toHaveBeenCalledTimes(1);
  });

  it('renders no report item without a handler', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Activity actions' }));
    expect(screen.queryByRole('menuitem', { name: 'Report' })).toBeNull();
  });
});
