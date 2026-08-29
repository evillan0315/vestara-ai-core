import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NAV_CATEGORIES } from '../src/layouts/navigation.js';
import { marketplaceClient } from '../src/lib/marketplace.js';
import { openCodeQueryKeys } from '../src/lib/opencode.js';
import { ThemeProvider } from '../src/lib/theme.js';
import Discover from '../src/pages/Marketplace/Discover.js';
import { APP_ROUTES } from '../src/routes.js';
import { gitHelperAsset, searchResult } from './marketplace-fixtures.js';

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  installed: vi.fn(),
  updates: vi.fn(),
  categories: vi.fn(),
  rescan: vi.fn(),
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
      rescan: mocks.rescan,
    },
  };
});

beforeEach(() => {
  mocks.search.mockReset();
  mocks.installed.mockReset();
  mocks.updates.mockReset();
  mocks.categories.mockReset();
  mocks.rescan.mockReset();
  mocks.installed.mockResolvedValue([]);
  mocks.updates.mockResolvedValue([]);
  mocks.categories.mockResolvedValue([]);
});

describe('Registry-staleness recovery (regression)', () => {
  it('distinguishes registry/runtime staleness from a manifest defect and keeps the asset visible', async () => {
    // A known-valid fixture reports the stale runtime-export error at the registry level.
    mocks.search.mockResolvedValue({
      total: 1,
      offset: 0,
      limit: 50,
      items: [{ asset: gitHelperAsset, registryId: 'local', score: 1 }],
      registryErrors: ['registry local: Runtime entrypoint did not export a VestaraExtension: vestara.git-helper'],
    });
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Discover />
        </MemoryRouter>
      </ThemeProvider>,
    );
    // The asset stays visible — staleness is not presented as an authoritative package defect.
    expect(await screen.findByText('Vestara Git Helper')).toBeTruthy();
    // The registry error is surfaced distinctly from a validation failure.
    expect(screen.getByText(/Runtime entrypoint did not export/)).toBeTruthy();
  });

  it('recovers after a registry refresh without a full reload', async () => {
    mocks.search
      .mockResolvedValueOnce({
        total: 1,
        offset: 0,
        limit: 50,
        items: [{ asset: gitHelperAsset, registryId: 'local', score: 1 }],
        registryErrors: ['registry local: Runtime entrypoint did not export a VestaraExtension: vestara.git-helper'],
      })
      .mockResolvedValueOnce(searchResult([gitHelperAsset]));
    render(
      <ThemeProvider>
        <MemoryRouter>
          <Discover />
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByText(/Runtime entrypoint did not export/)).toBeTruthy();
    expect(screen.getByText('Vestara Git Helper')).toBeTruthy();

    // Refresh re-queries and clears the staleness signal without reloading.
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(/Runtime entrypoint did not export/)).toBeNull());
    expect(screen.getByText('Vestara Git Helper')).toBeTruthy();
  });
});

describe('Marketplace route and query-key registration', () => {
  it('registers the marketplace route as a shell route', () => {
    const route = APP_ROUTES.find((r) => r.id === 'marketplace');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/marketplace/*');
    expect(route?.layout).toBe('shell');
  });

  it('adds a Marketplace navigation entry', () => {
    const nav = NAV_CATEGORIES.flatMap((c) => c.items).find((item) => item.to === '/marketplace');
    expect(nav).toBeDefined();
    expect(nav?.title).toBe('Marketplace');
  });

  it('keeps the OpenCode permissions query key stable alongside marketplace', () => {
    expect(openCodeQueryKeys.permissions).toEqual(['opencode', 'permissions']);
  });
});
