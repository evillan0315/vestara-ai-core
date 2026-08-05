import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';
import { useConversation } from '../hooks/conversation-context.js';
import { summarizeOutcome } from '../state/execution-outcome.js';

export interface ChatViewProps {
  palette: TuiSemanticPalette;
}

export function ChatView(props: ChatViewProps): ReactNode {
  const chat = useConversation();

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
        {chat.outcome ? (
          <box flexDirection="column" paddingTop={1}>
            <text
              fg={
                chat.outcome.status === 'completed'
                  ? props.palette.success
                  : chat.outcome.status === 'cancelled'
                    ? props.palette.warning
                    : props.palette.error
              }
              attributes={TextAttributes.BOLD}
            >
              {summarizeOutcome(chat.outcome)}
            </text>
            {chat.outcome.observations.length ? (
              <box flexDirection="column" paddingTop={1}>
                <text fg={props.palette.textMuted}>Observations</text>
                {chat.outcome.observations.slice(0, 6).map((observation) => (
                  <text key={observation} fg={props.palette.text}>
                    • {observation}
                  </text>
                ))}
              </box>
            ) : null}
            {chat.outcome.evidence.length ? (
              <box flexDirection="column" paddingTop={1}>
                <text fg={props.palette.textMuted}>Evidence</text>
                {chat.outcome.evidence.map((path) => (
                  <text key={path} fg={props.palette.info}>
                    {path}
                  </text>
                ))}
              </box>
            ) : null}
            {chat.outcome.unresolved.length ? (
              <box flexDirection="column" paddingTop={1}>
                <text fg={props.palette.textMuted}>Unresolved</text>
                {chat.outcome.unresolved.map((item) => (
                  <text key={item} fg={props.palette.warning}>
                    {item}
                  </text>
                ))}
              </box>
            ) : null}
            {chat.outcome.nextActions.length ? (
              <box flexDirection="column" paddingTop={1}>
                <text fg={props.palette.textMuted}>Next</text>
                {chat.outcome.nextActions.map((action) => (
                  <text key={action} fg={props.palette.accent}>
                    {action}
                  </text>
                ))}
              </box>
            ) : null}
          </box>
        ) : null}
      </scrollbox>
    </box>
  );
}
