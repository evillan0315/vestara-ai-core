import type { TuiSemanticPalette } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface SidebarCardProps {
  readonly palette: TuiSemanticPalette;
  readonly title: string;
  readonly children: ReactNode;
}

export function SidebarCard(props: SidebarCardProps): ReactNode {
  return (
    <box flexDirection="column" paddingTop={1} paddingBottom={1}>
      <text fg={props.palette.accent}>{props.title}</text>
      <box paddingTop={1}>{props.children}</box>
    </box>
  );
}
