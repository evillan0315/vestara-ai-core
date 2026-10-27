/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceUiToggle } from './WorkspaceUiToggle';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown, init?: RequestInit) => handler(String(url), init)),
  );
}

const settings = (value: unknown, revision = 'rev-1') => ({
  revision,
  settings: [{ key: 'general.workspaceUiVersion', section: 'general', value, source: 'workspace' }],
});

describe('WorkspaceUiToggle', () => {
  it('loads the live version and flips v1 to v2 on switch', async () => {
    stubFetch(async (url, init) => {
      if (url === '/api/system/environment') return ok({ variables: [] });
      if (url === '/api/settings' && init?.method === 'PATCH')
        return ok({ saved: true, configuration: settings('v2', 'rev-2') });
      return ok(settings('v1'));
    });
    render(<WorkspaceUiToggle />);
    const toggle = await screen.findByRole('switch', { name: 'Workspace UI version' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(await screen.findByText('v1 (stable)')).toBeTruthy();
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(await screen.findByText('v2 (next)')).toBeTruthy();
  });

  it('locks the switch when the env overlay wins', async () => {
    stubFetch(async (url) => {
      if (url === '/api/settings') return ok(settings('v1'));
      return ok({
        variables: [{ name: 'VESTARA_WORKSPACE_UI_VERSION', effectiveSource: 'environment', effectiveValue: 'v2' }],
      });
    });
    render(<WorkspaceUiToggle />);
    const toggle = await screen.findByRole('switch', { name: 'Workspace UI version' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText(/Locked by VESTARA_WORKSPACE_UI_VERSION/)).toBeTruthy();
  });

  it('falls back to the fixture with a note when the API is unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<WorkspaceUiToggle />);
    const toggle = await screen.findByRole('switch', { name: 'Workspace UI version' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(await screen.findByText(/API unreachable/)).toBeTruthy();
  });
});
