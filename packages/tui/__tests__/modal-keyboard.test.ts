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

describe('modal keyboard routing', () => {
  it('handles arrow keys at modal priority before view navigation', () => {
    let selected = 0;
    const viewTabs: string[] = [];
    const handlers = handlersFor({
      modal: [
        (e) => {
          if (e.name === 'down') {
            selected += 1;
            return 'handled';
          }
          return 'unhandled';
        },
      ],
      view: [
        (e) => {
          viewTabs.push(e.name);
          return 'handled';
        },
      ],
    });
    dispatchKey(handlers, key('down'));
    expect(selected).toBe(1);
    expect(viewTabs).toEqual([]);
  });

  it('lets escape close the modal at modal priority', () => {
    let closed = false;
    const handlers = handlersFor({
      modal: [
        (e) => {
          if (e.name === 'escape') {
            closed = true;
            return 'handled';
          }
          return 'unhandled';
        },
      ],
    });
    expect(dispatchKey(handlers, key('escape'))).toBe(true);
    expect(closed).toBe(true);
  });

  it('routes enter to the modal before the composer submits', () => {
    let modalEnter = false;
    let composerSubmit = false;
    const handlers = handlersFor({
      modal: [
        (e) => {
          if (e.name === 'enter') {
            modalEnter = true;
            return 'handled';
          }
          return 'unhandled';
        },
      ],
      input: [
        () => {
          composerSubmit = true;
          return 'handled';
        },
      ],
    });
    dispatchKey(handlers, key('enter'));
    expect(modalEnter).toBe(true);
    expect(composerSubmit).toBe(false);
  });

  it('allows printable text to reach the composer when the modal does not consume it', () => {
    const typed: string[] = [];
    const handlers = handlersFor({
      modal: [() => 'unhandled'],
      input: [
        (e) => {
          typed.push(e.sequence);
          return 'handled';
        },
      ],
    });
    dispatchKey(handlers, key('a'));
    expect(typed).toEqual(['a']);
  });
});
