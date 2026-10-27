import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchOverviewHealth, OverviewApiError } from './overview';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

describe('fetchOverviewHealth', () => {
  it('maps status ok to healthy', async () => {
    stubFetch(async (url) => {
      expect(url).toBe('/api/health');
      return ok({ status: 'ok' });
    });
    await expect(fetchOverviewHealth()).resolves.toBe('healthy');
  });

  it('maps any other status to degraded', async () => {
    stubFetch(async () => ok({ status: 'down' }));
    await expect(fetchOverviewHealth()).resolves.toBe('degraded');
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchOverviewHealth()).rejects.toBeInstanceOf(OverviewApiError);
  });
});
