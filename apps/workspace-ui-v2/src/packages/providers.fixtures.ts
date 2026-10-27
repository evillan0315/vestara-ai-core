// Providers fixture — offline fallback for the Providers settings card.
// Pattern: apps/workspace/src/features/overview/overview.fixtures.ts.

import type { LiveProvider, RoutingSelection } from '../lib/providers';

export const PROVIDERS_FIXTURE: LiveProvider[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    enabled: true,
    status: 'available',
    models: [{ id: 'glm-4', name: 'GLM 4', enabled: true }],
  },
];

export const ROUTING_SELECTION_FIXTURE: RoutingSelection = {
  revision: 0,
  updatedByClientId: 'fixture',
  selection: {
    profileId: 'balanced',
    roles: {},
  },
};

export const PROVIDERS_HELP =
  'Live provider + model routing per agent role. Reads are public; saving a role assignment needs an editor sign-in.';

export const PROVIDERS_OFFLINE_NOTE = 'API unreachable — showing fixture providers. Sign in to manage routing.';

export const PROVIDERS_UNAUTHORIZED_NOTE = 'Sign in with an editor account to change role assignments.';
