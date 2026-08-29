import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';
import { EmptyState } from '../shared/empty-state.js';

export interface SessionsViewProps {
  sessions: readonly { id: string; title: string; status: string }[];
  palette: TuiSemanticPalette;
  onNewSession?: () => void;
}

export function SessionsView(props: SessionsViewProps): ReactNode {
  return (
    <box flexDirection="column">
      <text fg={props.palette.accent}>Sessions</text>
      {props.sessions.length === 0 ? (
        <EmptyState
          palette={props.palette}
          title="No sessions yet."
          description="Start a conversation below, or press Ctrl+P to open an existing session."
          action={props.onNewSession ? { label: 'Start a conversation', onPress: props.onNewSession } : undefined}
        />
      ) : (
        props.sessions.map((session) => (
          <box key={session.id} flexDirection="row">
            <text fg={props.palette.text}>◎ {session.title}</text>
            <text fg={props.palette.textMuted}> [{session.status}]</text>
          </box>
        ))
      )}
    </box>
  );
}
