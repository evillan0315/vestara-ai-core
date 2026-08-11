import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import Publish from '../src/pages/Marketplace/Publish.js';

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
}));

vi.mock('../src/lib/marketplace.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/marketplace.js')>();
  return {
    ...original,
    marketplaceClient: {
      ...original.marketplaceClient,
      publish: mocks.publish,
    },
  };
});

function renderPublish() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Publish />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.publish.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('Marketplace Publish', () => {
  it('disables publish until a source path is provided', () => {
    renderPublish();
    expect(screen.getByText('Add a product')).toBeTruthy();
    const button = screen.getByRole('button', { name: /Publish to marketplace/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/path\/to\/package/), { target: { value: '/tmp/product' } });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('publishes with the entered path and renders the result', async () => {
    mocks.publish.mockResolvedValue({
      status: 'completed',
      type: 'publish',
      id: 'marketplace-publish-1',
      asset: { publisherId: 'acme', packageName: 'demo' },
      published: {
        packageName: 'demo',
        publisherId: 'acme',
        version: '1.0.0',
        packagePath: '/tmp/product',
        targetPath: '/root/acme/demo/1.0.0',
        digest: 'a'.repeat(64),
        signed: true,
        signatureValid: true,
        publishedAt: '2026-08-05T00:00:00.000Z',
      },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    });
    renderPublish();
    fireEvent.change(screen.getByPlaceholderText(/path\/to\/package/), { target: { value: '/tmp/product' } });
    fireEvent.click(screen.getByRole('button', { name: /Publish to marketplace/ }));

    expect(await screen.findByText('acme/demo@1.0.0')).toBeTruthy();
    expect(screen.getByText('signed ✓')).toBeTruthy();
    expect(screen.getByText('/root/acme/demo/1.0.0')).toBeTruthy();
    await waitFor(() => {
      expect(mocks.publish).toHaveBeenCalledWith({ sourcePath: '/tmp/product', key: undefined });
    });
  });

  it('surfaces a failed publish operation', async () => {
    mocks.publish.mockResolvedValue({
      status: 'failed',
      type: 'publish',
      id: 'marketplace-publish-2',
      asset: { packageName: '/tmp/product' },
      error: { code: 'marketplace.invalid-package', message: 'Cannot publish: no manifest' },
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
    });
    renderPublish();
    fireEvent.change(screen.getByPlaceholderText(/path\/to\/package/), { target: { value: '/tmp/product' } });
    fireEvent.click(screen.getByRole('button', { name: /Publish to marketplace/ }));
    expect(await screen.findByText(/Publish failed: Cannot publish: no manifest/)).toBeTruthy();
  });
});
