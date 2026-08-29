import type { TuiSemanticPalette } from '@vestara/design-system';
import { type ReactNode, useEffect } from 'react';
import { useConversation } from '../hooks/conversation-context.js';
import type { KeyboardRouter } from '../hooks/use-keyboard-router.js';
import { useModal } from '../modals/modal-provider.js';

export interface BottomAreaProps {
  readonly palette: TuiSemanticPalette;
  readonly connection: string;
  readonly activeAgent?: string;
  readonly model?: string;
  readonly router: KeyboardRouter;
}

export function BottomArea(props: BottomAreaProps): ReactNode {
  const conversation = useConversation();
  const modal = useModal();

  useEffect(() => {
    return props.router.register('input', (key) => {
      if (modal.modals.length > 0) return 'unhandled';
      // Only the focused composer consumes text keys.
      if (!conversation.composerFocused) return 'unhandled';
      if (key.ctrl && key.name === 'c') return 'unhandled';
      if (key.name === 'tab' || key.name === 'down' || key.name === 'up') return 'unhandled';
      if (key.name === 'return' || key.name === 'enter') {
        void conversation.submit();
        return 'handled';
      }
      if (key.name === 'backspace') {
        conversation.setInput(conversation.input.slice(0, -1));
        return 'handled';
      }
      if (key.name === 'escape' && conversation.busy) {
        conversation.cancel();
        return 'handled';
      }
      if (!key.ctrl && !key.meta && key.sequence) {
        conversation.setInput(`${conversation.input}${key.sequence}`);
        return 'handled';
      }
      return 'unhandled';
    });
  }, [props.router, modal.modals.length, conversation]);
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} backgroundColor={props.palette.background}>
      <box
        height={2}
        flexDirection="row"
        borderStyle="rounded"
        borderColor={conversation.busy ? props.palette.borderActive : props.palette.border}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={props.palette.accent}>›</text>
        <text fg={conversation.input ? props.palette.text : props.palette.textDim} paddingLeft={1}>
          {conversation.input || 'Type your message or / for commands…'}
        </text>
        <box flexGrow={1} />
        <text fg={conversation.busy ? props.palette.warning : props.palette.textDim}>
          {conversation.busy ? 'Esc Cancel' : 'Enter Send'}
        </text>
      </box>
      <box height={1} flexDirection="row" paddingTop={1}>
        <text fg={props.palette.textMuted}>Agent {props.activeAgent ?? '—'}</text>
        <text fg={props.palette.textMuted} paddingLeft={2}>
          Model {props.model ?? '—'}
        </text>
        <text fg={props.palette.textMuted} paddingLeft={2}>
          Connection {props.connection}
        </text>
      </box>
    </box>
  );
}
