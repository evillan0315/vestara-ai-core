import { describe, expect, it } from 'vitest';
import { normalizeAgents, normalizeCommands, normalizeProviders } from '../src/discovery-normalizers.js';

describe('opencode discovery normalizers', () => {
  it('normalizes providers and counts models without leaking env keys', () => {
    const raw = {
      all: [
        {
          id: 'opencode',
          name: 'OpenCode',
          source: 'builtin',
          env: ['OPENCODE_API_KEY'],
          models: { 'model-a': {}, 'model-b': {} },
        },
        { id: 'empty', models: {} },
      ],
    };
    const providers = normalizeProviders(raw);
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({
      id: 'opencode',
      name: 'OpenCode',
      source: 'builtin',
      modelCount: 2,
      models: ['model-a', 'model-b'],
    });
    expect(providers[1]).toMatchObject({ id: 'empty', modelCount: 0, models: [] });
    expect(JSON.stringify(providers)).not.toContain('OPENCODE_API_KEY');
  });

  it('handles non-object provider responses', () => {
    expect(normalizeProviders(undefined)).toEqual([]);
    expect(normalizeProviders('nope')).toEqual([]);
  });

  it('normalizes agents', () => {
    const agents = normalizeAgents([
      { name: 'build', description: 'Default agent', mode: 'primary', native: true },
      { name: 'architect' },
    ]);
    expect(agents).toEqual([
      { name: 'build', description: 'Default agent', mode: 'primary', native: true },
      { name: 'architect', description: undefined, mode: undefined, native: undefined },
    ]);
  });

  it('normalizes commands', () => {
    const commands = normalizeCommands([{ name: 'init', description: 'Setup', source: 'command' }]);
    expect(commands).toEqual([{ name: 'init', description: 'Setup', source: 'command' }]);
    expect(normalizeCommands('nope')).toEqual([]);
  });
});
