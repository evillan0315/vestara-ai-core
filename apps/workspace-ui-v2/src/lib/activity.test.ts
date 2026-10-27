import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityApiError, fetchActivitySnapshot, formatStreamAge } from './activity';

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

describe('fetchActivitySnapshot', () => {
  it('normalizes participants and stream, dropping empty rows', async () => {
    stubFetch(async (url) => {
      expect(url).toBe('/api/activity-room/v1/snapshot');
      return ok({
        complete: true,
        participants: [
          { participantId: 'p1', displayName: 'Atlas', presence: 'online', workState: 'working' },
          { participantId: '' },
        ],
        stream: [
          { streamItemId: 's1', actor: 'Atlas', content: 'Task done', timestamp: new Date().toISOString() },
          { streamItemId: 's2', actor: 'x', content: '   ', timestamp: '' },
        ],
      });
    });
    await expect(fetchActivitySnapshot()).resolves.toEqual({
      participants: [{ id: 'p1', name: 'Atlas', presence: 'online', workState: 'working' }],
      stream: [{ id: 's1', actor: 'Atlas', content: 'Task done', timestamp: expect.any(String) }],
      complete: true,
    });
  });

  it('caps the stream window and defaults incomplete snapshots', async () => {
    const items = Array.from({ length: 40 }, (_, i) => ({
      streamItemId: `s${i}`,
      actor: 'a',
      content: `m${i}`,
      timestamp: '',
    }));
    stubFetch(async () => ok({ participants: [], stream: items }));
    const snap = await fetchActivitySnapshot();
    expect(snap.stream).toHaveLength(25);
    expect(snap.complete).toBe(true);
  });

  it('rejects with status 0 when unreachable', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    await expect(fetchActivitySnapshot()).rejects.toBeInstanceOf(ActivityApiError);
  });
});

describe('formatStreamAge', () => {
  it('formats now/minutes/hours/days and blanks unparseable input', () => {
    const now = Date.parse('2026-10-27T12:00:00.000Z');
    expect(formatStreamAge(new Date(now - 10_000).toISOString(), now)).toBe('now');
    expect(formatStreamAge(new Date(now - 5 * 60000).toISOString(), now)).toBe('5m');
    expect(formatStreamAge(new Date(now - 3 * 3600000).toISOString(), now)).toBe('3h');
    expect(formatStreamAge(new Date(now - 2 * 86400000).toISOString(), now)).toBe('2d');
    expect(formatStreamAge('', now)).toBe('');
    expect(formatStreamAge('not-a-date', now)).toBe('');
  });
});
