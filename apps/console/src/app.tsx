import { Box, Text, useApp, useInput, usePaste, useWindowSize } from 'ink';
import { useCallback, useRef, useState } from 'react';
import type { ConsoleController, ConsoleEvent } from './controller.js';

interface TranscriptEntry {
  id: number;
  kind: 'user' | 'output' | 'error' | 'system';
  content: string;
}

export function App({ controller }: { controller: ConsoleController }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([
    { id: 0, kind: 'system', content: 'Vestara Engineering Console ready. Type help for commands.' },
  ]);
  const [status, setStatus] = useState('Ready');
  const [busy, setBusy] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [overlay, setOverlay] = useState<'help' | 'palette' | null>(null);
  const [confirmation, setConfirmation] = useState<{ prompt: string; command: string } | null>(null);
  const nextId = useRef(1);
  const streamingId = useRef<number | null>(null);
  const active = useRef<AbortController | null>(null);

  const append = useCallback((kind: TranscriptEntry['kind'], content: string) => {
    setTranscript((current) => [...current, { id: nextId.current++, kind, content }].slice(-100));
  }, []);

  const handleEvent = useCallback(
    (event: ConsoleEvent) => {
      if (event.type === 'status') setStatus(event.content);
      else if (event.type === 'output') append('output', event.content);
      else if (event.type === 'output-start') {
        const id = nextId.current++;
        const entry: TranscriptEntry = { id, kind: 'output', content: '' };
        streamingId.current = id;
        setTranscript((current) => [...current, entry].slice(-100));
      } else if (event.type === 'output-delta') {
        const id = streamingId.current;
        if (id !== null)
          setTranscript((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, content: entry.content + event.content } : entry)),
          );
      } else if (event.type === 'output-end') streamingId.current = null;
      else if (event.type === 'error') append('error', event.content);
      else if (event.type === 'confirmation') setConfirmation({ prompt: event.prompt, command: event.command });
      else if (event.type === 'clear') {
        setTranscript([]);
        setScrollOffset(0);
      } else if (event.type === 'exit') exit();
    },
    [append, exit],
  );

  const executeCommand = useCallback(
    async (command: string) => {
      if (!command || busy) return;
      setHistory((current) => [...current.filter((entry) => entry !== command), command].slice(-100));
      setHistoryIndex(-1);
      append('user', command);
      setBusy(true);
      const abort = new AbortController();
      active.current = abort;
      try {
        for await (const event of controller.execute(command, abort.signal)) handleEvent(event);
      } finally {
        active.current = null;
        setBusy(false);
        setStatus('Ready');
      }
    },
    [append, busy, controller, handleEvent],
  );

  const submit = useCallback(async () => {
    const command = input.trim();
    if (!command || busy) return;
    setInput('');
    setScrollOffset(0);
    await executeCommand(command);
  }, [busy, executeCommand, input]);

  usePaste((text) => setInput((current) => current + text), { isActive: !busy && !confirmation });

  useInput((character, key) => {
    if (confirmation) {
      if (character.toLowerCase() === 'y') {
        const command = confirmation.command;
        setConfirmation(null);
        void executeCommand(command);
      } else if (character.toLowerCase() === 'n' || key.escape) {
        setConfirmation(null);
        setStatus('Cancelled');
      }
      return;
    }
    if (overlay) {
      if (key.escape || character === '?' || (key.ctrl && character === 'p')) setOverlay(null);
      return;
    }
    if (key.ctrl && character === 'c') {
      if (active.current) {
        active.current.abort();
        active.current = null;
        setBusy(false);
        setStatus('Cancelled');
      } else exit();
      return;
    }
    if (key.return && key.shift) {
      setInput((current) => `${current}\n`);
      return;
    }
    if (key.return) {
      void submit();
      return;
    }
    if (key.pageUp) {
      setScrollOffset((current) => Math.min(current + 5, Math.max(0, transcript.length - 1)));
      return;
    }
    if (key.pageDown) {
      setScrollOffset((current) => Math.max(0, current - 5));
      return;
    }
    if (key.ctrl && character === 'p') {
      setOverlay('palette');
      return;
    }
    if (character === '?' && !input) {
      setOverlay('help');
      return;
    }
    if (key.backspace || key.delete) {
      setInput((current) => current.slice(0, -1));
      return;
    }
    if (key.upArrow && history.length) {
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setInput(history[history.length - 1 - next] ?? '');
      return;
    }
    if (key.downArrow && historyIndex >= 0) {
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setInput(next < 0 ? '' : (history[history.length - 1 - next] ?? ''));
      return;
    }
    if (!key.ctrl && !key.meta && character) setInput((current) => current + character);
  });

  const transcriptHeight = Math.max(5, rows - 7);
  const visibleEnd = Math.max(0, transcript.length - scrollOffset);
  const visibleTranscript = transcript.slice(Math.max(0, visibleEnd - Math.max(1, transcriptHeight - 1)), visibleEnd);
  return (
    <Box width={columns} height={rows} flexDirection="column">
      <Box borderStyle="round" borderColor="yellow" paddingX={1} justifyContent="space-between">
        <Text bold color="yellow">
          Vestara
        </Text>
        <Text dimColor>{status}</Text>
      </Box>
      <Box height={transcriptHeight} flexDirection="column" paddingX={1} overflow="hidden">
        {overlay ? (
          <Overlay mode={overlay} />
        ) : confirmation ? (
          <Confirmation prompt={confirmation.prompt} />
        ) : (
          visibleTranscript.map((entry) => (
            <Box key={entry.id} marginBottom={1} flexDirection="column">
              <Text
                bold
                color={
                  entry.kind === 'user'
                    ? 'cyan'
                    : entry.kind === 'error'
                      ? 'red'
                      : entry.kind === 'system'
                        ? 'yellow'
                        : 'green'
                }
              >
                {entry.kind === 'user'
                  ? 'You'
                  : entry.kind === 'error'
                    ? 'Error'
                    : entry.kind === 'system'
                      ? 'System'
                      : 'Vestara'}
              </Text>
              <Text wrap="wrap">{entry.content}</Text>
            </Box>
          ))
        )}
      </Box>
      <Box borderStyle="round" borderColor={busy ? 'gray' : 'cyan'} paddingX={1}>
        <Text color="cyan">› </Text>
        <Text>{input}</Text>
        <Text inverse={!busy}> </Text>
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>
          {busy ? 'Ctrl+C cancel' : 'Enter submit · Shift+Enter newline · PgUp/PgDn scroll · Ctrl+P commands · ? help'}
        </Text>
        <Text dimColor>
          {columns}×{rows}
        </Text>
      </Box>
    </Box>
  );
}

