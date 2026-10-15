/**
 * WorkspaceLayout preview fixtures — local mock data for the Settings live
 * preview and Storybook-style composition checks.
 *
 * Governance: API first → mock server (:3002) → local fixtures. Never inline
 * arrays in JSX — preview components import from here. Icons stay canonical
 * WorkspaceNavIcon keys rendered via navIcon() (no new icon system).
 */

import type { WorkspaceNavIcon } from '../workspace-navigation.js';

export interface PreviewNavItem {
  id: string;
  label: string;
  icon: WorkspaceNavIcon;
  count: number;
}

export interface PreviewMarketplaceCard {
  title: string;
  description: string;
  icon: WorkspaceNavIcon;
  tags: string[];
  version: string;
}

export interface PreviewActivityItem {
  title: string;
  detail: string;
}

export interface PreviewFileNode {
  name: string;
  type: 'folder' | 'file';
  children?: PreviewFileNode[];
}

export const PREVIEW_NAV_ITEMS: PreviewNavItem[] = [
  { id: 'discover', label: 'Discover', icon: 'dashboard', count: 24 },
  { id: 'categories', label: 'Categories', icon: 'projects', count: 8 },
  { id: 'capabilities', label: 'Capabilities', icon: 'tools', count: 142 },
  { id: 'installed', label: 'Installed', icon: 'artifacts', count: 12 },
  { id: 'sessions', label: 'Sessions', icon: 'sessions', count: 3 },
];

export const PREVIEW_MARKETPLACE_CARDS: PreviewMarketplaceCard[] = [
  {
    title: 'Filesystem Tools',
    description: 'Read, write, and manage project files with scoped access.',
    icon: 'files',
    tags: ['files', 'io'],
    version: 'v2.1.0',
  },
  {
    title: 'Terminal Runner',
    description: 'Execute shell commands and scripts securely.',
    icon: 'terminal',
    tags: ['exec', 'shell'],
    version: 'v2.1.0',
  },
  {
    title: 'Memory Store',
    description: 'Persist context across sessions with vector search.',
    icon: 'agents',
    tags: ['memory', 'rag'],
    version: 'v2.1.0',
  },
  {
    title: 'Browser Agent',
    description: 'Control headless browser for testing and scraping.',
    icon: 'dashboard',
    tags: ['browser', 'automation'],
    version: 'v2.1.0',
  },
];

export const PREVIEW_CAPABILITIES: PreviewMarketplaceCard[] = [
  {
    title: 'Filesystem',
    description: 'Capability',
    icon: 'files',
    tags: ['capability'],
    version: 'v2.1.0',
  },
  {
    title: 'Terminal',
    description: 'Capability',
    icon: 'terminal',
    tags: ['capability'],
    version: 'v2.1.0',
  },
  {
    title: 'Browser',
    description: 'Capability',
    icon: 'dashboard',
    tags: ['capability'],
    version: 'v2.1.0',
  },
  {
    title: 'Memory',
    description: 'Capability',
    icon: 'agents',
    tags: ['capability'],
    version: 'v2.1.0',
  },
];

export const PREVIEW_ACTIVITY_ITEMS: PreviewActivityItem[] = [
  { title: 'Config updated', detail: '2m ago' },
  { title: 'Nav style changed', detail: '5m ago' },
  { title: 'Panel resized', detail: '12m ago' },
];

export const PREVIEW_FILE_TREE: PreviewFileNode[] = [
  {
    name: 'vestara',
    type: 'folder',
    children: [
      {
        name: 'src',
        type: 'folder',
        children: [
          {
            name: 'layout',
            type: 'folder',
            children: [{ name: 'WorkspaceLayout.tsx', type: 'file' }],
          },
          {
            name: 'components',
            type: 'folder',
            children: [
              { name: 'Button.tsx', type: 'file' },
              { name: 'Card.tsx', type: 'file' },
              { name: 'Toggle.tsx', type: 'file' },
            ],
          },
          { name: 'App.tsx', type: 'file' },
        ],
      },
      { name: 'package.json', type: 'file' },
      { name: 'tailwind.config.js', type: 'file' },
    ],
  },
];
