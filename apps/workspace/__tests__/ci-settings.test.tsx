// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CIStatusResult, CIStatusView, CIWaitProjection } from '../src/components/ci/index.js';
import { ThemeProvider } from '../src/lib/theme.js';
import { CISettings } from '../src/pages/Settings/CI/CISettings.js';
import SettingsPage from '../src/pages/Settings/SettingsPage.js';
import { SETTINGS_SECTIONS } from '../src/pages/Settings/settings-navigation.js';
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
  ],
};

const WAIT: CIWaitProjection = {
  taskId: 'task-ci-42',
  taskSummary: 'Wire CI settings to the CI read model',
  taskStatus: 'awaiting-verification',
  waitRef: 'ci-corr:vestara-ai-core:deadbeef:task-ci-42',
  provider: 'github-actions',
  runRef: 'run-4242',
  repository: 'vestara-ai-core',
  commitSha: 'deadbeefcafe',
  branch: 'main',
  originatingWorkflowRunId: 'wfr-9',
  suspendedAt: '2026-09-16T00:00:00.000Z',
};

const STATUS_VIEW: CIStatusView = {
  connection: {
    status: 'configured',
    tokenConfigured: true,
    webhookConfigured: true,
    adapterVersion: '0.1.0',
    repositories: ['vestara-ai-core'],
  },
  github: { availability: 'unavailable', reason: 'CI observation bodies are not persisted' },
  verification: {
    availability: 'available',
    disposition: 'pending-verification',
    action: 'PROCEED_TO_VERIFICATION',
    decisionRef: 'ciobs-1:PROCEED_TO_VERIFICATION',
    decidedAt: '2026-09-16T00:10:00.000Z',
  },
  webhook: { state: 'configured', signatureConfigured: true, detail: 'Webhook secret configured' },
  waits: [WAIT],
  correlationAvailability: 'available',
};

const STATUS_AVAILABLE: CIStatusResult = {
  view: STATUS_VIEW,
  availability: 'available',
  loading: false,
  refresh: () => {},
};

function renderCI(props: { statusOverride?: CIStatusResult } = {}) {
  return render(
    <ThemeProvider>
      <CISettings {...props} />
    </ThemeProvider>,
  );
}

function renderSettings(path = '/settings/ci') {
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

describe('CI settings surface', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
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

  it('registers a CI section in the settings navigation', () => {
    const ci = SETTINGS_SECTIONS.find((entry) => entry.id === 'ci');
    expect(ci?.label).toBe('Continuous Integration');
    expect(ci?.group).toBe('operations');
  });

  it('renders the cleaned primary hierarchy', () => {
    renderCI({ statusOverride: STATUS_AVAILABLE });
    for (const heading of [
      'GitHub Connection',
      'Continuous Integration',
      'Verification Waits',
      'Verification Policy',
      'Advanced — diagnostics',
    ]) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
  });

  it('shows live connection metadata without claiming connectivity', () => {
    renderCI({ statusOverride: STATUS_AVAILABLE });
    expect(screen.getAllByText('Configured').length).toBeGreaterThan(0);
    expect(screen.getByText('0.1.0')).toBeTruthy();
    expect(screen.getAllByText('vestara-ai-core').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Connected')).toHaveLength(0);
  });

  it('keeps GitHub CI status distinct from Vestara verification', () => {
    renderCI({ statusOverride: STATUS_AVAILABLE });
    expect(screen.getByText('No CI observation is available')).toBeTruthy();
    expect(screen.getByText('Pending Vestara verification')).toBeTruthy();
    expect(screen.getAllByText(/independent authorities/).length).toBeGreaterThan(0);
  });

  it('renders authoritative waits and correlation from the read model', () => {
    renderCI({ statusOverride: STATUS_AVAILABLE });
    expect(screen.getByText('Wire CI settings to the CI read model')).toBeTruthy();
    expect(screen.getAllByText('awaiting-verification').length).toBeGreaterThan(0);
    expect(screen.getAllByText(WAIT.waitRef).length).toBeGreaterThan(0);
    expect(screen.getByText('WorkflowTask ID')).toBeTruthy();
  });

  it('places diagnostics under Advanced without deleting them', () => {
    renderCI({ statusOverride: STATUS_AVAILABLE });
    expect(screen.getByText('Webhook Ingress')).toBeTruthy();
    expect(screen.getByText('Authority Boundaries')).toBeTruthy();
    expect(screen.getByText('Backend Data Gaps')).toBeTruthy();
    expect(screen.getByText(/raw provider payloads stay behind the adapter boundary/)).toBeTruthy();
    expect(screen.getAllByText('HOLD').length).toBeGreaterThan(0);
  });

  it('holds unsupported configuration without fabricating persistence', () => {
    const { container } = renderCI({ statusOverride: STATUS_AVAILABLE });
    const toggle = screen.getByRole('switch', { name: 'CI observation' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.closest('fieldset')?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(container.textContent).toContain('Disabled — persistence unavailable (/api/ci/config does not exist)');
    expect(screen.getByText('No repositories configured. Repository mapping is not yet persisted.')).toBeTruthy();
  });

  it('renders an explicit HOLD when the CI read boundary is unavailable', async () => {
    renderCI();
    expect(await screen.findByText('The CI read boundary is unavailable')).toBeTruthy();
  });

  it('never emits secret values or raw palette hardcode', () => {
    const { container } = renderCI({ statusOverride: STATUS_AVAILABLE });
    const html = container.innerHTML;
    expect(html).toContain('var(--vestara-');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toMatch(/\b(?:bg|text|border)-\[#/);
    expect(html).not.toMatch(/ghp_|ghs_|Bearer /);
  });

  it('renders identically under dark and light themes', () => {
    const dark = renderCI({ statusOverride: STATUS_AVAILABLE });
    expect(dark.getByText('GitHub Connection')).toBeTruthy();
    dark.unmount();

    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    const light = renderCI({ statusOverride: STATUS_AVAILABLE });
    expect(light.getByText('GitHub Connection')).toBeTruthy();
    expect(light.container.innerHTML).toContain('var(--vestara-');
    light.unmount();
  });

  it('wires the /settings/ci route with active navigation', async () => {
    renderSettings('/settings/ci');
    const region = await screen.findAllByRole('heading', { name: 'Continuous Integration' });
    expect(region.length).toBeGreaterThan(0);
    const ciLinks = screen.getAllByRole('link', { name: /Continuous Integration/ });
    expect(ciLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });
});
