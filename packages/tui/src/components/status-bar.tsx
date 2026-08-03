import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface StatusBarProps {
  palette: TuiSemanticPalette;
  connection: string;
  agents: readonly { id: string; name: string; status: string; task?: string }[];
  workspace?: { name: string; root?: string; branch?: string };
  view: string;
}

export function StatusBar(props: StatusBarProps): ReactNode {
  const active = props.agents.find((agent) => agent.status === 'active' || agent.status === 'running');
  return (
    <box
      height={1}
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      backgroundColor={props.palette.backgroundElement}
    >
      <text fg={props.palette.textMuted}>
        {props.connection === 'connected' ? 'connected' : 'connecting'} · {props.view}
      </text>
      {active ? (
        <text fg={props.palette.accent} attributes={TextAttributes.BOLD}>
          {' '}
          ◈ {active.name}
        </text>
      ) : null}
      {props.agents.slice(0, 3).map((agent) => (
        <text key={agent.id} fg={props.palette.textDim}>
          {' '}
          {agent.status}
        </text>
      ))}
      <box flexGrow={1} />
      {props.workspace?.root ? <text fg={props.palette.textDim}>{props.workspace.root}</text> : null}
    </box>
  );
}
