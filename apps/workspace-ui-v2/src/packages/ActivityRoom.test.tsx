/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityRoomPkg } from './ActivityRoom';

const ok = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: unknown) => handler(String(url))),
  );
}

describe('ActivityRoomPkg', () => {
  it('renders the live snapshot with a LIVE pill', async () => {
    stubFetch(async () =>
      ok({
        complete: true,
        participants: [{ participantId: 'p1', displayName: 'Atlas', presence: 'online', workState: 'working' }],
        stream: [{ streamItemId: 's1', actor: 'Atlas', content: 'Task done', timestamp: new Date().toISOString() }],
      }),
    );
    render(<ActivityRoomPkg />);
    expect(await screen.findByText('LIVE')).toBeTruthy();
    expect((await screen.findAllByText(/Atlas/)).length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('Task done')).toBeTruthy();
    expect(await screen.findByText('1 records')).toBeTruthy();
  });

  it('falls back to fixtures with a SNAPSHOT pill when offline', async () => {
    stubFetch(async () => {
      throw new Error('down');
    });
    render(<ActivityRoomPkg />);
    expect(await screen.findByText('SNAPSHOT')).toBeTruthy();
    // Canonical v1 fixture roster renders offline.
    expect(await screen.findByText('Developer Active')).toBeTruthy();
    expect(await screen.findByText('Teal logo bound to wallpaper')).toBeTruthy();
  });
});
