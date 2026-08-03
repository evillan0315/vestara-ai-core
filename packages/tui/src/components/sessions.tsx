import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface SessionsViewProps {
  sessions: readonly { id: string; title: string; status: string }[];
  palette: TuiSemanticPalette;
}

export function SessionsView(props: SessionsViewProps): ReactNode {
  return (
    <box flexDirection="column">
      <text fg={props.palette.accent}>Sessions</text>
      {props.sessions.length === 0 ? (
        <text fg={props.palette.textMuted}>No sessions yet.</text>
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
