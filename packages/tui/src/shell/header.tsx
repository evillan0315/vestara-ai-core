import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';
import type { ConnectionStateName } from '../state/connection-state.js';
import { presentConnection } from '../state/connection-state.js';

export interface ShellHeaderProps {
  readonly palette: TuiSemanticPalette;
  readonly workspace?: { name: string; branch?: string };
  readonly connection: ConnectionStateName;
  readonly activeView: string;
}

const TONE_FG = {
  success: (palette: TuiSemanticPalette) => palette.success,
  warning: (palette: TuiSemanticPalette) => palette.warning,
  error: (palette: TuiSemanticPalette) => palette.error,
  info: (palette: TuiSemanticPalette) => palette.info,
} as const;

export function ShellHeader(props: ShellHeaderProps): ReactNode {
  const presentation = presentConnection({ name: props.connection, since: new Date().toISOString() });
  return (
    <box
      height={1}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      backgroundColor={props.palette.backgroundPanel}
    >
      <text fg={props.palette.accent}>Vestara</text>
      <text fg={props.palette.text} paddingLeft={2}>
        {props.workspace?.name ?? 'Workspace'}
      </text>
      {props.workspace?.branch ? (
        <text fg={props.palette.textDim} paddingLeft={1}>
          {props.workspace.branch}
        </text>
      ) : null}
      <box flexGrow={1} />
      <text fg={props.palette.textMuted}>{props.activeView}</text>
      <text fg={TONE_FG[presentation.tone](props.palette)} paddingLeft={2}>
        {presentation.label}
      </text>
      <text fg={props.palette.textDim} paddingLeft={2}>
        Ctrl+P Search
      </text>
      <text fg={props.palette.textDim} paddingLeft={1}>
        Ctrl+R Provider
      </text>
    </box>
  );
}
