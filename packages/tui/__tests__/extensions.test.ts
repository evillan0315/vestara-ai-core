import { describe, expect, it } from 'vitest';
import { TuiExtensionRegistry } from '../src/extensions.js';

describe('TuiExtensionRegistry', () => {
  it('registers and disposes declarative views', () => {
    const registry = new TuiExtensionRegistry();
    const dispose = registry.registerView({ id: 'acme.security', label: 'Security', command: '/security' });
    expect(registry.listViews()).toEqual([{ id: 'acme.security', label: 'Security', command: '/security' }]);
    dispose();
    expect(registry.listViews()).toEqual([]);
  });

  it('rejects invalid and duplicate identifiers', () => {
    const registry = new TuiExtensionRegistry();
    expect(() => registry.registerView({ id: '../unsafe', label: 'Unsafe' })).toThrow('Invalid');
    registry.registerView({ id: 'acme.safe', label: 'Safe' });
    expect(() => registry.registerView({ id: 'acme.safe', label: 'Again' })).toThrow('already registered');
  });
});
