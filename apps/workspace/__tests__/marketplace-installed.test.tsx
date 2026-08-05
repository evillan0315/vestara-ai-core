import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { marketplaceClient } from '../src/lib/marketplace.js';
import { ThemeProvider } from '../src/lib/theme.js';
import Installed from '../src/pages/Marketplace/Installed.js';
import { installedGitHelper, operationDto } from './marketplace-fixtures.js';

const mocks = vi.hoisted(() => ({
  installed: vi.fn(),
  verify: vi.fn(),
  uninstall: vi.fn(),
  rescan: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/lib/marketplace.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/marketplace.js')>();
  return {
    ...original,
    marketplaceClient: {
      ...original.marketplaceClient,
      installed: mocks.installed,
      verify: mocks.verify,
      uninstall: mocks.uninstall,
      rescan: mocks.rescan,
      update: mocks.update,
    },
  };
});

function renderInstalled() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Installed />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.installed.mockReset();
  mocks.verify.mockReset();
  mocks.uninstall.mockReset();
  mocks.rescan.mockReset();
  mocks.update.mockReset();
  mocks.installed.mockResolvedValue([installedGitHelper]);
  mocks.verify.mockResolvedValue(operationDto({ type: 'verify', status: 'completed' }));
  mocks.uninstall.mockResolvedValue(operationDto({ type: 'uninstall', status: 'completed' }));
  mocks.rescan.mockResolvedValue(operationDto({ type: 'rescan', status: 'completed' }));
});

describe('Marketplace Installed — verification and uninstall loop', () => {
  it('renders installed package with active/current state and no updates', async () => {
    renderInstalled();
    expect(await screen.findByText('vestara.git-helper')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('current')).toBeTruthy();
    expect(screen.getByText('0.4.1')).toBeTruthy();
  });

  it('runs verification and reports completion', async () => {
    renderInstalled();
    await screen.findByText('vestara.git-helper');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(mocks.verify).toHaveBeenCalledWith('vestara.git-helper'));
    expect(await screen.findByText(/verify completed for vestara\.git-helper/)).toBeTruthy();
  });

  it('uninstalls and removes the product from the installed list', async () => {
    mocks.installed.mockResolvedValueOnce([installedGitHelper]).mockResolvedValueOnce([]);
    renderInstalled();
    await screen.findByText('vestara.git-helper');
    await userEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
    await waitFor(() => expect(mocks.uninstall).toHaveBeenCalledWith('vestara.git-helper'));
    expect(await screen.findByText('Nothing installed yet. Install from Discover.')).toBeTruthy();
  });

  it('surfaces a failed uninstall without removing the row', async () => {
    mocks.uninstall.mockResolvedValue(
      operationDto({
        type: 'uninstall',
        status: 'failed',
        error: { code: 'marketplace.uninstall-failed', message: 'uninstall failed' },
      }),
    );
    renderInstalled();
    await screen.findByText('vestara.git-helper');
    await userEvent.click(screen.getByRole('button', { name: 'Uninstall' }));
    expect(await screen.findByText(/Operation failed: uninstall failed/)).toBeTruthy();
    expect(screen.getByText('vestara.git-helper')).toBeTruthy();
  });

  it('offers rescan for registry recovery', async () => {
    renderInstalled();
    await screen.findByText('vestara.git-helper');
    await userEvent.click(screen.getByRole('button', { name: 'Rescan registries' }));
    await waitFor(() => expect(mocks.rescan).toHaveBeenCalled());
    expect(screen.getByText('vestara.git-helper')).toBeTruthy();
  });
});
