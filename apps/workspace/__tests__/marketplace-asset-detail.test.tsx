// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { marketplaceClient } from '../src/lib/marketplace.js';
import { ThemeProvider } from '../src/lib/theme.js';
import AssetDetail from '../src/pages/Marketplace/AssetDetail.js';
import { gitHelperDetails, installedGitHelper, reviewStandardsDetails } from './marketplace-fixtures.js';

const mocks = vi.hoisted(() => ({
  asset: vi.fn(),
  installed: vi.fn(),
  install: vi.fn(),
}));

vi.mock('../src/lib/marketplace.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/marketplace.js')>();
  return {
    ...original,
    marketplaceClient: {
      ...original.marketplaceClient,
      asset: mocks.asset,
      installed: mocks.installed,
      install: mocks.install,
    },
  };
});

function renderDetail(publisher = 'vestara', name = 'vestara.git-helper') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/marketplace/assets/${publisher}/${name}`]}>
        <Routes>
          <Route path="/marketplace/assets/:publisher/:name" element={<AssetDetail />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.asset.mockReset();
  mocks.installed.mockReset();
  mocks.install.mockReset();
  mocks.installed.mockResolvedValue([]);
});

describe('Marketplace AssetDetail — permissions and verification presentation', () => {
  it('renders both governed permissions with capability and scope', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    renderDetail();
    expect(await screen.findByText('Vestara Git Helper')).toBeTruthy();
    expect(screen.getByText('Permissions')).toBeTruthy();
    expect(screen.getByText(/process:execute/)).toBeTruthy();
    expect(screen.getByText(/filesystem:write/)).toBeTruthy();
  });

  it('shows install action for a not-installed product', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    renderDetail();
    const installButtons = await screen.findAllByRole('button', { name: 'Install' });
    expect(installButtons.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/installed 0\.4\.1/)).toBeNull();
  });

  it('shows installed badge instead of install button when already installed', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    mocks.installed.mockResolvedValue([installedGitHelper]);
    renderDetail();
    const badges = await screen.findAllByText(/installed 0\.4\.1/);
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByRole('button', { name: 'Install' })).toHaveLength(0);
  });

  it('renders the verification section with checksum result for executable products', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    renderDetail();
    await screen.findByText('Vestara Git Helper');
    expect(screen.getByText('Verification')).toBeTruthy();
    expect(screen.getByText('Checksum:')).toBeTruthy();
    expect(screen.getByText('verified ✓')).toBeTruthy();
  });

  it('renders the permissions section as None requested for the metadata-only standards pack', async () => {
    mocks.asset.mockResolvedValue(reviewStandardsDetails);
    renderDetail('vestara', 'vestara.review-standards');
    expect(await screen.findByText('Vestara Review Standards')).toBeTruthy();
    expect(screen.getByText('None requested.')).toBeTruthy();
    expect(screen.queryByText(/process:execute/)).toBeNull();
  });

  it('opens the install review and resolves a dry-run plan', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    mocks.install.mockResolvedValue({
      status: 'planning',
      plan: {
        installOrder: [{ packageName: 'vestara.git-helper', version: '0.4.1', source: 'catalog' }],
        satisfiedByInstalled: [],
        permissions: [
          { capability: 'process:execute', scope: 'workspace' },
          { capability: 'filesystem:write', scope: 'repository' },
        ],
        warnings: [],
      },
      installed: undefined,
      asset: { packageName: 'vestara.git-helper' },
    });
    renderDetail();
    const installButtons = await screen.findAllByRole('button', { name: 'Install' });
    await userEvent.click(installButtons[0]);
    expect(await screen.findByText('Review installation')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Review installation' }));
    expect(await screen.findByText('Requested permissions')).toBeTruthy();
    await waitFor(() => expect(mocks.install).toHaveBeenCalledWith(expect.objectContaining({ dryRun: true })));
  });

  it('renders verified footer with checksum indicator and version', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    renderDetail();
    await screen.findByText('Vestara Git Helper');
    const footer = screen.getByTestId('asset-detail-footer');
    expect(footer).toBeTruthy();
    expect(footer.textContent).toContain('✓');
    expect(footer.textContent).toContain('0.4.1');
  });

  it('renders integrity verified badge in footer when details report it', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    renderDetail();
    await screen.findByText('Vestara Git Helper');
    const footer = screen.getByTestId('asset-detail-footer');
    expect(footer.textContent).toContain('integrity verified');
  });

  it('shows install button in footer when not installed', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    renderDetail();
    await screen.findByText('Vestara Git Helper');
    const footer = screen.getByTestId('asset-detail-footer');
    const installButtons = footer.querySelectorAll('button');
    const installButton = Array.from(installButtons).find((btn) => btn.textContent?.includes('Install'));
    expect(installButton).toBeTruthy();
  });

  it('shows installed badge in footer when already installed', async () => {
    mocks.asset.mockResolvedValue(gitHelperDetails);
    mocks.installed.mockResolvedValue([installedGitHelper]);
    renderDetail();
    await screen.findByText('Vestara Git Helper');
    const footer = screen.getByTestId('asset-detail-footer');
    expect(footer.textContent).toContain('installed 0.4.1');
  });
});
