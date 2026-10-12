/**
 * VOS-STARTUP-001 P1: Startup Fixture Dataset
 *
 * Mirrors assets/vestara-desktop-02-screen.png regions (1672x941 baseline).
 * Used as fallback while the systemd/API readiness gate (P2) is pending.
 * Never inline this data in JSX — import the fixture.
 */

import type { StartupViewModel } from './startup.types';

export const startupFixture: StartupViewModel = {
  entry: 'login',
  state: 'loading',
  headline: 'Starting Vestara OS...',
  subline: 'Initializing services, agents and workspace',
  checklist: [
    { id: 'core', label: 'Core system', status: 'complete' },
    { id: 'agents', label: 'Agent services', status: 'complete' },
    { id: 'workspace', label: 'Workspace environment', status: 'complete' },
    { id: 'profile', label: 'Loading user profile...', status: 'pending' },
    { id: 'desktop', label: 'Preparing desktop...', status: 'pending' },
    { id: 'almost', label: 'Almost ready...', status: 'pending' },
  ],
  quote: 'A more capable tomorrow, together.',
  quoteBy: 'VESTARA',
  diagnosticsCode: null,
  recoveryAction: null,
};

export const startupReadyFixture: StartupViewModel = {
  ...startupFixture,
  state: 'ready',
  headline: 'Vestara OS is ready',
  subline: 'Workspace is prepared for people and agents',
  checklist: startupFixture.checklist.map((row) => ({ ...row, status: 'complete' as const })),
};

export const startupCelebrationFixture: StartupViewModel = {
  ...startupReadyFixture,
  entry: 'onboarding',
  state: 'ready-celebration',
  headline: 'Welcome to Vestara OS',
  subline: 'Onboarding complete — opening your workspace',
};

export const startupDegradedFixture: StartupViewModel = {
  ...startupFixture,
  state: 'degraded',
  headline: 'Startup needs attention',
  subline: 'Some services are unavailable — diagnostics below',
  checklist: [
    { id: 'core', label: 'Core system', status: 'complete' },
    { id: 'agents', label: 'Agent services', status: 'failed' },
    { id: 'workspace', label: 'Workspace environment', status: 'pending' },
    { id: 'profile', label: 'Loading user profile...', status: 'pending' },
    { id: 'desktop', label: 'Preparing desktop...', status: 'pending' },
    { id: 'almost', label: 'Almost ready...', status: 'pending' },
  ],
  diagnosticsCode: 'VOS-STARTUP-DEGRADED',
  recoveryAction: 'Retry startup or open recovery diagnostics',
};
