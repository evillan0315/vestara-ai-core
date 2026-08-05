import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import { type WorkspaceEvent, workspaceSocket } from '../src/lib/ws.js';
import OperationCenter from '../src/pages/Marketplace/OperationCenter.js';

const mocks = vi.hoisted(() => ({
  onEvent: vi.fn(),
}));

vi.mock('../src/lib/ws.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/ws.js')>();
  return {
    ...original,
    workspaceSocket: { ...original.workspaceSocket, onEvent: mocks.onEvent },
  };
});

function marketplaceEvent(type: string, packageName: string, correlationId: string): WorkspaceEvent {
  return {
    id: `evt-${correlationId}`,
    type,
    actor: 'marketplace',
    message: type,
    timestamp: '2026-08-05T00:00:00.000Z',
    metadata: { packageName, correlationId },
  } as WorkspaceEvent;
}

/** Capture the registered onEvent listener so tests can emit lifecycle events. */
function registeredListener(): (event: WorkspaceEvent) => void {
  return mocks.onEvent.mock.calls[0][0];
}

beforeEach(() => {
  mocks.onEvent.mockReset();
  mocks.onEvent.mockReturnValue(() => {});
});

describe('Marketplace OperationCenter — event-driven state derivation', () => {
  it('shows awaiting-permission then completed for a gated install', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <OperationCenter />
        </MemoryRouter>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mocks.onEvent).toHaveBeenCalled());
    const emit = registeredListener();

    await act(async () => {
      emit(marketplaceEvent('marketplace.permission-requested', 'vestara.git-helper', 'cor-1'));
    });
    await userEvent.click(screen.getByRole('button', { name: /Marketplace/ }));
    expect(await screen.findByText('awaiting-permission')).toBeTruthy();
    expect(screen.getByText('vestara.git-helper')).toBeTruthy();

    await act(async () => {
      emit(marketplaceEvent('marketplace.package-installed', 'vestara.git-helper', 'cor-1'));
      emit(marketplaceEvent('marketplace.package-activated', 'vestara.git-helper', 'cor-1'));
    });
    expect(await screen.findByText('activating')).toBeTruthy();

    await act(async () => {
      emit(marketplaceEvent('marketplace.rollback-completed', 'vestara.git-helper', 'cor-1'));
    });
    expect(await screen.findByText('completed')).toBeTruthy();
  });

  it('deduplicates operations by package+correlation key', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <OperationCenter />
        </MemoryRouter>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mocks.onEvent).toHaveBeenCalled());
    const emit = registeredListener();

    await act(async () => {
      emit(marketplaceEvent('marketplace.install-requested', 'vestara.git-helper', 'cor-1'));
      emit(marketplaceEvent('marketplace.install-requested', 'vestara.git-helper', 'cor-1'));
      emit(marketplaceEvent('marketplace.install-requested', 'vestara.analysis', 'cor-2'));
    });
    await userEvent.click(screen.getByRole('button', { name: /Marketplace/ }));
    expect(screen.getByText('vestara.git-helper')).toBeTruthy();
    expect(screen.getByText('vestara.analysis')).toBeTruthy();
    const gitRows = screen.getAllByText('vestara.git-helper');
    expect(gitRows.length).toBeGreaterThanOrEqual(1);
  });

  it('ignores non-marketplace events', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter>
          <OperationCenter />
        </MemoryRouter>
      </ThemeProvider>,
    );
    await waitFor(() => expect(mocks.onEvent).toHaveBeenCalled());
    const emit = registeredListener();

    await act(async () => {
      emit({ id: 'x', type: 'system.heartbeat', actor: 'system', timestamp: '2026-08-05T00:00:00.000Z' });
    });
    await userEvent.click(screen.getByRole('button', { name: /Marketplace/ }));
    expect(await screen.findByText('No recent operations.')).toBeTruthy();
  });
});
