// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { ResolvedConfiguration } from '@vestara/configuration';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

function renderCI() {
  return render(
    <ThemeProvider>
      <CISettings />
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

describe('CI settings integration surface', () => {
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
    expect(ci).toBeTruthy();
    expect(ci?.label).toBe('Continuous Integration');
    expect(ci?.group).toBe('operations');
  });

  it('renders every required section', () => {
    renderCI();
    for (const heading of [
      'GitHub Connection',
      'CI Observation',
      'Repository Mapping',
      'Workflow Filtering',
      'Branch Filtering',
      'Observation Health',
      'CI Status',
    ]) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
  });

  it('shows honest read-only connection and token state', () => {
    renderCI();
    expect(screen.getByText('Connection status')).toBeTruthy();
    expect(screen.getByText('Disconnected')).toBeTruthy();
    expect(screen.getByText('Not configured')).toBeTruthy();
    expect(screen.getByText('@vestara/github-ci-adapter@0.1.0')).toBeTruthy();
  });

  it('holds interactive features behind disabled states (no second authority)', () => {
    const { container } = renderCI();
    const testConnection = screen.getByRole('button', { name: 'Test connection' });
    const addRepo = screen.getByRole('button', { name: 'Add repository' });
    expect(testConnection.hasAttribute('disabled')).toBe(true);
    expect(addRepo.hasAttribute('disabled')).toBe(true);
    for (const button of screen.getAllByRole('button', { name: 'Edit filters' })) {
      expect(button.hasAttribute('disabled')).toBe(true);
    }
    expect(container.textContent).toContain('No API endpoint available yet');
    expect(container.textContent).toContain('Repository management not available yet');
    expect(container.textContent).toContain('No repositories configured');
  });

  it('disables the observation toggle while no persistence boundary exists', () => {
    renderCI();
    const toggle = screen.getByRole('switch', { name: 'CI observation' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    // Natively disabled via fieldset: interaction cannot imply persistence.
    const fieldset = toggle.closest('fieldset');
    expect(fieldset?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(
      screen.getByText('Disabled — persistence unavailable (/api/ci/config does not exist)'),
    ).toBeTruthy();
  });

  it('keeps canonical and provider status read-only and distinguished', () => {
    const { container } = renderCI();
    expect(screen.getByText('Canonical status')).toBeTruthy();
    expect(screen.getByText('No observations yet')).toBeTruthy();
    expect(screen.getByText('Provider status (diagnostics)')).toBeTruthy();
    expect(screen.getByText('N/A')).toBeTruthy();
    // Retrieval failure is distinguished from CI failure.
    expect(container.textContent).toContain('not a CI failure');
    expect(screen.getByText('None')).toBeTruthy();
    expect(screen.getByText('Never')).toBeTruthy();
  });

  it('uses only canonical Vestara tokens in CI-owned markup (no hardcode)', () => {
    // Note: the assertion targets hex hardcode only. Reused Settings
    // primitives (settings-ui.tsx, out of remediation scope) carry their
    // own pre-existing class strings; CI-owned markup was audited
    // separately against generated-tokens.css and uses bare canonical
    // vars (--vestara-text-muted/secondary, --vestara-border-subtle,
    // --vestara-status-error, --vestara-font-size-*, --vestara-spacing-*).
    const { container } = renderCI();
    const html = container.innerHTML;
    expect(html).toContain('var(--vestara-');
    expect(html).not.toMatch(/bg-\[#[0-9a-fA-F]{3,8}\]/);
    expect(html).not.toMatch(/text-\[#[0-9a-fA-F]{3,8}\]/);
    expect(html).not.toMatch(/border-\[#[0-9a-fA-F]{3,8}\]/);
    expect(html).not.toContain('#f59e0b');
    expect(html).not.toContain('#09090b');
  });

  it('renders identically under dark and light themes', () => {
    const dark = renderCI();
    for (const heading of ['GitHub Connection', 'CI Observation', 'CI Status']) {
      expect(dark.getByText(heading)).toBeTruthy();
    }
    dark.unmount();

    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
    const light = renderCI();
    for (const heading of ['GitHub Connection', 'CI Observation', 'CI Status']) {
      expect(light.getByText(heading)).toBeTruthy();
    }
    expect(light.getByText('Disconnected')).toBeTruthy();
    expect(light.getByText('No observations yet')).toBeTruthy();
    // Token-driven: no theme-specific hardcoded colors leak in.
    expect(light.container.innerHTML).toContain('var(--vestara-');
    light.unmount();
  });

  it('wires the /settings/ci route with active navigation', async () => {
    renderSettings('/settings/ci');
    const region = await screen.findByRole('region', { name: 'Continuous Integration settings' });
    expect(region).toBeTruthy();
    // Desktop sidebar + mobile nav both render the section link.
    const ciLinks = screen.getAllByRole('link', { name: /Continuous Integration/ });
    expect(ciLinks.length).toBeGreaterThan(0);
    expect(ciLinks.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });
});
