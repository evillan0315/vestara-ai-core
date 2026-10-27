/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderModelPicker } from './ProviderModelPicker';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => handler(String(url), init)),
  );
}

const liveProviders = {
  providers: [
    {
      id: 'opencode',
      name: 'OpenCode',
      enabled: true,
      status: 'available',
      models: [{ id: 'glm-4', name: 'GLM 4', enabled: true }],
    },
  ],
};

const liveSelection = {
  revision: 3,
  updatedByClientId: 'workspace-ui',
  selection: { profileId: 'balanced', roles: { developer: { providerId: 'opencode', modelId: 'glm-4' } } },
};

describe('ProviderModelPicker', () => {
  it('renders live providers and the role routing', async () => {
    stubFetch(async (url) => {
      if (url === '/api/providers') return ok(liveProviders);
      return ok(liveSelection);
    });
    render(<ProviderModelPicker />);
    expect(await screen.findByText('OpenCode')).toBeTruthy();
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect(await screen.findByLabelText('Provider and model for developer')).toBeTruthy();
  });

  it('saves a role assignment and updates the revision', async () => {
    stubFetch(async (url, init) => {
      if (url === '/api/providers') return ok(liveProviders);
      if (url === '/api/routing/selection' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init?.body));
        return ok({ ...liveSelection, revision: 4, selection: body.selection });
      }
      return ok(liveSelection);
    });
    render(<ProviderModelPicker />);
    const select = (await screen.findByLabelText('Provider and model for developer')) as HTMLSelectElement;
    expect(select.value).toBe('opencode/glm-4');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'opencode/glm-4' } });
    });
    expect(await screen.findByText(/rev 4/)).toBeTruthy();
  });

  it('falls back to the fixture snapshot when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<ProviderModelPicker />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    expect(await screen.findByText(/showing fixture providers/)).toBeTruthy();
  });
});
