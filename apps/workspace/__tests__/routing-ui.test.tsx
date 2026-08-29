import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoutingPage from '../src/pages/Routing.js';

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  selection: vi.fn(),
  assignments: vi.fn(),
  getAgents: vi.fn(),
}));

vi.mock('../src/lib/api.js', () => ({ getAgents: mocks.getAgents }));
vi.mock('../src/lib/routing.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/lib/routing.js')>();
  return {
    ...original,
    routingClient: {
      ...original.routingClient,
      catalog: mocks.catalog,
      selection: mocks.selection,
      assignments: mocks.assignments,
    },
  };
});

beforeEach(() => {
  mocks.catalog.mockResolvedValue({
    profiles: [
      {
        id: 'balanced',
        name: 'Balanced',
        description: 'Balances capability, latency, and cost.',
        policy: {
          mode: 'balanced',
          constraints: {
            locality: 'allow-cloud',
            dataPolicy: 'source-allowed',
            costPolicy: 'unrestricted',
            requireIndependentVerifier: false,
          },
        },
      },
    ],
    candidates: [
      {
        ref: { providerId: 'opencode', modelId: 'model-x' },
        providerName: 'OpenCode',
        locality: 'cloud',
        capabilities: ['implementation'],
        availability: {
          installed: true,
          authenticated: true,
          reachable: true,
          available: true,
          allowed: true,
          busy: false,
          state: 'healthy',
        },
      },
    ],
  });
  mocks.selection.mockResolvedValue({
    revision: 3,
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedByClientId: 'console',
    selection: { profileId: 'balanced', roles: {} },
  });
  mocks.assignments.mockResolvedValue([
    {
      taskId: 'TASK-1',
      revision: 2,
      role: 'developer',
      agentId: 'developer-01',
      route: { providerId: 'opencode', modelId: 'model-x' },
      status: 'running',
      sideEffectsRecorded: true,
      updatedAt: '2026-08-01T00:00:00.000Z',
    },
  ]);
  mocks.getAgents.mockResolvedValue([
    { id: 'developer-01', name: 'Developer 01', role: 'developer', status: 'active', capabilities: [] },
  ]);
});

describe('RoutingPage', () => {
  it('renders shared profiles, availability dimensions, and governed assignments', async () => {
    render(<RoutingPage />);

    expect(await screen.findByRole('heading', { name: 'Engineering Routing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Balanced/ })).toBeTruthy();
    expect(screen.getByText('Provider suitability')).toBeTruthy();
    expect(screen.getByText('TASK-1')).toBeTruthy();
    expect(screen.getByText(/r2 · running · side effects/)).toBeTruthy();
    await waitFor(() => expect(mocks.catalog).toHaveBeenCalledOnce());
  });
});
