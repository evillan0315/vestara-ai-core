// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import { FileOperationsProvider } from '../src/contexts/FileOperationsContext.js';
import { filesFixture } from '../src/features/files/files.fixtures.js';
import Files from '../src/pages/Files.js';

vi.mock('../src/features/files/hooks/useFiles', () => ({
  useFiles: () => ({
    data: filesFixture,
    isLoading: false,
    error: null as string | null,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
}));

function stubContentFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ mimeType: 'application/json', content: '{"a": 1}', size: 8 }),
    })),
  );
}

function renderFiles() {
  return render(
    <ThemeProvider>
      <FileOperationsProvider>
        <Files />
      </FileOperationsProvider>
    </ThemeProvider>,
  );
}

function tree() {
  return screen.getByRole('tree', { name: 'Repository tree' });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Files editor tabs (F-E-2)', () => {
  it('opens a tab when a file row is clicked and dedupes on re-click', async () => {
    stubContentFetch();
    renderFiles();
    fireEvent.click(within(tree()).getByTitle('package.json'));

    const tablist = await screen.findByRole('tablist', { name: 'Open files' });
    expect(within(tablist).getByRole('tab', { name: 'package.json' })).toBeDefined();
    // Re-click does not duplicate the tab
    fireEvent.click(within(tree()).getByTitle('package.json'));
    expect(within(tablist).getAllByRole('tab').length).toBe(1);
  });

  it('opens a second tab, switches between tabs, and closes one', async () => {
    stubContentFetch();
    renderFiles();
    fireEvent.click(within(tree()).getByTitle('package.json'));
    const tablist = await screen.findByRole('tablist', { name: 'Open files' });

    fireEvent.click(within(tree()).getByTitle('pnpm-workspace.yaml'));
    await waitFor(() => {
      expect(within(tablist).getAllByRole('tab').length).toBe(2);
    });

    // Switch back to the first tab
    fireEvent.click(within(tablist).getByRole('tab', { name: 'package.json' }));
    expect(within(tablist).getByRole('tab', { name: 'package.json' }).getAttribute('aria-selected')).toBe('true');

    // Close-all is offered with multiple tabs
    expect(screen.getByRole('button', { name: 'Close all tabs' })).toBeDefined();

    // Close the second tab
    fireEvent.click(screen.getByRole('button', { name: 'Close pnpm-workspace.yaml' }));
    await waitFor(() => {
      expect(within(tablist).getAllByRole('tab').length).toBe(1);
    });
  });

  it('shows the status footer with cursor position once content loads', async () => {
    stubContentFetch();
    renderFiles();
    fireEvent.click(within(tree()).getByTitle('package.json'));

    const status = await screen.findByRole('status', { name: 'Editor status' });
    expect(within(status).getByText('Ln 1, Col 1')).toBeDefined();
  });
});

describe('Files search mode (FP-5)', () => {
  it('searches runtime-backed results and opens a tab from a hit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.startsWith('/api/files/search')) {
          return { ok: true, status: 200, json: async () => ({ results: ['package.json'] }) };
        }
        return { ok: true, status: 200, json: async () => ({ mimeType: 'application/json', content: '{}', size: 2 }) };
      }),
    );
    renderFiles();
    fireEvent.click(screen.getByRole('tab', { name: 'Search' }));
    fireEvent.change(screen.getByLabelText(/Search file contents/), { target: { value: 'pkg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const results = await screen.findByRole('list', { name: 'Search results' });
    fireEvent.click(within(results).getByTitle('package.json'));
    expect(await screen.findByRole('tablist', { name: 'Open files' })).toBeDefined();
  });
});

describe('Files context menu (F-E-4)', () => {
  it('opens a menu with governed actions on right-click', () => {
    stubContentFetch();
    renderFiles();
    fireEvent.contextMenu(within(tree()).getByTitle('package.json'));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Open' })).toBeDefined();
    expect(within(menu).getByRole('menuitem', { name: 'Duplicate' })).toBeDefined();
    expect(within(menu).getByRole('menuitem', { name: 'Rename…' })).toBeDefined();
    expect(within(menu).getByRole('menuitem', { name: 'Delete…' })).toBeDefined();

    // Escape dismisses
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
