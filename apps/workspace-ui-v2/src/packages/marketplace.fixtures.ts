// Marketplace fixture — asset cards + release badge (offline fallback).
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

import type { LiveMarketplaceAsset } from '../lib/marketplace';

export const MARKETPLACE_FIXTURE: LiveMarketplaceAsset[] = [
  {
    id: 'teal-terminal',
    displayName: 'Teal Terminal',
    summary: 'GPU-styled local shell',
    type: 'terminal',
    version: '2.0.0',
    publisher: 'vestara',
    installed: true,
  },
  {
    id: 'activity-room',
    displayName: 'Activity Room',
    summary: 'Live operations stream',
    type: 'package',
    version: '2.0.0',
    publisher: 'vestara',
    installed: true,
  },
  {
    id: 'agent-workforce',
    displayName: 'Agent Workforce',
    summary: 'Canonical v1 roster grid',
    type: 'package',
    version: '2.0.0',
    publisher: 'vestara',
    installed: true,
  },
  {
    id: 'file-explorer',
    displayName: 'File Explorer',
    summary: 'Workspace file browser',
    type: 'package',
    version: '2.0.0',
    publisher: 'vestara',
    installed: false,
  },
  {
    id: 'diagnostic-center',
    displayName: 'Diagnostic Center',
    summary: 'Health and CI probes',
    type: 'package',
    version: '2.0.0',
    publisher: 'vestara',
    installed: false,
  },
  {
    id: 'settings-sync',
    displayName: 'Settings Sync',
    summary: 'Cross-device preferences',
    type: 'extension',
    version: '1.4.0',
    publisher: 'community',
    installed: false,
  },
];

export const MARKETPLACE_BADGE = '2.0.0';

export const MARKETPLACE_OFFLINE_NOTE = 'API unreachable — showing fixture assets. Sign in to browse the live catalog.';

export const MARKETPLACE_SEARCH_PLACEHOLDER = 'Search capabilities…';
