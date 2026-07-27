/**
 * Settings Constants
 *
 * Architecture Traceability:
 *   Settings Framework: 03-Contracts.md → Core Contracts
 *   Natural Law: Identity precedes responsibility
 */

export const SETTINGS_BASE_PATH = '/settings';

export const SETTINGS_DEFAULT_MODULES = [
  {
    id: 'ai',
    name: 'AI',
    description: 'Configure AI providers, routing, and memory',
    icon: '🤖',
    path: '/settings/ai',
    order: 1,
  },
  {
    id: 'workspace',
    name: 'Workspace',
    description: 'Customize workspace layout and preferences',
    icon: '🎨',
    path: '/settings/workspace',
    order: 2,
  },
  {
    id: 'appearance',
    name: 'Appearance',
    description: 'Theme, colors, and typography',
    icon: '🖌️',
    path: '/settings/appearance',
    order: 3,
  },
  {
    id: 'system',
    name: 'System',
    description: 'Updates, logs, and storage',
    icon: '⚙️',
    path: '/settings/system',
    order: 4,
  },
] as const;
