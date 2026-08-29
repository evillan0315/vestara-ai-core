import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface LogsViewProps {
  logs: readonly { id: string; label: string; detail: string; timestamp: string }[];
  palette: TuiSemanticPalette;
}

export function LogsView(props: LogsViewProps): ReactNode {
  return (
    <scrollbox flexGrow={1} flexShrink={1}>
      {props.logs.map((log) => (
        <box key={log.id} flexDirection="row">
          <text fg={props.palette.textDim}>{log.timestamp.slice(11, 19)} </text>
          <text fg={props.palette.textMuted}>{log.label}</text>
          <text fg={props.palette.text}> {log.detail}</text>
        </box>
      ))}
    </scrollbox>
  );
}
