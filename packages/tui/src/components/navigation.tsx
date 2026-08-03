import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import { TUI_NAVIGATION } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface NavigationProps {
  active: string;
  palette: TuiSemanticPalette;
  onSelect: (id: string) => void;
}

export function Navigation(props: NavigationProps): ReactNode {
  return (
    <box width={16} flexDirection="column" backgroundColor={props.palette.backgroundPanel} paddingTop={1}>
      {TUI_NAVIGATION.map((item) => {
        const active = item.id === props.active;
        return (
          <box key={item.id} paddingLeft={1} paddingRight={1}>
            <text
              fg={active ? props.palette.accent : props.palette.textMuted}
              attributes={active ? TextAttributes.BOLD : undefined}
            >
              {item.icon} {item.label}
            </text>
          </box>
        );
      })}
    </box>
  );
}
