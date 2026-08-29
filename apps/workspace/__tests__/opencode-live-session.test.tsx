import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeSessionPage } from '../src/components/opencode/OpenCodeSessionPage.js';
import type { OpenCodeSessionDetail } from '../src/lib/opencode.js';
import type { OpenCodeStreamClient } from '../src/lib/opencode-events.js';
import { ThemeProvider } from '../src/lib/theme.js';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  messages: vi.fn(),
  sendMessage: vi.fn(),
  abortSession: vi.fn(),
  deleteSession: vi.fn(),
  streamInstances: [] as Array<{
    open: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    clearDedupe: ReturnType<typeof vi.fn>;
    currentStatus: string;
  }>,
  StreamOptions: undefined as { onStatus?: (s: string) => void; onEvent?: (e: unknown) => void } | undefined,
}));

vi.mock('../src/lib/opencode.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/opencode.js')>();
  return {
    ...original,
    openCodeApi: {
      ...original.openCodeApi,
      session: mocks.session,
      messages: mocks.messages,
      sendMessage: mocks.sendMessage,
      abortSession: mocks.abortSession,
      deleteSession: mocks.deleteSession,
    },
  };
});

vi.mock('../src/lib/opencode-events.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/opencode-events.js')>();
  class MockStreamClient {
    open = vi.fn();
    close = vi.fn();
    clearDedupe = vi.fn();
    currentStatus = 'connected';
    constructor(opts?: { onStatus?: (s: string) => void; onEvent?: (e: unknown) => void }) {
      mocks.StreamOptions = opts;
      mocks.streamInstances.push(this);
    }
  }
  return {
    ...original,
    OpenCodeStreamClient: MockStreamClient,
  };
});

const session: OpenCodeSessionDetail = {
  id: 'ses_1',
  title: 'Live session',
  agent: 'build',
  status: 'active',
  filesChanged: 0,
  additions: 0,
  deletions: 0,
  directory: '/home/user/repo',
  createdAt: '2026-08-05T00:00:00.000Z',
};

function renderLive(initial = '/opencode/sessions/ses_1') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/opencode/sessions/:sessionId" element={<OpenCodeSessionPage />} />
          <Route path="/opencode/sessions" element={<div>list page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.session.mockReset();
  mocks.messages.mockReset();
  mocks.sendMessage.mockReset();
  mocks.abortSession.mockReset();
  mocks.deleteSession.mockReset();
  mocks.streamInstances.length = 0;
  mocks.StreamOptions = undefined;
  mocks.session.mockResolvedValue(session);
  mocks.messages.mockResolvedValue([
    { id: 'msg_1', role: 'user', text: 'hello', agent: 'build', createdAt: '2026-08-05T00:00:01.000Z' },
  ]);
});

describe('OpenCodeSessionPage (live workspace)', () => {
  it('loads the REST snapshot and connects the event stream', async () => {
    renderLive();
    expect(await screen.findByText('Live session')).toBeTruthy();
    expect(screen.getByText('hello')).toBeTruthy();
    await waitFor(() => expect(mocks.streamInstances).toHaveLength(1));
    await waitFor(() => expect(mocks.streamInstances[0].open).toHaveBeenCalled());
  });

  it('closes the stream on unmount', async () => {
    const { unmount } = renderLive();
    await screen.findByText('Live session');
    unmount();
    await waitFor(() => expect(mocks.streamInstances[0].close).toHaveBeenCalled());
  });

  it('submits a follow-up message and clears the draft on success', async () => {
    mocks.sendMessage.mockResolvedValue(true);
    renderLive();
    await screen.findByText('Live session');
    await userEvent.type(screen.getByPlaceholderText(/Send a follow-up message/), 'continue the work');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mocks.sendMessage).toHaveBeenCalledWith('ses_1', 'continue the work'));
  });

  it('surfaces message submission failure without adding a message', async () => {
    mocks.sendMessage.mockResolvedValue(false);
    renderLive();
    await screen.findByText('Live session');
    await userEvent.type(screen.getByPlaceholderText(/Send a follow-up message/), 'will fail');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/Message send failed/)).toBeTruthy();
  });

  it('aborts an active session only after API confirmation', async () => {
    mocks.abortSession.mockResolvedValue(true);
    renderLive();
    await screen.findByText('Live session');
    await userEvent.click(screen.getByRole('button', { name: 'Abort' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abort session' });
    expect(within(dialog).getByRole('button', { name: 'Continue Running' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Abort Session' })).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abort Session' }));
    await waitFor(() => expect(mocks.abortSession).toHaveBeenCalledWith('ses_1'));
    expect(await screen.findByText('Aborted')).toBeTruthy();
  });

  it('shows abort failure without marking the session aborted', async () => {
    mocks.abortSession.mockResolvedValue(false);
    renderLive();
    await screen.findByText('Live session');
    await userEvent.click(screen.getByRole('button', { name: 'Abort' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abort session' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Abort Session' }));
    expect(await screen.findByText(/Abort failed/)).toBeTruthy();
    expect(screen.queryByText('Aborted')).toBeNull();
  });

  it('shows the disconnected banner when the stream is not connected', async () => {
    renderLive();
    await screen.findByText('Live session');
    act(() => mocks.StreamOptions?.onStatus?.('disconnected'));
    expect(await screen.findByText('Live updates interrupted')).toBeTruthy();
  });
});
