import { TextAttributes } from '@opentui/core';
import type { TuiSemanticPalette } from '@vestara/design-system';
import { TUI_NAVIGATION } from '@vestara/design-system';
import type { ReactNode } from 'react';

export interface CommandPaletteProps {
  palette: TuiSemanticPalette;
  input: string;
  setInput: (value: string) => void;
  onClose: () => void;
  onSelect: (command: string) => void;
}

const COMMANDS = [
  ...TUI_NAVIGATION.map((item) => ({ id: `view:${item.id}`, title: `${item.label} view`, command: item.id })),
  { id: 'help', title: 'Show help', command: '/help' },
  { id: 'status', title: 'Runtime status', command: '/status' },
  { id: 'routing', title: 'Show routing', command: '/routing show' },
  { id: 'clear', title: 'Clear chat', command: '/clear' },
  { id: 'exit', title: 'Exit', command: '/exit' },
];

export function CommandPalette(props: CommandPaletteProps): ReactNode {
  const needle = props.input.trim().toLowerCase();
  const matches = needle
    ? COMMANDS.filter((command) => command.title.toLowerCase().includes(needle) || command.command.includes(needle))
    : COMMANDS;

  return (
    <box
      position="absolute"
      top={2}
      left={2}
      right={2}
      flexDirection="column"
      backgroundColor={props.palette.backgroundPanel}
      borderStyle="rounded"
      borderColor={props.palette.border}
    >
      <box paddingLeft={1} paddingRight={1} paddingTop={1}>
        <text fg={props.palette.accent} attributes={TextAttributes.BOLD}>
          Commands
        </text>
      </box>
      <box paddingLeft={1} paddingRight={1}>
        <text fg={props.palette.textMuted}>› {props.input || ' '}</text>
      </box>
      <box paddingLeft={1} paddingRight={1} paddingBottom={1} flexDirection="column">
        {matches.slice(0, 10).map((command) => (
          <box key={command.id} flexDirection="row">
            <text fg={props.palette.text}> {command.title}</text>
            <text fg={props.palette.textDim}> — /{command.command}</text>
          </box>
        ))}
      </box>
    </box>
  );
}
