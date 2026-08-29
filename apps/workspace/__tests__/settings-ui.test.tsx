import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import SettingsPage from '../src/pages/Settings/SettingsPage.js';
import { settingsClient } from '../src/pages/Settings/settings-client.js';

vi.mock('../src/pages/Settings/settings-client.js', () => ({
  settingsClient: {
    configuration: vi.fn(),
    runtime: vi.fn(),
    cli: vi.fn(),
    history: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
  },
}));

const configuration: ResolvedConfiguration = {
  workspaceId: 'workspace-test',
  revision: 'revision-1',
  generatedAt: '2026-08-01T00:00:00.000Z',
  userConfigPath: '/user/config.json',
  workspaceConfigPath: '/workspace/.vestara/config.json',
  overrideCount: 0,
  settings: [
    { key: 'general.name', section: 'general', value: 'Vestara', source: 'default', inherited: true, sensitive: false },
    {
      key: 'providers.defaultProvider',
      section: 'providers',
      value: 'opencode',
      source: 'default',
      inherited: true,
      sensitive: false,
    },
    {
      key: 'verification.profile',
      section: 'verification',
      value: 'standard',
      source: 'default',
      inherited: true,
      sensitive: false,
    },
  ],
};

function renderSettings(path = '/settings/overview') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/settings/*" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('premium settings control surface', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(settingsClient.configuration).mockResolvedValue(configuration);
    vi.mocked(settingsClient.runtime).mockResolvedValue({
      status: 'running',
      apiEndpoint: 'http://127.0.0.1:3001',
      websocketEndpoint: 'ws://127.0.0.1:3001/ws',
      websocketStatus: 'available',
      runtimeVersion: '0.3.0',
      workspaceId: 'workspace-test',
      currentSession: 'workspace-test',
      activeExecutionCount: 0,
      eventBusStatus: 'running',
      engineeringGraphStatus: 'healthy',
      engineeringEventStoreStatus: 'running',
      engineeringEventCount: 12,
      filesystemRuntimeStatus: 'available',
      verificationRuntimeStatus: 'running',
      telemetryStatus: 'running',
    });
    vi.mocked(settingsClient.cli).mockResolvedValue({
      detected: true,
      executablePath: '/vestara/cli',
      cliVersion: '0.3.0',
      runtimeVersion: '0.3.0',
      compatible: true,
      runtimeConnected: true,
      connectionEvidence: 'connected',
      workspaceId: 'workspace-test',
      connectedWorkspace: '/vestara',
      runtimeEndpoint: 'http://127.0.0.1:3001',
      authenticationStatus: 'local-session',
      localSocketPath: '/tmp/vestara.sock',
      localSocketAvailable: false,
      transport: 'http',
      configurationSynchronized: true,
    });
    vi.mocked(settingsClient.history).mockResolvedValue({
      persistence: 'memory',
      eventCount: 12,
      latestSequence: 12,
      oldestRetainedAt: null,
      checkpointCount: 0,
      checkpointInterval: 100,
      checkpointRetention: 5,
      eventSchemaVersion: 1,
      workspaceStoreIdentity: 'workspace-test',
    });
  });

  it('preserves overview navigation and exposes semantic runtime status', async () => {
    renderSettings();
    expect(await screen.findByRole('heading', { name: 'Workspace Configuration' })).toBeTruthy();
    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('link', { name: /Overview/ }).every((link) => link.getAttribute('aria-current') === 'page'),
    ).toBe(true);
  });

  it('filters categories and exposes a clear action for empty results', async () => {
    renderSettings();
    await screen.findByRole('heading', { name: 'Workspace Configuration' });
    fireEvent.change(screen.getAllByLabelText('Search settings')[0], { target: { value: 'impossible-query' } });
    expect(screen.getAllByText('No settings found').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear search' })[0]);
    expect(screen.getAllByRole('link', { name: /Overview/ }).length).toBeGreaterThan(0);
  });

  it('uses the existing theme provider for profile selection', async () => {
    renderSettings('/settings/general');
    const minimalLabel = await screen.findByText('Minimal');
    const minimal = minimalLabel.closest('button');
    expect(minimal).toBeTruthy();
    if (!minimal) throw new Error('Minimal profile button was not rendered');
    fireEvent.click(minimal);
    await waitFor(() => expect(minimal.getAttribute('aria-pressed')).toBe('true'));
    expect(document.documentElement.style.getPropertyValue('--vestara-font-family')).toContain('ui-monospace');
  });
});
