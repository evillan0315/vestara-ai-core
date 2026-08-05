import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeSessionsPage } from '../src/components/opencode/OpenCodeSessionsPage.js';
import type { OpenCodeSessionView } from '../src/lib/opencode.js';
import { ThemeProvider } from '../src/lib/theme.js';

const mocks = vi.hoisted(() => ({
  sessions: vi.fn(),
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('../src/lib/opencode.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/opencode.js')>();
  return {
    ...original,
    openCodeApi: {
      ...original.openCodeApi,
      sessions: mocks.sessions,
      renameSession: mocks.renameSession,
      deleteSession: mocks.deleteSession,
    },
  };
});

const sessions: OpenCodeSessionView[] = [
  {
    id: 'ses_aaa',
    title: 'API cleanup',
    agent: 'Developer',
    status: 'active',
    additions: 3,
    deletions: 1,
    filesChanged: 2,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  },
  {
    id: 'ses_bbb',
    title: 'Runtime work',
    agent: 'Architect',
    status: 'idle',
    additions: 0,
    deletions: 0,
    filesChanged: 0,
    createdAt: '2026-08-04T00:00:00.000Z',
  },
  {
    id: 'ses_ccc',
    title: 'Unknown status session',
    agent: 'Developer',
    status: 'unknown',
    additions: 0,
    deletions: 0,
    filesChanged: 0,
  },
];

function renderList(initial = '/opencode/sessions') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/opencode/sessions" element={<OpenCodeSessionsPage />} />
          <Route path="/opencode/sessions/new" element={<div>new session page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.sessions.mockReset();
  mocks.renameSession.mockReset();
  mocks.deleteSession.mockReset();
});

describe('OpenCodeSessionsPage', () => {
  it('renders existing sessions with status badges', async () => {
    mocks.sessions.mockResolvedValue(sessions);
    renderList();
    expect(await screen.findByText('API cleanup')).toBeTruthy();
    expect(screen.getByText('Runtime work')).toBeTruthy();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Idle').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });

  it('renders the empty state and leads to creation', async () => {
    mocks.sessions.mockResolvedValue([]);
    renderList();
    expect(await screen.findByText('No OpenCode sessions yet.')).toBeTruthy();
    const create = screen.getAllByRole('button', { name: 'New Session' })[0];
    create.click();
    expect(await screen.findByText('new session page')).toBeTruthy();
  });

  it('filters sessions by status', async () => {
    mocks.sessions.mockResolvedValue(sessions);
    renderList();
    await screen.findByText('API cleanup');
    await userEvent.click(screen.getByRole('button', { name: 'Idle' }));
    await waitFor(() => expect(screen.queryByText(/API cleanup/)).toBeNull());
    expect(screen.getByText('Runtime work')).toBeTruthy();
    expect(screen.queryByText(/Unknown status session/)).toBeNull();
  });

  it('searches by title or session id', async () => {
    mocks.sessions.mockResolvedValue(sessions);
    renderList();
    await screen.findByText('API cleanup');
    const search = screen.getByPlaceholderText('Search sessions…');
    await userEvent.type(search, 'Runtime');
    expect(screen.getByText('Runtime work')).toBeTruthy();
    expect(screen.queryByText(/API cleanup/)).toBeNull();
    await userEvent.clear(search);
    await userEvent.type(search, 'ses_aaa');
    expect(screen.getByText('API cleanup')).toBeTruthy();
    expect(screen.queryByText('Runtime work')).toBeNull();
  });

  it('shows the offline state when the runtime is unreachable', async () => {
    mocks.sessions.mockResolvedValue(null);
    renderList();
    expect(await screen.findByText('OpenCode is unreachable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'New Session' })[0].hasAttribute('disabled')).toBe(true);
  });

  it('recovers after retry from offline', async () => {
    mocks.sessions.mockResolvedValueOnce(null).mockResolvedValueOnce(sessions);
    renderList();
    expect(await screen.findByText('OpenCode is unreachable')).toBeTruthy();
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(await screen.findByText('API cleanup')).toBeTruthy();
    await waitFor(() => expect(mocks.sessions).toHaveBeenCalledTimes(2));
  });

  it('renames a session after confirmation and does not optimistically mutate', async () => {
    mocks.sessions.mockResolvedValue(sessions);
    mocks.renameSession.mockResolvedValue({ ...sessions[0], title: 'API cleanup v2' });
    renderList();
    await screen.findByText('API cleanup');
    await userEvent.click(screen.getAllByTitle('Rename session')[0]);
    const input = await screen.findByDisplayValue('API cleanup');
    await userEvent.clear(input);
    await userEvent.type(input, 'API cleanup v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mocks.renameSession).toHaveBeenCalledWith('ses_aaa', 'API cleanup v2');
    expect(await screen.findByText('API cleanup v2')).toBeTruthy();
  });

  it('deletes a session after confirmation', async () => {
    mocks.sessions.mockResolvedValue(sessions);
    mocks.deleteSession.mockResolvedValue(true);
    renderList();
    await screen.findByText('API cleanup');
    await userEvent.click(screen.getAllByTitle('Delete session')[0]);
    expect(await screen.findByRole('dialog', { name: 'Delete session' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteSession).toHaveBeenCalledWith('ses_aaa'));
    await waitFor(() => expect(screen.queryByText('API cleanup')).toBeNull());
  });

  it('surfaces delete failure without removing the row', async () => {
    mocks.sessions.mockResolvedValue(sessions);
    mocks.deleteSession.mockResolvedValue(false);
    renderList();
    await screen.findByText('API cleanup');
    await userEvent.click(screen.getAllByTitle('Delete session')[0]);
    expect(await screen.findByRole('dialog', { name: 'Delete session' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Delete failed/)).toBeTruthy();
    expect(screen.getAllByText('API cleanup').length).toBeGreaterThan(0);
  });
});
