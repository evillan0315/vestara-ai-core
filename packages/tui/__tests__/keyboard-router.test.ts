import { describe, expect, it } from 'vitest';
import { dispatchKey, type KeyboardHandler, type KeyboardPriority } from '../src/hooks/keyboard-priority.js';

interface TestKeyEvent {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly sequence: string;
  readonly eventType: string;
}

function key(name: string, ctrl = false): TestKeyEvent {
  return { name, ctrl, meta: false, shift: false, sequence: name, eventType: 'press' };
}

function handlersFor(
  entries: Partial<Record<KeyboardPriority, KeyboardHandler[]>>,
): Map<KeyboardPriority, Set<KeyboardHandler>> {
  const map = new Map<KeyboardPriority, Set<KeyboardHandler>>();
  for (const [priority, handlers] of Object.entries(entries)) {
    map.set(priority as KeyboardPriority, new Set(handlers));
  }
  return map;
}

describe('keyboard router dispatch', () => {
  it('dispatches to a single handler', () => {
    const handledNames = new Set<string>();
    const handlers = handlersFor({
      view: [
        (e) => {
          handledNames.add(e.name);
          return 'handled';
        },
      ],
    });
    expect(dispatchKey(handlers, key('p', true))).toBe(true);
    expect(handledNames.has('p')).toBe(true);
  });

  it('honors priority order: modal before input before view', () => {
    const calls: string[] = [];
    const handlers = handlersFor({
      input: [
        () => {
          calls.push('input');
          return 'handled';
        },
      ],
      modal: [
        () => {
          calls.push('modal');
          return 'handled';
        },
      ],
      view: [
        () => {
          calls.push('view');
          return 'unhandled';
        },
      ],
    });
    dispatchKey(handlers, key('escape'));
    expect(calls).toEqual(['modal']);
  });

  it('stops at the first handled handler within a group', () => {
    const calls: string[] = [];
    const handlers = handlersFor({
      input: [
        () => {
          calls.push('first');
          return 'handled';
        },
        () => {
          calls.push('second');
          return 'handled';
        },
      ],
    });
    dispatchKey(handlers, key('enter'));
    expect(calls).toEqual(['first']);
  });

  it('returns false when no handler handles the event', () => {
    const handlers = handlersFor({ view: [() => 'unhandled'] });
    expect(dispatchKey(handlers, key('x'))).toBe(false);
  });
});
