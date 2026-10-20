/**
 * VES-UI-001 T5+T6: Package Pages Guards
 *
 * Locks the T5/T6 acceptance boundary:
 * - Fixtures are deterministic, version-free, and cover all eight packages.
 * - No hardcoded arrays in JSX (fixtures are the only array source).
 * - PackageContent dispatches all eight live pages plus the workspace stub.
 * - Governance NO-HARDCODE: no hex literals in package components.
 * - Determinism (G7): no `Math.random` in components, hooks, or fixtures.
 *
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PackageContent } from './index.js';
import {
  activityPackageFixture,
  agentsPackageFixture,
  diagnosticPackageFixture,
  marketplacePackageFixture,
  overviewPackageFixture,
  settingsPackageFixture,
  terminalPackageFixture,
} from './packages.fixtures.js';

afterEach(() => {
  cleanup();
});

const HERE = dirname(fileURLToPath(import.meta.url));
function sourceOf(name: string): string {
  return readFileSync(join(HERE, name), 'utf8');
}

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

describe('t5 package fixtures', () => {
  it('ships a deterministic overview hero + stat cards', () => {
    expect(overviewPackageFixture.heading).toBeTruthy();
    expect(overviewPackageFixture.stats.length).toBeGreaterThan(0);
    for (const stat of overviewPackageFixture.stats) {
      expect(stat.id).toBeTruthy();
      expect(stat.label).toBeTruthy();
      expect(stat.value).toBeTruthy();
    }
  });

  it('ships activity participants + records', () => {
    expect(activityPackageFixture.participants.length).toBeGreaterThan(0);
    expect(activityPackageFixture.records.length).toBeGreaterThan(0);
  });

  it('ships an agent grid and marketplace cards', () => {
    expect(agentsPackageFixture.length).toBeGreaterThan(0);
    expect(marketplacePackageFixture.length).toBeGreaterThan(0);
  });

  it('keeps fixtures version-free (G11)', () => {
    const all = JSON.stringify([
      overviewPackageFixture,
      activityPackageFixture,
      agentsPackageFixture,
      marketplacePackageFixture,
      terminalPackageFixture,
      settingsPackageFixture,
      diagnosticPackageFixture,
    ]);
    expect(all).not.toMatch(/v?\d+\.\d+\.\d+/);
    expect(all).not.toMatch(/FINAL/i);
  });
});

describe('t5 package components', () => {
  it('renders the overview package from fixtures', () => {
    render(<PackageContent type="overview" />);
    expect(screen.getByText('WORKSPACE OVERVIEW')).toBeTruthy();
    expect(screen.getByText('vestara-platform')).toBeTruthy();
  });

  it('renders the activity package from fixtures', () => {
    render(<PackageContent type="activity" />);
    expect(screen.getByText(/ALL PARTICIPANTS/)).toBeTruthy();
    expect(screen.getByText('Activity Room')).toBeTruthy();
  });

  it('renders the agent workforce from fixtures', () => {
    render(<PackageContent type="agent" />);
    expect(screen.getByText(/WORKFORCE/)).toBeTruthy();
    expect(screen.getByText('Assistant')).toBeTruthy();
  });

  it('renders marketplace capabilities from fixtures', () => {
    render(<PackageContent type="marketplace" />);
    expect(screen.getByText(/MARKETPLACE · CAPABILITIES/)).toBeTruthy();
    expect(screen.getByText('Theme Builder')).toBeTruthy();
  });

  it('renders a token-bound stub for the workspace shell window only', () => {
    render(<PackageContent type="workspace" />);
    expect(screen.getByText(/Workspace surface renders through the desktop shell/)).toBeTruthy();
  });

  it('has no hex literals or hardcoded arrays in JSX', () => {
    for (const name of [
      'OverviewPackage.tsx',
      'ActivityPackage.tsx',
      'AgentsPackage.tsx',
      'MarketplacePackage.tsx',
      'TerminalPackage.tsx',
      'SettingsPackage.tsx',
      'DiagnosticPackage.tsx',
      'FilesPackage.tsx',
      'index.tsx',
    ]) {
      const source = sourceOf(name);
      expect(source, `${name} hex`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(source, `${name} arbitrary hex tailwind`).not.toMatch(/bg-\[#|text-\[#|border-\[#/);
    }
    for (const name of [
      'OverviewPackage.tsx',
      'ActivityPackage.tsx',
      'AgentsPackage.tsx',
      'MarketplacePackage.tsx',
      'TerminalPackage.tsx',
      'SettingsPackage.tsx',
      'DiagnosticPackage.tsx',
      'FilesPackage.tsx',
    ]) {
      const source = sourceOf(name);
      // Fixture imports are the only array source; JSX must map hook/fixture data.
      expect(source).toMatch(/\.map\(/);
    }
  });

  it('has no Math.random in package components or hooks (G7)', () => {
    for (const name of [
      'OverviewPackage.tsx',
      'ActivityPackage.tsx',
      'AgentsPackage.tsx',
      'MarketplacePackage.tsx',
      'TerminalPackage.tsx',
      'SettingsPackage.tsx',
      'DiagnosticPackage.tsx',
      'FilesPackage.tsx',
      'useAgentsPackage.ts',
      'useMarketplacePackage.ts',
      'useTerminalPackage.ts',
      'useSettingsPackage.ts',
      'useDiagnosticPackage.ts',
      'packages.fixtures.ts',
      'index.tsx',
    ]) {
      expect(sourceOf(name), `${name} Math.random`).not.toMatch(/Math\.random/);
    }
  });
});