function Overlay({ mode }: { mode: 'help' | 'palette' }) {
  const lines =
    mode === 'help'
      ? [
          'Keyboard',
          '  Enter         Submit',
          '  Shift+Enter   Newline',
          '  ↑ / ↓         History',
          '  PgUp / PgDn   Transcript',
          '  Ctrl+P        Command palette',
          '  Ctrl+C        Cancel or exit',
          '  Esc           Close overlay',
        ]
      : [
          'Command palette',
          '  status',
          '  routing show',
          '  routing catalog',
          '  routing profile <id>',
          '  routing preview <role> <agent-id>',
          '  routing assignments',
          '  routing reassign …',
          '  clear',
          '  exit',
        ];
  return (
    <Box borderStyle="round" borderColor="yellow" padding={1} flexDirection="column">
      {lines.map((line) => (
        <Text key={line} bold={line === lines[0]}>
          {line}
        </Text>
      ))}
      <Text dimColor>Esc to close</Text>
    </Box>
  );
}

function Confirmation({ prompt }: { prompt: string }) {
  return (
    <Box borderStyle="double" borderColor="yellow" padding={1} flexDirection="column">
      <Text bold color="yellow">
        Confirmation required
      </Text>
      <Text>{prompt}</Text>
      <Text dimColor>Y approve · N cancel</Text>
    </Box>
  );
}
