import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { marketplaceClient } from '../src/lib/marketplace.js';
import { ThemeProvider } from '../src/lib/theme.js';
import InstallReview from '../src/pages/Marketplace/InstallReview.js';
import { gitHelperDetails, operationDto, reviewStandardsDetails } from './marketplace-fixtures.js';

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
}));

vi.mock('../src/lib/marketplace.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/marketplace.js')>();
  return {
    ...original,
    marketplaceClient: { ...original.marketplaceClient, install: mocks.install },
  };
});

beforeEach(() => {
  mocks.install.mockReset();
});

describe('Marketplace InstallReview — install planning and permission gate', () => {
  it('shows the dry-run plan with both governed permissions before mutation', async () => {
    mocks.install.mockResolvedValue(
      operationDto({ status: 'planning', installed: undefined, asset: { packageName: 'vestara.git-helper' } }),
    );
    render(
      <ThemeProvider>
        <InstallReview details={gitHelperDetails} onDone={() => {}} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review installation' }));

    expect(await screen.findByText('Packages to install (1)')).toBeTruthy();
    expect(screen.getByText('vestara.git-helper')).toBeTruthy();
    expect(screen.getByText('Requested permissions')).toBeTruthy();
    expect(screen.getByText(/process:execute/)).toBeTruthy();
    expect(screen.getByText(/filesystem:write/)).toBeTruthy();
    // The primary action must not imply installation is already approved.
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(screen.queryByText('Installed ✓')).toBeNull();
  });

  it('exposes the awaiting-permission state when the gate is not bypassed', async () => {
    mocks.install
      .mockResolvedValueOnce(
        operationDto({
          status: 'awaiting-permission',
          installed: undefined,
          asset: { packageName: 'vestara.git-helper' },
        }),
      )
      .mockResolvedValueOnce(
        operationDto({
          status: 'awaiting-permission',
          installed: undefined,
          asset: { packageName: 'vestara.git-helper' },
        }),
      );
    const onDone = vi.fn();
    render(
      <ThemeProvider>
        <InstallReview details={gitHelperDetails} onDone={onDone} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review installation' }));
    expect(await screen.findByRole('button', { name: 'Approve and install' })).toBeTruthy();
    // Permission details remain visible at the gate.
    expect(screen.getByText(/process:execute/)).toBeTruthy();

    // Retry without approval does not bypass the gate.
    await userEvent.click(screen.getByRole('button', { name: 'Approve and install' }));
    // mock returns awaiting-permission again (simulating an unapproved attempt after a fresh resolve)
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText('Installed ✓')).toBeNull();
  });

  it('completes install and activates after approval', async () => {
    mocks.install
      .mockResolvedValueOnce(operationDto({ status: 'planning', installed: undefined }))
      .mockResolvedValueOnce(
        operationDto({
          status: 'completed',
          installed: { packageName: 'vestara.git-helper', installedVersion: '0.4.1' },
        }),
      );
    const onDone = vi.fn();
    render(
      <ThemeProvider>
        <InstallReview details={gitHelperDetails} onDone={onDone} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review installation' }));
    await screen.findByText('Requested permissions');
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(await screen.findByText('Installed ✓')).toBeTruthy();
  });

  it('renders a metadata-only standards pack without a permission gate', async () => {
    mocks.install.mockResolvedValue(
      operationDto({ status: 'planning', installed: undefined, plan: { ...operationDto().plan!, permissions: [] } }),
    );
    render(
      <ThemeProvider>
        <InstallReview details={reviewStandardsDetails} onDone={() => {}} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review installation' }));
    expect(await screen.findByText('No permissions requested.')).toBeTruthy();
  });

  it('shows a failed install without marking the product installed', async () => {
    mocks.install
      .mockResolvedValueOnce(operationDto({ status: 'planning', installed: undefined }))
      .mockResolvedValueOnce(
        operationDto({
          status: 'failed',
          installed: undefined,
          error: { code: 'marketplace.install-failed', message: 'install failed' },
        }),
      );
    const onDone = vi.fn();
    render(
      <ThemeProvider>
        <InstallReview details={gitHelperDetails} onDone={onDone} />
      </ThemeProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Review installation' }));
    await screen.findByText('Requested permissions');
    await userEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(await screen.findByText('install failed')).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.queryByText('Installed ✓')).toBeNull();
  });
});
