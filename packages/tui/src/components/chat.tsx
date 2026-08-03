import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import { useKeyboard } from '@vestara/tui-renderer';
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useChat } from '../hooks/use-chat.js';
import type { TuiHostHandle } from '../host.js';
import type { TuiEvent } from '../types.js';

export interface ChatViewProps {
  host: TuiHostHandle;
  palette: TuiSemanticPalette;
  endpoint: string;
  notify: (level: 'success' | 'warning' | 'error' | 'info', message: string) => void;
}

export function ChatView(props: ChatViewProps): ReactNode {
  const chat = useChat();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(input);
  inputRef.current = input;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  const handleEvent = useCallback(
    (event: TuiEvent) => {
      switch (event.type) {
        case 'message':
          chat.pushSystem(event.entry.content);
          break;
        case 'conversation-start':
          chat.startAssistant(event.id);
          break;
        case 'conversation-delta':
          chat.appendDelta(event.id, event.content);
          break;
        case 'conversation-complete':
          chat.completeAssistant(event.id);
          break;
        case 'tool':
          chat.upsertTool(event.card);
          break;
        case 'notification':
          props.notify(event.level, event.message);
          break;
        case 'clear':
          chat.clear();
          break;
        default:
          break;
      }
    },
    [chat, props.notify],
  );

  const submit = useCallback(async () => {
    const message = inputRef.current.trim();
    if (!message || busyRef.current) return;
    setInput('');
    chat.pushUser(message);
    setBusy(true);
    try {
      for await (const event of props.host.controller.execute(message)) handleEvent(event);
    } catch (error) {
      props.notify('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [props.host, handleEvent, props.notify, chat]);

  useKeyboard((key) => {
    if (key.eventType === 'release') return;
    if (key.name === 'return' || key.name === 'enter') {
      void submit();
    } else if (key.name === 'backspace') {
      setInput((current) => current.slice(0, -1));
    } else if (key.name === 'escape') {
      setInput('');
    } else if (!key.ctrl && !key.meta && key.sequence) {
      setInput((current) => current + key.sequence);
    }
  });

  return (
    <box flexDirection="column" flexGrow={1}>
      <scrollbox flexGrow={1} flexShrink={1}>
        {chat.messages.map((message) => (
          <box key={message.id} flexDirection="row">
            <text
              fg={
                message.role === 'user'
                  ? props.palette.accent
                  : message.role === 'system'
                    ? props.palette.textDim
                    : props.palette.text
              }
              attributes={message.role === 'assistant' ? TextAttributes.BOLD : undefined}
            >
              {message.role === 'user' ? 'you' : message.role}: {message.content}
              {message.streaming ? '…' : ''}
            </text>
          </box>
        ))}
        {chat.tools.map((tool) => (
          <box key={tool.id} flexDirection="row">
            <text fg={tool.status === 'failed' ? props.palette.error : props.palette.textMuted}>
              [{tool.status}] {tool.label}
            </text>
          </box>
        ))}
      </scrollbox>
      <box height={1}>
        <text fg={props.palette.accent}>›</text>
        <text fg={props.palette.text}> {input}</text>
        {busy ? <text fg={props.palette.textDim}> …</text> : null}
      </box>
    </box>
  );
}
