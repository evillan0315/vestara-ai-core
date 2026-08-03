import { TUI_NAVIGATION } from '@vestara/design-system';
import { InMemoryCommandRegistry } from '@vestara/tui-renderer/contract';
import { describe, expect, it } from 'vitest';
import { splitArguments } from '../src/controller.js';

describe('TUI shell — navigation definitions', () => {
  it('defines a stable navigation order', () => {
    const ids = TUI_NAVIGATION.map((item) => item.id);
    expect(ids[0]).toBe('chat');
    expect(ids).toContain('sessions');
    expect(ids).toContain('plans');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('navigation keys are unique', () => {
    const keys = TUI_NAVIGATION.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('TUI shell — command registry', () => {
  it('registers and dispatches shell commands', () => {
    const registry = new InMemoryCommandRegistry();
    let opened = false;
    registry.register({ name: 'palette.open', title: 'Open palette', category: 'Shell', run: () => (opened = true) });
    expect(registry.dispatch('palette.open')).toBe(true);
    expect(opened).toBe(true);
  });
});

describe('TUI shell — input parsing', () => {
  it('parses slash commands and quoted args', () => {
    expect(splitArguments('/status')).toEqual(['/status']);
    expect(splitArguments('/routing select "dev-agent" "developer" "opencode" "model-x"')).toEqual([
      '/routing',
      'select',
      'dev-agent',
      'developer',
      'opencode',
      'model-x',
    ]);
  });
});
