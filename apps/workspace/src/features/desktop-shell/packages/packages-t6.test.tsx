/**
 * VES-UI-001 T6: Package Pages (Terminal / Settings / Diagnostic / Files)
 *
 * Locks the T6 acceptance boundary:
 * - Terminal renders a live session surface with snapshot fallback.
 * - Settings binds the category rail to live server config + theme controls.
 * - Diagnostic renders seeded deterministic telemetry (no `Math.random`).
 * - Files renders the governed `features/files/` projection.
 *
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageContent } from './index.js';
import {
  DIAGNOSTIC_PACKAGE_BAR_COUNT,
  DIAGNOSTIC_PACKAGE_SEED,
  diagnosticPackageFixture,
  settingsPackageFixture,
  terminalPackageFixture,
} from './packages.fixtures.js';
import { seededTelemetryBars } from './useDiagnosticPackage.js';

afterEach(() => {
  cleanup();
});

vi.mock('../../overview/hooks/useOverview', () => ({
  useOverview: () => ({ data: null, isLoading: false, error: null, refetch: async () => {} }),
}));

vi.mock('../../../hooks/useM11CActivityRoom', () => ({
  useM11CActivityRoom: () => ({ participants: [], stream: [], state: 'offline' }),
}));

vi.mock('../../../lib/api', () => ({
  getAgents: async () => [],
}));

vi.mock('../../../lib/marketplace', () => ({
  marketplaceClient: {
    search: async () => ({ items: [] }),
    installed: async () => [],
  },
}));

vi.mock('../../../lib/theme', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/theme')>();
  return {
    ...actual,
    useTheme: () => ({
      mode: 'dark',
      resolved: 'dark',
      settings: { ...actual.DEFAULT_SETTINGS, colorTheme: 'shell' },
      activeProfile: 'default',
      setMode: vi.fn(),
      toggle: vi.fn(),
      applyProfile: vi.fn(),
      resetSettings: vi.fn(),
      updateSetting: vi.fn(),
    }),
  };
});

describe('t6 terminal package', () => {
  it('ships a version-free snapshot transcript', () => {
    expect(terminalPackageFixture.transcript.length).toBeGreaterThan(0);
    expect(terminalPackageFixture.sessions.length).toBeGreaterThan(0);
    expect(JSON.stringify(terminalPackageFixture)).not.toMatch(/v?\d+\.\d+\.\d+/);
  });

  it('renders the live surface with snapshot fallback', async () => {
    render(<PackageContent type="terminal" />);
    expect(screen.getByText(/TERMINAL · SHELL SESSIONS/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /new session/i })).toBeTruthy();
    expect(screen.getByLabelText(/terminal input/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/vestara shell/)).toBeTruthy();
    });
    expect(screen.getByText('SNAPSHOT')).toBeTruthy();
  });
});

describe('t6 settings package', () => {
  it('ships the prototype category rail', () => {
    const labels = settingsPackageFixture.categories.map((entry) => entry.label);
    expect(labels).toContain('Shell & TopBar');
    expect(labels).toContain('Appearance');
  });

  it('binds server config to live theme controls', async () => {
    render(<PackageContent type="settings" />);
    // Appearance lands first; the rail filters panels per category.
    expect(screen.getByText('APPEARANCE · LIVE THEME')).toBeTruthy();
    expect(screen.getByText('Shell & TopBar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Shell & TopBar' }));
    expect(screen.getByText('SERVER CONFIG')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/vestara-platform/)).toBeTruthy();
    });
  });
});

describe('t6 diagnostic package', () => {
  it('derives deterministic bars from the seed', () => {
    const first = seededTelemetryBars(DIAGNOSTIC_PACKAGE_SEED, DIAGNOSTIC_PACKAGE_BAR_COUNT);
    const second = seededTelemetryBars(DIAGNOSTIC_PACKAGE_SEED, DIAGNOSTIC_PACKAGE_BAR_COUNT);
    expect(first).toHaveLength(DIAGNOSTIC_PACKAGE_BAR_COUNT);
    expect(first).toEqual(second);
    for (const height of first) {
      expect(height).toBeGreaterThanOrEqual(8);
      expect(height).toBeLessThanOrEqual(98);
    }
    expect(diagnosticPackageFixture.summary.checks.length).toBeGreaterThan(0);
  });

  it('renders telemetry stats, bars, and checks', async () => {
    const { container } = render(<PackageContent type="diagnostic" />);
    expect(screen.getByText(/LIVE TELEMETRY/)).toBeTruthy();
    expect(screen.getByText('CPU')).toBeTruthy();
    // Bars render as the only flex-1 children of the telemetry figure.
    const figure = screen.getByRole('img', { name: /deterministic telemetry/i });
    expect(figure.children).toHaveLength(DIAGNOSTIC_PACKAGE_BAR_COUNT);
    expect(container.textContent).toMatch(/API gateway/);
    await waitFor(() => {
      expect(screen.getByText('SNAPSHOT')).toBeTruthy();
    });
  });
});

describe('t6 files package', () => {
  it('renders the governed files projection', async () => {
    render(<PackageContent type="files" />);
    expect(screen.getByText(/FILES ·/)).toBeTruthy();
    expect(screen.getByLabelText(/filter files/i)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('STORAGE ·', { exact: false })).toBeTruthy();
    });
    expect(screen.getByText('RECENT')).toBeTruthy();
  });
});
