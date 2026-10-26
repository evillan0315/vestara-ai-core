import { describe, expect, it } from 'vitest';
import { createEvent } from '../src/factory/createEvent';

describe('events factory contract', () => {
  it('creates an envelope with type, payload, and ids', () => {
    const evt = createEvent('workspace.opened', 1, { ok: true }, 'test-source');
    expect(evt.type).toBe('workspace.opened');
    expect(evt.payload).toEqual({ ok: true });
    expect(typeof evt.id).toBe('string');
    expect(typeof evt.timestamp).toBe('string');
  });
});
