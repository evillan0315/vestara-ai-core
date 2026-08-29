import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface SettingsEntry {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description?: string;
}

export interface SettingsViewProps {
  readonly palette: TuiSemanticPalette;
  readonly entries: readonly SettingsEntry[];
}

export function SettingsView(props: SettingsViewProps): ReactNode {
  return (
    <box flexDirection="column">
      <text fg={props.palette.accent}>Settings</text>
      {props.entries.length === 0 ? (
        <text fg={props.palette.textMuted}>No settings configured.</text>
      ) : (
        props.entries.map((entry) => (
          <box key={entry.id} flexDirection="column" paddingBottom={1}>
            <box flexDirection="row">
              <text fg={props.palette.text}>{entry.label}</text>
              <text fg={props.palette.textMuted} paddingLeft={1}>
                {entry.value}
              </text>
            </box>
            {entry.description ? <text fg={props.palette.textDim}>{entry.description}</text> : null}
          </box>
        ))
      )}
    </box>
  );
}
