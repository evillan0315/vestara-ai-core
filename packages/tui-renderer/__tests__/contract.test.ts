import { describe, expect, it, vi } from 'vitest';
import { InMemoryCommandRegistry, NoopNotificationService } from '../src/contract.js';

describe('tui-renderer contract', () => {
  it('registers and lists commands', () => {
    const registry = new InMemoryCommandRegistry();
    const run = () => {};
    const dispose = registry.register({ name: 'nav.chat', title: 'Chat', category: 'Navigation', run });
    expect(registry.list().map((c) => c.name)).toEqual(['nav.chat']);
    dispose();
    expect(registry.list()).toHaveLength(0);
  });

  it('dispatches a registered command by name', () => {
    const registry = new InMemoryCommandRegistry();
    let called = 0;
    registry.register({ name: 'view.refresh', title: 'Refresh', category: 'View', run: () => called++ });
    expect(registry.dispatch('view.refresh')).toBe(true);
    expect(called).toBe(1);
    expect(registry.dispatch('missing')).toBe(false);
  });

  it('notification service falls back to console without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = new NoopNotificationService();
    service.notify('success', 'done');
    service.notify('error', 'boom');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
