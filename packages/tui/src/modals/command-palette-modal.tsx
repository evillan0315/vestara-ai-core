import type { TuiSemanticPalette } from '@vestara/design-system';
import { TUI_NAVIGATION } from '@vestara/design-system';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardRouter } from '../hooks/use-keyboard-router.js';
import { handled } from '../hooks/use-keyboard-router.js';
import type { ModalFrameContentProps } from '../modals/modal-provider.js';

export interface CommandPaletteContentProps {
  readonly palette: TuiSemanticPalette;
  readonly onExecute: (command: string) => void;
  readonly close: () => void;
  readonly router: KeyboardRouter;
}

const COMMANDS = [
  ...TUI_NAVIGATION.map((item) => ({ id: `view:${item.id}`, title: `${item.label} view`, command: item.id })),
  { id: 'help', title: 'Show help', command: '/help' },
  { id: 'status', title: 'Runtime status', command: '/status' },
  { id: 'routing', title: 'Show routing', command: '/routing show' },
  { id: 'clear', title: 'Clear chat', command: '/clear' },
  { id: 'exit', title: 'Exit', command: '/exit' },
];

export function CommandPaletteContent(props: CommandPaletteContentProps): ReactNode {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? COMMANDS.filter((command) => command.title.toLowerCase().includes(needle) || command.command.includes(needle))
    : COMMANDS;

  // Keep latest values in refs so the modal-priority handler is registered once.
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const runRef = useRef<(index: number) => void>(() => {});
  runRef.current = (index: number) => {
    const command = matchesRef.current[index];
    if (!command) return;
    props.close();
    props.onExecute(command.command);
  };

  useEffect(() => {
    return props.router.register('modal', (key) => {
      if (key.name === 'down') {
        setSelected((current) => Math.min(matchesRef.current.length - 1, current + 1));
        return handled();
      }
      if (key.name === 'up') {
        setSelected((current) => Math.max(0, current - 1));
        return handled();
      }
      if (key.name === 'return' || key.name === 'enter') {
        runRef.current(selectedRef.current);
        return handled();
      }
      return 'unhandled';
    });
  }, [props.router]);

  return (
    <box flexDirection="column">
      <input
        value={query}
        placeholder="Search commands, sessions, plans, files…"
        onInput={(value: string) => {
          setQuery(value);
          setSelected(0);
        }}
      />
      <box flexDirection="column" paddingTop={1}>
        {matches.slice(0, 10).map((command, index) => (
          // biome-ignore lint/a11y/noStaticElementInteractions: terminal mouse affordance; keyboard selection is primary.
          <box
            key={command.id}
            flexDirection="row"
            backgroundColor={index === selected ? props.palette.backgroundElement : undefined}
            onMouseDown={() => runRef.current(index)}
          >
            <text fg={index === selected ? props.palette.accentBright : props.palette.text}>
              {index === selected ? '› ' : '  '}
              {command.title}
            </text>
            <text fg={props.palette.textDim} paddingLeft={1}>
              /{command.command}
            </text>
          </box>
        ))}
        {matches.length === 0 ? <text fg={props.palette.textMuted}>No matching commands or resources</text> : null}
      </box>
    </box>
  );
}

export function createCommandPaletteModal(
  palette: TuiSemanticPalette,
  onExecute: (command: string) => void,
): ModalFrameContentProps extends never ? never : import('../modals/modal-provider.js').ModalDefinition {
  return {
    id: 'command-palette',
    title: 'Commands',
    shortcut: 'Ctrl+P',
    renderContent: (frame: ModalFrameContentProps) => (
      <CommandPaletteContent palette={palette} onExecute={onExecute} close={frame.close} router={frame.router} />
    ),
  };
}
