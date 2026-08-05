import { describe, expect, it } from 'vitest';
import { buildRuntimeConfigViewModel } from '../src/state/runtime-config-model.js';
import type { RoutingSelection } from '../src/types.js';

const ROUTING: RoutingSelection = {
  revision: 1,
  profileId: 'engineering',
  roles: { developer: { providerId: 'opencode', modelId: 'deepseek-v4-flash-free' } },
  agents: [],
  candidates: [
    {
      ref: { providerId: 'opencode', modelId: 'deepseek-v4-flash-free' },
      providerName: 'opencode',
      locality: 'local',
      availability: { available: true, state: 'available' },
    },
    {
      ref: { providerId: 'opencode', modelId: 'gpt-5.6-luna' },
      providerName: 'opencode',
      locality: 'cloud',
      availability: { available: false, state: 'unavailable' },
    },
    {
      ref: { providerId: 'opencode-go', modelId: 'north-mini-code-free' },
      providerName: 'opencode-go',
      locality: 'local',
      availability: { available: true, state: 'available' },
    },
  ],
  providers: { opencode: { configured: true, source: 'stored' } },
};

describe('runtime configuration view model', () => {
  it('derives providers from the routing catalog', () => {
    const viewModel = buildRuntimeConfigViewModel(ROUTING);
    expect(viewModel.providers.map((provider) => provider.providerId)).toEqual(['opencode', 'opencode-go']);
    expect(viewModel.providers[0]?.providerName).toBe('opencode');
  });

  it('groups models by provider with availability', () => {
    const viewModel = buildRuntimeConfigViewModel(ROUTING);
    expect(viewModel.modelsByProvider.opencode).toEqual([
      { modelId: 'deepseek-v4-flash-free', available: true },
      { modelId: 'gpt-5.6-luna', available: false },
    ]);
    expect(viewModel.modelsByProvider['opencode-go']).toEqual([{ modelId: 'north-mini-code-free', available: true }]);
  });

  it('maps configured provider credential state', () => {
    const viewModel = buildRuntimeConfigViewModel(ROUTING);
    expect(viewModel.configuredProviders.opencode).toBe(true);
    expect(viewModel.configuredProviders['opencode-go']).toBeUndefined();
  });

  it('handles an absent routing selection', () => {
    const viewModel = buildRuntimeConfigViewModel(undefined);
    expect(viewModel.providers).toEqual([]);
    expect(viewModel.modelsByProvider).toEqual({});
    expect(viewModel.configuredProviders).toEqual({});
  });
});
