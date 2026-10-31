/**
 * React binding for the framework-free `AssistantTurn` store.
 *
 * Thin `useState`/`useReducer` wrapper: the store owns all projection
 * logic (op-id keying, FIFO completion, rehydration); this hook only
 * re-renders on mutation. Stage-3 rewire composes this into
 * `useAssistantConversation` (conversation list/selection/reattach stay in
 * the app until then).
 */

import { useMemo, useReducer, useState } from 'react';
import { AssistantTurn, type TurnTerminal } from './store.js';
import type { ConversationMessage } from './transport.js';

export interface AssistantTurnBinding {
  readonly turn: AssistantTurn;
  onDelta: (text: string) => void;
  onToolStart: (name: string, operationId?: string) => void;
  onToolResult: (name: string, content: string, execution?: Parameters<AssistantTurn['onToolResult']>[2]) => void;
  onExecution: (value: unknown) => void;
  finalize: (terminal: TurnTerminal) => void;
  reset: () => void;
  rehydrateFromMessages: (messages: readonly ConversationMessage[]) => void;
}

export function useAssistantTurn(): AssistantTurnBinding {
  const [turn] = useState(() => new AssistantTurn());
  const [, bump] = useReducer((version: number) => version + 1, 0);
  return useMemo(
    () => ({
      turn,
      onDelta: (text: string) => {
        turn.onDelta(text);
        bump();
      },
      onToolStart: (name: string, operationId?: string) => {
        turn.onToolStart(name, operationId);
        bump();
      },
      onToolResult: (name: string, content: string, execution?: Parameters<AssistantTurn['onToolResult']>[2]) => {
        turn.onToolResult(name, content, execution);
        bump();
      },
      onExecution: (value: unknown) => {
        turn.onExecution(value);
        bump();
      },
      finalize: (terminal: TurnTerminal) => {
        turn.finalize(terminal);
        bump();
      },
      reset: () => {
        turn.reset();
        bump();
      },
      rehydrateFromMessages: (messages: readonly ConversationMessage[]) => {
        turn.rehydrateFromMessages(messages);
        bump();
      },
    }),
    [turn],
  );
}
