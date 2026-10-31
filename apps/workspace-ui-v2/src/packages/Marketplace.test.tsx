/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPackageLaunchable } from '../lib/package-state';
import { MarketplacePkg } from './Marketplace';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

const liveSearch = (items: unknown[]) => ok({ results: { items: items.map((asset) => ({ asset })) } });

const liveAsset = {
  id: 'teal-terminal',
  publisherId: 'vestara',
  displayName: 'Teal Terminal',
  summary: 'GPU-styled local shell',
  type: 'terminal',
  latestVersion: '2.0.0',
};

describe('MarketplacePkg', () => {
  it('renders live assets with installed markers and a LIVE pill', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) return liveSearch([liveAsset]);
      return ok({ installed: [{ assetId: 'teal-terminal' }] });
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect(await screen.findByText('Teal Terminal')).toBeTruthy();
    expect(await screen.findByText('INSTALLED')).toBeTruthy();
  });

  it('searches the live catalog from the search box', async () => {
    const seen: string[] = [];
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        seen.push(url);
        return liveSearch([liveAsset]);
      }
      return ok({ installed: [] });
    });
    render(<MarketplacePkg />);
    const box = await screen.findByLabelText('Search marketplace');
    expect(await screen.findByText('LIVE')).toBeTruthy();
    await act(async () => {
      fireEvent.change(box, { target: { value: 'term' } });
    });
    expect(await screen.findByText('Teal Terminal')).toBeTruthy();
    expect(seen.some((u) => u.includes('q=term'))).toBe(true);
  });

  it('falls back to fixture assets with a SNAPSHOT pill when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(await screen.findByText('Agent Workforce')).toBeTruthy();
  });

  it('lists Voice Streaming as an installed package with lifecycle actions', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('Voice Streaming')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable Voice Streaming' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Uninstall Voice Streaming' })).toBeTruthy();
  });

  it('installs an uninstalled asset from its card', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('File Explorer')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Install' })).toHaveLength(3);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Install' })[0]);
    });
    expect(screen.getAllByRole('button', { name: 'Install' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Disable File Explorer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Uninstall File Explorer' })).toBeTruthy();
  });

  it('disables and re-enables an installed asset from its card', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('Voice Streaming')).toBeTruthy();
    expect(screen.queryByText('DISABLED')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disable Voice Streaming' }));
    });
    expect(screen.getByText('DISABLED')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enable Voice Streaming' }));
    });
    expect(screen.queryByText('DISABLED')).toBeNull();
  });

  it('uninstalls an installed asset from its card', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('Voice Streaming')).toBeTruthy();
    const before = screen.getAllByRole('button', { name: 'Install' }).length;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Uninstall Voice Streaming' }));
    });
    expect(screen.getAllByRole('button', { name: 'Install' })).toHaveLength(before + 1);
    expect(screen.queryByRole('button', { name: 'Disable Voice Streaming' })).toBeNull();
  });

  it('shows a working state during a live install, then marks the asset installed', async () => {
    let release: (value: Response) => void = () => {};
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        return ok({
          results: {
            items: [
              {
                asset: {
                  slug: 'voice-streaming',
                  displayName: 'Voice Streaming',
                  summary: 'STT • TTS • Duplex • 99 langs',
                  type: 'package',
                  latestVersion: '2.0.0',
                  publisherId: 'vestara',
                },
              },
            ],
          },
        });
      }
      if (url === '/api/marketplace/installed') return ok({ installed: [] });
      if (url === '/api/marketplace/install') {
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      throw new Error(`unexpected ${url}`);
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    // Optimistic flip + busy: the card already shows installed controls,
    // with the toggle pending (accessible name stays, visible label flips).
    expect(await screen.findByText('INSTALLED')).toBeTruthy();
    const working = screen.getByRole('button', { name: 'Disable Voice Streaming' });
    expect((working as HTMLButtonElement).disabled).toBe(true);
    expect(working.textContent).toBe('Working…');
    await act(async () => {
      release(ok({ operation: { status: 'completed', installed: { packageName: 'voice-streaming', enabled: true } } }));
    });
    expect(screen.getByRole('button', { name: 'Disable Voice Streaming' })).toBeTruthy();
    expect(isPackageLaunchable('voice')).toBe(true);
  });

  it('rolls back an optimistic live install with an inline error when the API fails', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        return ok({
          results: {
            items: [
              {
                asset: {
                  slug: 'voice-streaming',
                  displayName: 'Voice Streaming',
                  summary: 'STT • TTS • Duplex • 99 langs',
                  type: 'package',
                  latestVersion: '2.0.0',
                  publisherId: 'vestara',
                },
              },
            ],
          },
        });
      }
      if (url === '/api/marketplace/installed') return ok({ installed: [] });
      if (url === '/api/marketplace/install') {
        return ok({ operation: { status: 'failed', error: { message: 'registry offline' } } });
      }
      throw new Error(`unexpected ${url}`);
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect(isPackageLaunchable('voice')).toBe(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    });
    // Rolled back: installable again, with the server error inline.
    expect(screen.getByText('registry offline')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Install' })).toBeTruthy();
    expect(screen.queryByText('INSTALLED')).toBeNull();
    expect(isPackageLaunchable('voice')).toBe(false);
  });

  it('rolls back an optimistic live disable when the API fails', async () => {
    stubFetch(async (url) => {
      if (url.startsWith('/api/marketplace/search')) {
        return ok({
          results: {
            items: [
              {
                asset: {
                  slug: 'voice-streaming',
                  displayName: 'Voice Streaming',
                  summary: 'STT • TTS • Duplex • 99 langs',
                  type: 'package',
                  latestVersion: '2.0.0',
                  publisherId: 'vestara',
                },
              },
            ],
          },
        });
      }
      if (url === '/api/marketplace/installed') {
        return ok({ installed: [{ assetId: 'voice-streaming', packageName: 'voice-streaming', enabled: true }] });
      }
      if (url.startsWith('/api/marketplace/installed/')) {
        return { ok: false, status: 409, json: async () => ({ error: 'voice in active call' }) } as Response;
      }
      throw new Error(`unexpected ${url}`);
    });
    render(<MarketplacePkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect(isPackageLaunchable('voice')).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disable Voice Streaming' }));
    });
    // Rolled back: still enabled, with the server error inline.
    expect(screen.getByText('voice in active call')).toBeTruthy();
    expect(screen.queryByText('DISABLED')).toBeNull();
    expect(screen.getByRole('button', { name: 'Disable Voice Streaming' })).toBeTruthy();
    expect(isPackageLaunchable('voice')).toBe(true);
  });
});
