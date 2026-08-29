import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { marketplaceClient } from '../src/lib/marketplace.js';
import { ThemeProvider } from '../src/lib/theme.js';
import Discover from '../src/pages/Marketplace/Discover.js';
import {
  analysisAsset,
  gitHelperAsset,
  installedGitHelper,
  reviewStandardsAsset,
  searchResult,
} from './marketplace-fixtures.js';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  installed: vi.fn(),
  updates: vi.fn(),
  categories: vi.fn(),
}));

vi.mock('../src/lib/marketplace.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/marketplace.js')>();
  return {
    ...original,
    marketplaceClient: {
      ...original.marketplaceClient,
      search: mocks.search,
      installed: mocks.installed,
      updates: mocks.updates,
      categories: mocks.categories,
    },
  };
});

function renderDiscover() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Discover />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.search.mockReset();
  mocks.installed.mockReset();
  mocks.updates.mockReset();
  mocks.categories.mockReset();
  mocks.search.mockResolvedValue(searchResult([gitHelperAsset, analysisAsset, reviewStandardsAsset]));
  mocks.installed.mockResolvedValue([installedGitHelper]);
  mocks.updates.mockResolvedValue([]);
  mocks.categories.mockResolvedValue([
    { name: 'module', assetCount: 1 },
    { name: 'plugin', assetCount: 1 },
    { name: 'standards-pack', assetCount: 1 },
  ]);
});

describe('Marketplace Discover', () => {
  it('renders the seeded products with name, version, type, and install status', async () => {
    renderDiscover();
    expect(await screen.findByText('Vestara Git Helper')).toBeTruthy();
    expect(await screen.findByText('Vestara Analysis Pack')).toBeTruthy();
    expect(await screen.findByText('Vestara Review Standards')).toBeTruthy();
    expect(screen.getAllByText('0.4.1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('plugin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('module').length).toBeGreaterThan(0);
    expect(screen.getAllByText('standards-pack').length).toBeGreaterThan(0);
    // git-helper is installed (active/current); the others are not installed.
    expect(await screen.findByText(/installed 0\.4\.1/)).toBeTruthy();
    expect(screen.getAllByText('not installed').length).toBeGreaterThanOrEqual(2);
  });

  it('searches and locates vestara.git-helper', async () => {
    mocks.search.mockResolvedValue(searchResult([gitHelperAsset]));
    renderDiscover();
    await screen.findByText('Vestara Git Helper');
    await userEvent.type(screen.getByPlaceholderText(/Search assets/), 'git-helper');
    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    expect(await screen.findByText('Vestara Git Helper')).toBeTruthy();
    expect(screen.queryByText('Vestara Analysis Pack')).toBeNull();
  });

  it('filters by category', async () => {
    mocks.search.mockResolvedValueOnce(searchResult([gitHelperAsset, analysisAsset, reviewStandardsAsset]));
    mocks.search.mockResolvedValueOnce(searchResult([analysisAsset]));
    renderDiscover();
    await screen.findByText('Vestara Git Helper');
    await userEvent.selectOptions(screen.getByRole('combobox'), 'module');
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Vestara Analysis Pack')).toBeTruthy();
    expect(screen.queryByText('Vestara Git Helper')).toBeNull();
  });

  it('renders the empty catalog state', async () => {
    mocks.search.mockResolvedValue(searchResult([]));
    renderDiscover();
    expect(await screen.findByText('No assets found.')).toBeTruthy();
  });

  it('surfaces registry errors without hiding the catalog', async () => {
    mocks.search.mockResolvedValue({
      total: 1,
      offset: 0,
      limit: 50,
      items: [{ asset: gitHelperAsset, registryId: 'local', score: 1 }],
      registryErrors: ['registry local: Runtime entrypoint did not export a VestaraExtension'],
    });
    renderDiscover();
    expect(await screen.findByText(/Runtime entrypoint did not export/)).toBeTruthy();
    expect(screen.getByText('Vestara Git Helper')).toBeTruthy();
  });
});
