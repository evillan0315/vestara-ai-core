// Pure keyboard dispatch logic, free of any renderer dependency so it can be
// unit-tested under Node. The router hook (which owns the renderer subscription)
// reuses this.

export type KeyboardPriority = 'modal' | 'input' | 'view' | 'global';

export type KeyboardHandler = (key: KeyLike) => 'handled' | 'unhandled';

export interface KeyLike {
  readonly name: string;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly sequence: string;
  readonly eventType: string;
}

export const PRIORITY_ORDER: readonly KeyboardPriority[] = ['modal', 'input', 'view', 'global'];

/** Dispatch a key through priority-ordered handlers. First 'handled' wins. */
export function dispatchKey(
  handlers: ReadonlyMap<KeyboardPriority, ReadonlySet<KeyboardHandler>>,
  key: KeyLike,
): boolean {
  for (const priority of PRIORITY_ORDER) {
    const group = handlers.get(priority);
    if (!group) continue;
    for (const handler of group) {
      if (handler(key) === 'handled') return true;
    }
  }
  return false;
}

export function handled(): 'handled' {
  return 'handled';
}

export function unhandled(): 'unhandled' {
  return 'unhandled';
}
