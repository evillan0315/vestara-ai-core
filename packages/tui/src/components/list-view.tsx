import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import { toneForStatus } from '@vestara/design-system';
import type { ReactNode } from 'react';
import { EmptyState } from '../shared/empty-state.js';

export interface ListItem {
  readonly id: string;
  readonly title: string;
  readonly status?: string;
  readonly detail?: string;
}

export interface ListViewProps {
  title: string;
  palette: TuiSemanticPalette;
  rows: readonly ListItem[];
  empty?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onPress: () => void };
}

export function ListView(props: ListViewProps): ReactNode {
  return (
    <box flexDirection="column">
      <text fg={props.palette.accent} attributes={TextAttributes.BOLD}>
        {props.title}
      </text>
      {props.rows.length === 0 ? (
        <EmptyState
          palette={props.palette}
          title={props.empty ?? 'No items.'}
          description={props.emptyDescription}
          action={props.emptyAction}
        />
      ) : (
        props.rows.map((row) => (
          <box key={row.id} flexDirection="row">
            <text fg={row.status ? toneColor(row.status, props.palette) : props.palette.text}>
              {row.status ? `[${row.status}] ` : ''}
              {row.title}
            </text>
          </box>
        ))
      )}
    </box>
  );
}

function toneColor(status: string, palette: TuiSemanticPalette): string {
  const tone = toneForStatus(status);
  switch (tone) {
    case 'success':
      return palette.success;
    case 'warning':
      return palette.warning;
    case 'error':
      return palette.error;
    case 'info':
      return palette.info;
    case 'active':
      return palette.accent;
    default:
      return palette.textMuted;
  }
}
