// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/lib/theme.js';
import type { DiagSummary } from '../src/lib/diagnostics.js';
import SettingsPage from '../src/pages/Settings/SettingsPage.js';
import SystemOverview, { formatGib, formatUptime } from '../src/pages/Settings/SystemOverview.js';
import { settingsClient, type RuntimeStatusDto } from '../src/pages/Settings/settings-client.js';

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

vi.mock('../src/lib/diagnostics.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/diagnostics.js')>();
  return { ...original, diagnosticsApi: { ...original.diagnosticsApi, summary: vi.fn() } };
});

const { diagnosticsApi } = await import('../src/lib/diagnostics.js');
const mockSummary = vi.mocked(diagnosticsApi.summary);

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
  engineeringEventCount: 12,
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

function summaryFixture(overrides: Partial<DiagSummary> = {}): DiagSummary {
  return {
    ts: Date.now(),
    os: {
      platform: 'linux',
      type: 'Linux',
      release: '6.8.0',
      kernel: '6.8.0-vestara',
      arch: 'x64',
      hostname: 'vestara-host',
      user: 'vestara',
      home: '/home/vestara',
      uptime: 90061,
      bootTime: Date.now() - 90061 * 1000,
      timezone: 'UTC',
      locale: 'en-US',
      cpuModel: 'Test CPU',
    },
    network: {
      interfaces: [
        { name: 'lo', family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', mac: '', internal: true },
        { name: 'eth0', family: 'IPv4', address: '10.0.0.5', netmask: '255.255.255.0', mac: '', internal: false },
      ],
      gateway: '10.0.0.1',
    },
    cpu: {
      model: 'Test CPU Model',
      physicalCores: 4,
      logicalCores: 8,
      speed: 0,
      loadAvg: [0.5, 0.4, 0.3],
      usage: 12,
      perCore: [],
      processes: 100,
      contextSwitches: 0,
      interrupts: 0,
      governor: null,
    },
    memory: {
      total: 32 * 1024 ** 3,
      free: 20 * 1024 ** 3,
      available: 22 * 1024 ** 3,
      used: 10 * 1024 ** 3,
      buffers: 0,
      cached: 0,
      active: 0,
      inactive: 0,
      dirty: 0,
      swapTotal: 0,
      swapFree: 0,
      swapUsed: 0,
      hugePagesTotal: 0,
      hugePagesFree: 0,
    },
    disks: [
      { filesystem: '/dev/sda1', type: 'ext4', size: 100 * 1024 ** 3, used: 40 * 1024 ** 3, available: 60 * 1024 ** 3, capacity: 40, mount: '/' },
    ],
    gpu: { available: false, gpus: [], processes: [] },
    docker: { available: false, containers: [], imageCount: 0, stats: [] },
    git: { available: true, branch: 'main', head: null, lastCommit: null, modified: 0, staged: 0, untracked: 0, conflicts: 0, ahead: null, behind: null, dirty: false },
    versions: { node: 'v22.0.0', pnpm: '10.0.0' },
    temperature: [],
    processes: { total: 100, threads: 200 },
    workspace: { name: 'test', path: '/repo', status: 'ready', files: 1, packages: 1, dependencies: 0, language: 'ts', framework: null, isMonorepo: true, workspaceDir: '/repo' },
    health: [],
    readiness: 100,
    alerts: [],
    ...overrides,
  };
}

function renderOverview() {
  return render(
    <ThemeProvider>
      <SystemOverview runtime={runtime} />
    </ThemeProvider>,
  );
}

describe('system overview formatting', () => {
  it('formats memory and uptime without inventing precision', () => {
    expect(formatGib(32 * 1024 ** 3)).toBe('32.0 GiB');
    expect(formatGib(Number.NaN)).toBe('Unknown');
    expect(formatUptime(90061)).toBe('1d 1h 1m');
    expect(formatUptime(125)).toBe('2m');
    expect(formatUptime(-1)).toBe('Unknown');
  });
});

describe('system overview sections', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSummary.mockReset();
  });

  it('renders host, hardware, environment and runtime facts from authorities', async () => {
    mockSummary.mockResolvedValue(summaryFixture());
    renderOverview();
    expect(await screen.findByText('vestara-host')).toBeTruthy();
    expect(await screen.findByText('Test CPU Model')).toBeTruthy();
    expect(await screen.findByText('10.0 GiB used of 32.0 GiB')).toBeTruthy();
    expect(await screen.findByText('v22.0.0')).toBeTruthy();
    expect(await screen.findByText('10.0.0.1')).toBeTruthy();
    // Host uptime is machine uptime, labelled as such.
    expect(await screen.findByText('Host uptime')).toBeTruthy();
    expect(await screen.findByText('1d 1h 1m')).toBeTruthy();
  });

  it('keeps unknown values as plain text and distinguishes process uptime', async () => {
    mockSummary.mockResolvedValue(
      summaryFixture({ versions: { node: null, pnpm: null }, network: { interfaces: [], gateway: null } }),
    );
    const { container } = renderOverview();
    expect(await screen.findByText('API process uptime')).toBeTruthy();
    const unknowns = await screen.findAllByText('Unknown');
    // Unknown rows exist (node, pnpm, gateway, process uptime) and none of
    // them is a status pill (pills carry an aria-label "Current status: …").
    expect(unknowns.length).toBeGreaterThanOrEqual(4);
    for (const node of unknowns) {
      expect(node.hasAttribute('aria-label')).toBe(false);
      expect(container.contains(node)).toBe(true);
    }
  });

  it('shows the host-unavailable state with retry while keeping runtime state', async () => {
    mockSummary.mockResolvedValue(null);
    renderOverview();
    expect(await screen.findByText('Host information unavailable')).toBeTruthy();
    // Runtime section still renders from the Settings authority.
    expect(screen.getByText('API Runtime')).toBeTruthy();
    mockSummary.mockResolvedValue(summaryFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('vestara-host')).toBeTruthy();
  });
});

describe('system route', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSummary.mockReset();
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
  });

  it('serves /settings/system directly with the navigation active', async () => {
    mockSummary.mockResolvedValue(summaryFixture());
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/settings/system']}>
          <Routes>
            <Route path="/settings/*" element={<SettingsPage />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'System Overview' })).toBeTruthy();
    expect(await screen.findByText('vestara-host')).toBeTruthy();
    const systemLink = screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('href') === '/settings/system');
    expect(systemLink?.getAttribute('aria-current')).toBe('page');
  });
});
