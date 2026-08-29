import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCodeNewSessionPage } from '../src/components/opencode/OpenCodeNewSessionPage.js';
import { OpenCodeSessionPage } from '../src/components/opencode/OpenCodeSessionPage.js';
import { ThemeProvider } from '../src/lib/theme.js';

const mocks = vi.hoisted(() => ({
  health: vi.fn(),
  project: vi.fn(),
  agents: vi.fn(),
  providers: vi.fn(),
  createSession: vi.fn(),
  session: vi.fn(),
  messages: vi.fn(),
  deleteSession: vi.fn(),
}));

vi.mock('../src/lib/opencode.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/opencode.js')>();
  return {
    ...original,
    openCodeApi: {
      ...original.openCodeApi,
      health: mocks.health,
      project: mocks.project,
      agents: mocks.agents,
      providers: mocks.providers,
      createSession: mocks.createSession,
      session: mocks.session,
      messages: mocks.messages,
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
  }
  return { ...original, OpenCodeStreamClient: MockStreamClient };
});

const project = { id: 'proj-1', worktree: '/home/user/repo', vcs: 'git' as const, name: 'repo' };
const agents = [{ name: 'build', mode: 'primary', native: true }];
const providers = [{ id: 'opencode', name: 'OpenCode', source: 'custom', modelCount: 13 }];

function renderNew() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/opencode/sessions/new']}>
        <Routes>
          <Route path="/opencode/sessions/new" element={<OpenCodeNewSessionPage />} />
          <Route path="/opencode/sessions/:sessionId" element={<OpenCodeSessionPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  mocks.health.mockReset();
  mocks.project.mockReset();
  mocks.agents.mockReset();
  mocks.providers.mockReset();
  mocks.createSession.mockReset();
  mocks.session.mockReset();
  mocks.messages.mockReset();
  mocks.deleteSession.mockReset();
  mocks.messages.mockResolvedValue([]);
});

describe('OpenCodeNewSessionPage', () => {
  it('loads execution context and blocks empty requests', async () => {
    mocks.health.mockResolvedValue({
      integration: 'opencode',
      status: 'healthy',
      reachable: true,
      upstream: { healthy: true, version: '1.18.8' },
      checkedAt: '2026-08-05T00:00:00.000Z',
      latencyMs: 5,
      eventBridge: { connected: true, connectionState: 'connected' },
    });
    mocks.project.mockResolvedValue({ projects: [project], current: project });
    mocks.agents.mockResolvedValue({ agents });
    mocks.providers.mockResolvedValue({ providers });
    renderNew();

    expect(await screen.findByText('New Session')).toBeTruthy();
    expect(await screen.findByPlaceholderText('Engineering request…')).toBeTruthy();
    expect(screen.getByText('repo')).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create Session' });
    expect(create.hasAttribute('disabled')).toBe(true);
    await userEvent.type(screen.getByPlaceholderText('Engineering request…'), 'Build the feature');
    expect(create.hasAttribute('disabled')).toBe(false);
  });

  it('creates a session and navigates to its detail route', async () => {
    mocks.health.mockResolvedValue({
      integration: 'opencode',
      status: 'healthy',
      reachable: true,
      upstream: { healthy: true, version: '1.18.8' },
      checkedAt: '2026-08-05T00:00:00.000Z',
      latencyMs: 5,
      eventBridge: { connected: true, connectionState: 'connected' },
    });
    mocks.project.mockResolvedValue({ projects: [project], current: project });
    mocks.agents.mockResolvedValue({ agents });
    mocks.providers.mockResolvedValue({ providers });
    mocks.createSession.mockResolvedValue({ session: { id: 'ses_new', title: 'Build the feature', status: 'idle' } });
    mocks.session.mockResolvedValue({
      id: 'ses_new',
      title: 'Build the feature',
      status: 'idle',
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });
    renderNew();

    await userEvent.type(await screen.findByPlaceholderText('Engineering request…'), 'Build the feature');
    screen.getByRole('button', { name: 'Create Session' }).click();

    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    expect(mocks.createSession.mock.calls[0][0].title).toBe('Build the feature');
    expect(mocks.createSession.mock.calls[0][0].agent).toBe('build');
    expect(mocks.createSession.mock.calls[0][0].directory).toBe('/home/user/repo');
    expect(await screen.findByText('Build the feature')).toBeTruthy();
  });

  it('disables creation while OpenCode is offline', async () => {
    mocks.health.mockResolvedValue(null);
    mocks.project.mockResolvedValue({ projects: [project], current: project });
    mocks.agents.mockResolvedValue({ agents });
    mocks.providers.mockResolvedValue({ providers });
    renderNew();

    expect(await screen.findByText(/Creation is disabled/)).toBeTruthy();
    const create = screen.getByRole('button', { name: 'Create Session' });
    expect(create.hasAttribute('disabled')).toBe(true);
  });

  it('shows creation failure without navigating', async () => {
    mocks.health.mockResolvedValue({
      integration: 'opencode',
      status: 'healthy',
      reachable: true,
      upstream: { healthy: true, version: '1.18.8' },
      checkedAt: '2026-08-05T00:00:00.000Z',
      latencyMs: 5,
      eventBridge: { connected: true, connectionState: 'connected' },
    });
    mocks.project.mockResolvedValue({ projects: [project], current: project });
    mocks.agents.mockResolvedValue({ agents });
    mocks.providers.mockResolvedValue({ providers });
    mocks.createSession.mockResolvedValue(null);
    renderNew();

    await userEvent.type(await screen.findByPlaceholderText('Engineering request…'), 'Will fail');
    screen.getByRole('button', { name: 'Create Session' }).click();
    expect(await screen.findByText(/Session creation failed/)).toBeTruthy();
  });
});

describe('OpenCodeSessionPage', () => {
  it('renders the live session workspace header', async () => {
    mocks.session.mockResolvedValue({
      id: 'ses_det',
      title: 'Detail session',
      agent: 'build',
      model: { id: 'deepseek-v4-flash', providerID: 'opencode-go' },
      status: 'idle',
      filesChanged: 5,
      additions: 10,
      deletions: 2,
      directory: '/home/user/repo',
      createdAt: '2026-08-05T00:00:00.000Z',
    });
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/opencode/sessions/ses_det']}>
          <Routes>
            <Route path="/opencode/sessions/:sessionId" element={<OpenCodeSessionPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Detail session')).toBeTruthy();
    expect(screen.getByText('ses_det')).toBeTruthy();
    expect(screen.getByPlaceholderText(/Send a follow-up message/)).toBeTruthy();
    expect(screen.getByText('Lifecycle')).toBeTruthy();
  });

  it('handles session-not-found', async () => {
    mocks.session.mockResolvedValue(null);
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/opencode/sessions/missing']}>
          <Routes>
            <Route path="/opencode/sessions/:sessionId" element={<OpenCodeSessionPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByText('Session Not Found')).toBeTruthy();
  });

  it('deletes a session and navigates back to the list', async () => {
    mocks.session.mockResolvedValue({
      id: 'ses_det',
      title: 'Delete me',
      status: 'idle',
      filesChanged: 0,
      additions: 0,
      deletions: 0,
    });
    mocks.deleteSession.mockResolvedValue(true);
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/opencode/sessions/ses_det']}>
          <Routes>
            <Route path="/opencode/sessions/:sessionId" element={<OpenCodeSessionPage />} />
            <Route path="/opencode/sessions" element={<div>list page</div>} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    await screen.findByText('Delete me');
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete session' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteSession).toHaveBeenCalledWith('ses_det'));
    expect(await screen.findByText('list page')).toBeTruthy();
  });
});
