// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import SettingsPage from '../src/pages/Settings/SettingsPage.js';
import {
  type EnvironmentVariableView,
  type RuntimeStatusDto,
  settingsClient,
} from '../src/pages/Settings/settings-client.js';

vi.mock('../src/pages/Settings/settings-client.js', () => ({
  settingsClient: {
    configuration: vi.fn(),
    runtime: vi.fn(),
    cli: vi.fn(),
    history: vi.fn(),
    environment: vi.fn(),
    save: vi.fn(),
    reset: vi.fn(),
  },
}));

const FAKE_SECRET = 'sk-test-fake-secret-never-shown-9999';

const variables: EnvironmentVariableView[] = [
  {
    name: 'VESTARA_API_PORT',
    scope: 'api-process',
    description: 'API listen port.',
    effectiveSource: 'environment',
    hasValue: true,
    sensitive: false,
    masked: false,
    effectiveValue: '4001',
    editable: false,
    overridden: true,
    restartRequired: false,
  },
  {
    name: 'OPENAI_API_KEY',
    scope: 'opencode',
    description: 'OpenAI provider API key.',
    effectiveSource: 'environment',
    hasValue: true,
    sensitive: true,
    masked: true,
    editable: false,
    overridden: false,
    restartRequired: false,
  },
  {
    name: 'VESTARA_REPO',
    scope: 'api-process',
    description: 'Workspace root override.',
    effectiveSource: 'unknown',
    hasValue: false,
    sensitive: false,
    masked: false,
    editable: false,
    overridden: false,
    restartRequired: false,
  },
];

const runtime: RuntimeStatusDto = {
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
  engineeringEventCount: 0,
  filesystemRuntimeStatus: 'available',
  verificationRuntimeStatus: 'running',
  telemetryStatus: 'running',
};

const configuration: ResolvedConfiguration = {
  workspaceId: 'workspace-test',
  revision: 'revision-1',
  generatedAt: '2026-08-01T00:00:00.000Z',
  userConfigPath: '/user/config.json',
  workspaceConfigPath: '/workspace/.vestara/config.json',
  overrideCount: 0,
  settings: [],
};

function renderEnvironment() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/settings/environment']}>
        <Routes>
          <Route path="/settings/*" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('environment variables settings surface', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(settingsClient.configuration).mockResolvedValue(configuration);
    vi.mocked(settingsClient.runtime).mockResolvedValue(runtime);
    vi.mocked(settingsClient.cli).mockResolvedValue({
      detected: false,
      executablePath: null,
      cliVersion: null,
      runtimeVersion: '0.3.0',
      compatible: false,
      runtimeConnected: false,
      connectionEvidence: '',
      workspaceId: 'workspace-test',
      connectedWorkspace: '/repo',
      runtimeEndpoint: 'http://127.0.0.1:3001',
      authenticationStatus: 'local-session',
      localSocketPath: '',
      localSocketAvailable: false,
      transport: 'http',
      configurationSynchronized: false,
    });
    vi.mocked(settingsClient.history).mockResolvedValue({
      persistence: 'memory',
      eventCount: 0,
      latestSequence: 0,
      oldestRetainedAt: null,
      checkpointCount: 0,
      checkpointInterval: 100,
      checkpointRetention: 5,
      eventSchemaVersion: 1,
      workspaceStoreIdentity: 'workspace-test',
    });
    vi.mocked(settingsClient.environment).mockResolvedValue({ variables });
  });

  it('serves /settings/environment with values, masked secrets and unknown sources', async () => {
    const { container } = renderEnvironment();
    expect(await screen.findByText('VESTARA_API_PORT')).toBeTruthy();
    expect(await screen.findByText('4001')).toBeTruthy();
    // Secret presence is visible; plaintext never reaches the document.
    expect(await screen.findByText('OPENAI_API_KEY')).toBeTruthy();
    expect(screen.getByText('Configured')).toBeTruthy();
    expect(container.innerHTML).not.toContain(FAKE_SECRET);
    // Unknown source stays unknown, never guessed.
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    // Overridden indicator for env-over-default.
    expect(screen.getByText('Overridden')).toBeTruthy();
    // Navigation active state.
    const envLink = screen.getAllByRole('link').find((link) => link.getAttribute('href') === '/settings/environment');
    expect(envLink?.getAttribute('aria-current')).toBe('page');
  });

  it('filters by search text and scope', async () => {
    renderEnvironment();
    await screen.findByText('VESTARA_API_PORT');
    fireEvent.change(screen.getByLabelText('Search environment variables'), { target: { value: 'opencode' } });
    expect(screen.queryByText('VESTARA_API_PORT')).toBeNull();
    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search environment variables'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Filter by scope'), { target: { value: 'opencode' } });
    expect(screen.queryByText('VESTARA_API_PORT')).toBeNull();
    expect(screen.queryByText('VESTARA_REPO')).toBeNull();
    expect(screen.getByText('OPENAI_API_KEY')).toBeTruthy();
  });

  it('shows an empty state when nothing matches', async () => {
    renderEnvironment();
    await screen.findByText('VESTARA_API_PORT');
    fireEvent.change(screen.getByLabelText('Search environment variables'), { target: { value: 'no-such-variable' } });
    expect(await screen.findByText('No matching variables')).toBeTruthy();
  });
});
