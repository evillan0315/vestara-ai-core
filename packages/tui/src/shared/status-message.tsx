import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export type StatusMessageTone = 'success' | 'warning' | 'error' | 'info';

export interface StatusMessageProps {
  readonly palette: TuiSemanticPalette;
  readonly tone: StatusMessageTone;
  readonly label: string;
  readonly description?: string;
  readonly actions?: readonly { label: string; onPress: () => void }[];
}

const TONE_FG: Record<StatusMessageTone, (palette: TuiSemanticPalette) => string> = {
  success: (palette) => palette.success,
  warning: (palette) => palette.warning,
  error: (palette) => palette.error,
  info: (palette) => palette.info,
};

const TONE_MARKER: Record<StatusMessageTone, string> = {
  success: '✓',
  warning: '!',
  error: '✗',
  info: 'ℹ',
};

export function StatusMessage(props: StatusMessageProps): ReactNode {
  const fg = TONE_FG[props.tone](props.palette);
  return (
    <box flexDirection="column" paddingTop={1} paddingBottom={1}>
      <box flexDirection="row">
        <text fg={fg}>
          {TONE_MARKER[props.tone]} {props.label}
        </text>
      </box>
      {props.description ? <text fg={props.palette.textMuted}>{props.description}</text> : null}
      {props.actions?.length ? (
        <box flexDirection="row" paddingTop={1}>
          {props.actions.map((action) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: terminal action affordance; keyboard is primary.
            <text key={action.label} fg={props.palette.accent} paddingRight={2} onMouseDown={action.onPress}>
              {action.label}
            </text>
          ))}
        </box>
      ) : null}
    </box>
  );
}
