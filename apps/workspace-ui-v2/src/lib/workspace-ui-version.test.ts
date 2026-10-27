import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUiVersionState, normalizeUiVersion, saveUiVersion, UiVersionApiError } from './workspace-ui-version';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
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

const environment = (entries: { name: string; effectiveSource: string; effectiveValue?: string }[]) => ({
  variables: entries,
});

describe('normalizeUiVersion', () => {
  it('accepts canonical values and aliases', () => {
    expect(normalizeUiVersion('v1')).toBe('v1');
    expect(normalizeUiVersion('V2')).toBe('v2');
    expect(normalizeUiVersion('next')).toBe('v2');
    expect(normalizeUiVersion('classic')).toBe('v1');
    expect(normalizeUiVersion('v3')).toBe(null);
    expect(normalizeUiVersion(2)).toBe(null);
  });
});

describe('fetchUiVersionState', () => {
  it('reads the persisted setting with its revision', async () => {
    stubFetch(async (url) => {
      if (url === '/api/settings') return ok(settings('v1'));
      return ok(environment([]));
    });
    await expect(fetchUiVersionState()).resolves.toMatchObject({
      version: 'v1',
      revision: 'rev-1',
      source: 'api',
      envLocked: false,
    });
  });

  it('locks to the env value when the environment overlay wins', async () => {
    stubFetch(async (url) => {
      if (url === '/api/settings') return ok(settings('v1'));
      return ok(
        environment([{ name: 'VESTARA_WORKSPACE_UI_VERSION', effectiveSource: 'environment', effectiveValue: 'v2' }]),
      );
    });
    await expect(fetchUiVersionState()).resolves.toMatchObject({
      version: 'v2',
      source: 'environment',
      envLocked: true,
    });
  });

  it('rejects with status 0 when the API is unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchUiVersionState()).rejects.toMatchObject({ status: 0 });
  });
});

describe('saveUiVersion', () => {
  it('patches the general section and returns the saved state', async () => {
    stubFetch(async (url, init) => {
      expect(url).toBe('/api/settings');
      expect(init?.method).toBe('PATCH');
      const body = JSON.parse(String(init?.body));
      expect(body.section).toBe('general');
      expect(body.overrides).toEqual({ 'general.workspaceUiVersion': 'v2' });
      expect(body.expectedRevision).toBe('rev-1');
      return ok({ saved: true, configuration: settings('v2', 'rev-2') });
    });
    await expect(saveUiVersion('v2', 'rev-1')).resolves.toMatchObject({
      version: 'v2',
      revision: 'rev-2',
      source: 'api',
    });
  });

  it('surfaces revision conflicts for refetch', async () => {
    stubFetch(async () => ok({ error: 'Configuration changed since it was loaded' }, 409));
    const error = await saveUiVersion('v1', 'rev-1').catch((e) => e);
    expect(error).toBeInstanceOf(UiVersionApiError);
    expect(error.status).toBe(409);
  });

  it('asks for an editor sign-in on 401', async () => {
    stubFetch(async () => ok({ error: 'Authentication is required.' }, 401));
    await expect(saveUiVersion('v1', 'rev-1')).rejects.toMatchObject({ status: 401 });
  });
});
