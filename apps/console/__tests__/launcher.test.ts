import { describe, expect, it } from 'vitest';
import { App, ConsoleController, runConsole } from '../src/index';

describe('@vestara/console compatibility launcher', () => {
  it('re-exports the canonical TUI surface', () => {
    expect(typeof App).toBe('function');
    expect(typeof runConsole).toBe('function');
    expect(typeof ConsoleController).toBe('function');
  });

  it('resolves types from @vestara/tui', async () => {
    const tui = await import('@vestara/tui');
    expect(tui.runTui).toBeDefined();
    expect(tui.App).toBeDefined();
  });
});
