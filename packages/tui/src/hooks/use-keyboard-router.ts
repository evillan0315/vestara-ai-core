// Centralized keyboard routing for the TUI.
//
// The approved state architecture requires one keyboard path with deterministic
// priority instead of competing handlers. This hook owns the single renderer
// keyboard subscription and dispatches to handlers ordered by priority:
// modal > input > view > global. The first handler that returns 'handled'
// consumes the event.

import { type KeyEvent, useKeyboard } from '@vestara/tui-renderer';
import { useEffect, useRef } from 'react';
import { dispatchKey, type KeyboardHandler, type KeyboardPriority } from './keyboard-priority.js';

export type { KeyboardHandler, KeyboardPriority } from './keyboard-priority.js';
export { handled, unhandled } from './keyboard-priority.js';

export interface KeyboardRouter {
  register(priority: KeyboardPriority, handler: KeyboardHandler): () => void;
}

export function useKeyboardRouter(): KeyboardRouter {
  const handlers = useRef<Map<KeyboardPriority, Set<KeyboardHandler>>>(new Map());

  useKeyboard((key: KeyEvent) => {
    if (key.eventType === 'release') return;
    dispatchKey(handlers.current, key);
  });

  useEffect(() => {
    return () => {
      handlers.current.clear();
    };
  }, []);

  return {
    register(priority: KeyboardPriority, handler: KeyboardHandler): () => void {
      let group = handlers.current.get(priority);
      if (!group) {
        group = new Set();
        handlers.current.set(priority, group);
      }
      group.add(handler);
      return () => {
        group.delete(handler);
        if (group.size === 0) handlers.current.delete(priority);
      };
    },
  };
}
