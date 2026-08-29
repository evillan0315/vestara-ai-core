import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpenCodeOverview } from '../src/lib/opencode.js';
import { ThemeProvider } from '../src/lib/theme.js';
import OpenCodePage from '../src/pages/OpenCode.js';

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
}));

vi.mock('../src/lib/opencode.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/opencode.js')>();
  return {
    ...original,
    openCodeApi: { ...original.openCodeApi, overview: mocks.overview },
  };
});

const readyOverview: OpenCodeOverview = {
  health: {
    integration: 'opencode',
    status: 'healthy',
    reachable: true,
    upstream: { healthy: true, version: '1.18.8' },
    checkedAt: '2026-08-05T00:00:00.000Z',
    latencyMs: 12,
    eventBridge: { connected: true, connectionState: 'connected' },
  },
  project: {
    id: 'proj-1',
    worktree: '/home/user/repo',
    vcs: 'git',
    name: 'repo',
  },
  agents: [{ name: 'build', mode: 'primary', native: true }],
  providers: [{ id: 'opencode', name: 'OpenCode', modelCount: 13 }],
  compatibility: {
    status: 'compatible',
    pinnedSchemaChecksum: 'sha256:abc',
    liveSchemaChecksum: 'sha256:abc',
    checksumMatches: true,
    breakingChanges: [],
    warnings: [],
    openCodeVersion: '1.18.8',
    checkedAt: '2026-08-05T00:00:00.000Z',
  },
};

function renderOpenCode() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/opencode']}>
        <Routes>
          <Route path="/opencode" element={<OpenCodePage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  vi.useRealTimers();
  mocks.overview.mockReset();
});

describe('OpenCodePage', () => {
  it('renders runtime health, project, agents, providers, and compatibility when healthy', async () => {
    mocks.overview.mockResolvedValue(readyOverview);
    renderOpenCode();

    expect(await screen.findByRole('heading', { name: 'OpenCode' })).toBeTruthy();
    expect(await screen.findByText('Runtime Health')).toBeTruthy();
    expect(await screen.findByText('healthy')).toBeTruthy();
    expect(screen.getByText('Current Repository')).toBeTruthy();
    expect(screen.getByText(/home\/user\/repo/)).toBeTruthy();
    expect(screen.getByText('Agents (1)')).toBeTruthy();
    expect(screen.getByText('build')).toBeTruthy();
    expect(screen.getByText('Providers (1)')).toBeTruthy();
    expect(screen.getByText('Contract Compatibility')).toBeTruthy();
    expect(screen.getByText('compatible')).toBeTruthy();
    await waitFor(() => expect(mocks.overview).toHaveBeenCalled());
  });

  it('shows the offline state when the runtime is unreachable', async () => {
    mocks.overview.mockResolvedValue({
      ...readyOverview,
      health: null,
      compatibility: null,
    });
    renderOpenCode();

    expect(await screen.findByText('OpenCode is unreachable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByText('No health data.')).toBeTruthy();
  });

  it('shows the degraded state when health is unhealthy', async () => {
    mocks.overview.mockResolvedValue({
      ...readyOverview,
      health: {
        integration: 'opencode',
        status: 'unhealthy',
        reachable: true,
        upstream: { healthy: false, version: '1.18.8' },
        checkedAt: '2026-08-05T00:00:00.000Z',
        latencyMs: 3000,
        eventBridge: { connected: false, connectionState: 'disconnected' },
      },
    });
    renderOpenCode();

    expect(await screen.findByText('OpenCode is degraded')).toBeTruthy();
  });

  it('shows the degraded state when the contract checksums differ', async () => {
    mocks.overview.mockResolvedValue({
      ...readyOverview,
      compatibility: {
        ...readyOverview.compatibility!,
        checksumMatches: false,
        liveSchemaChecksum: 'sha256:def',
        warnings: [{ severity: 'compatible', kind: 'endpoint-added', path: '/x', summary: 'Endpoint added: /x' }],
      },
    });
    renderOpenCode();

    expect(await screen.findByText('OpenCode is degraded')).toBeTruthy();
    expect(await screen.findByText('differ')).toBeTruthy();
  });

  it('recovers from offline to ready via retry without a reload', async () => {
    mocks.overview.mockResolvedValueOnce({
      ...readyOverview,
      health: null,
      compatibility: null,
    });
    mocks.overview.mockResolvedValueOnce(readyOverview);
    renderOpenCode();

    expect(await screen.findByText('OpenCode is unreachable')).toBeTruthy();
    screen.getByRole('button', { name: 'Retry' }).click();

    expect(await screen.findByText('Runtime Health')).toBeTruthy();
    expect(screen.getByText('healthy')).toBeTruthy();
    expect(screen.queryByText('OpenCode is unreachable')).toBeNull();
    await waitFor(() => expect(mocks.overview).toHaveBeenCalledTimes(2));
  });
});
