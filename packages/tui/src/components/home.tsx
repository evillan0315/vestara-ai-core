import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface HomeViewProps {
  palette: TuiSemanticPalette;
  onPrompt?: (prompt: string) => void;
}

const PLACEHOLDERS = ['Ask Vestara to fix a bug…', 'Describe a feature to plan…', 'Explore the engineering graph…'];

export function HomeView(props: HomeViewProps): ReactNode {
  return (
    <box flexDirection="column" justifyContent="center" alignItems="center" flexGrow={1}>
      <text fg={props.palette.accent} attributes={TextAttributes.BOLD}>
        VESTARA
      </text>
      <text fg={props.palette.textMuted}>Engineering Console</text>
      <box paddingTop={1} width={60}>
        <text fg={props.palette.textDim}>{PLACEHOLDERS.join('  ·  ')}</text>
      </box>
      <box paddingTop={1} width={60}>
        <text fg={props.palette.text}>› Press Ctrl+P for commands, or just type.</text>
      </box>
    </box>
  );
}
