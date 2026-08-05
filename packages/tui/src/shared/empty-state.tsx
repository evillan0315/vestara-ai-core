import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  readonly palette: TuiSemanticPalette;
  readonly title: string;
  readonly description?: string;
  readonly action?: { label: string; onPress: () => void };
}

export function EmptyState(props: EmptyStateProps): ReactNode {
  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={props.palette.text}>{props.title}</text>
      {props.description ? <text fg={props.palette.textMuted}>{props.description}</text> : null}
      {props.action ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: terminal action affordance; keyboard is primary.
        <text fg={props.palette.accent} paddingTop={1} onMouseDown={props.action.onPress}>
          {props.action.label}
        </text>
      ) : null}
    </box>
  );
}
