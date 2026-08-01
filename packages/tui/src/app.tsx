import { Box, Text, useApp, useInput, usePaste, useWindowSize } from 'ink';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TuiController } from './controller.js';
import type {
  AgentCard,
  ConversationEntry,
  FileSummary,
  PlanSummary,
  SessionSummary,
  ToolCard,
  TuiEvent,
  TuiView,
  WorkspaceSummary,
} from './types.js';

const NAVIGATION: Array<{ view: TuiView; label: string; key: string }> = [
  { view: 'chat', label: 'Chat', key: '1' },
  { view: 'sessions', label: 'Sessions', key: '2' },
  { view: 'plans', label: 'Plans', key: '3' },
  { view: 'graph', label: 'Graph', key: '4' },
  { view: 'explorer', label: 'Explorer', key: '5' },
  { view: 'logs', label: 'Logs', key: '6' },
  { view: 'telemetry', label: 'Telemetry', key: '7' },
];

interface LogEntry {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
}
interface Toast {
  id: string;
  level: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

export function App({ controller }: { controller: TuiController }) {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [view, setView] = useState<TuiView>('chat');
  const [sidebar, setSidebar] = useState(true);
  const [agentPanel, setAgentPanel] = useState(true);
  const [connection, setConnection] = useState('connecting');
  const [workspace, setWorkspace] = useState<WorkspaceSummary>();
  const [messages, setMessages] = useState<ConversationEntry[]>([
    { id: 'welcome', role: 'system', content: 'Vestara TUI connected to the shared runtime.' },
  ]);
  const [tools, setTools] = useState<ToolCard[]>([]);
  const [agents, setAgents] = useState<Map<string, AgentCard>>(new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [entities, setEntities] = useState<readonly { id: string; kind: string; label: string; status?: string }[]>([]);
  const [plans, setPlans] = useState<readonly PlanSummary[]>([]);
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [files, setFiles] = useState<readonly FileSummary[]>([]);
  const [selection, setSelection] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [undo, setUndo] = useState<string[]>([]);
  const [redo, setRedo] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [overlay, setOverlay] = useState<'palette' | 'help' | null>(null);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [confirmation, setConfirmation] = useState<{ prompt: string; command: string }>();
  const [scroll, setScroll] = useState(0);
  const active = useRef<AbortController | undefined>(undefined);

  const notify = useCallback((level: Toast['level'], message: string) => {
    const toast = { id: `toast-${Date.now()}-${Math.random()}`, level, message };
    setToasts((current) => [...current, toast].slice(-3));
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 3500);
  }, []);

  const handleEvent = useCallback(
    (event: TuiEvent) => {
      if (event.type === 'connection') setConnection(event.state);
      else if (event.type === 'workspace') setWorkspace(event.workspace);
      else if (event.type === 'message') setMessages((current) => [...current, event.entry].slice(-300));
      else if (event.type === 'conversation-start')
        setMessages((current) =>
          [...current, { id: event.id, role: 'assistant' as const, content: '', streaming: true }].slice(-300),
        );
      else if (event.type === 'conversation-delta')
        setMessages((current) =>
          current.map((item) => (item.id === event.id ? { ...item, content: item.content + event.content } : item)),
        );
      else if (event.type === 'conversation-complete')
        setMessages((current) => current.map((item) => (item.id === event.id ? { ...item, streaming: false } : item)));
      else if (event.type === 'tool')
        setTools((current) => [...current.filter((item) => item.id !== event.card.id), event.card].slice(-30));
      else if (event.type === 'agent') setAgents((current) => new Map(current).set(event.agent.id, event.agent));
      else if (event.type === 'telemetry')
        setLogs((current) => [...current, { id: `${event.timestamp}-${event.label}`, ...event }].slice(-200));
      else if (event.type === 'graph') setEntities(event.entities);
      else if (event.type === 'plans') setPlans(event.plans);
      else if (event.type === 'sessions') setSessions(event.sessions);
      else if (event.type === 'files') setFiles(event.files);
      else if (event.type === 'navigate') {
        setView(event.view);
        setSelection(0);
      } else if (event.type === 'notification') notify(event.level, event.message);
      else if (event.type === 'confirmation') setConfirmation({ prompt: event.prompt, command: event.command });
      else if (event.type === 'clear') {
        setMessages([]);
        setTools([]);
      } else if (event.type === 'exit') exit();
    },
    [exit, notify],
  );

  useEffect(() => {
    let dispose = () => {};
    let mounted = true;
    void controller.connect(handleEvent).then((unsubscribe) => {
      if (mounted) dispose = unsubscribe;
      else unsubscribe();
    });
    return () => {
      mounted = false;
      dispose();
      active.current?.abort();
    };
  }, [controller, handleEvent]);

  const updateInput = useCallback(
    (next: string, nextCursor = next.length) => {
      setUndo((current) => [...current, input].slice(-100));
      setRedo([]);
      setInput(next);
      setCursor(Math.max(0, Math.min(nextCursor, next.length)));
    },
    [input],
  );

  const execute = useCallback(
    async (command: string) => {
      if (!command.trim() || busy) return;
      setMessages((current) =>
        [...current, { id: `user-${Date.now()}`, role: 'user' as const, content: command }].slice(-300),
      );
      setHistory((current) => [...current.filter((item) => item !== command), command].slice(-100));
      setHistoryIndex(-1);
      setBusy(true);
      const abort = new AbortController();
      active.current = abort;
      try {
        for await (const event of controller.execute(command, abort.signal)) handleEvent(event);
      } catch (error) {
        notify('error', error instanceof Error ? error.message : String(error));
      } finally {
        active.current = undefined;
        setBusy(false);
      }
    },
    [busy, controller, handleEvent, notify],
  );

  const submit = useCallback(() => {
    const command = input.trim();
    if (!command || busy) return;
    setInput('');
    setCursor(0);
    setScroll(0);
    void execute(command);
  }, [busy, execute, input]);

  usePaste((value) => updateInput(`${input.slice(0, cursor)}${value}${input.slice(cursor)}`, cursor + value.length), {
    isActive: !busy && !overlay && !confirmation,
  });

  useInput((character, key) => {
    if (confirmation) {
      if (character.toLowerCase() === 'y') {
        const command = confirmation.command;
        setConfirmation(undefined);
        void execute(command);
      } else if (character.toLowerCase() === 'n' || key.escape) setConfirmation(undefined);
      return;
    }
    if (overlay === 'palette') {
      if (key.escape) {
        setOverlay(null);
        setPaletteQuery('');
        return;
      }
      if (key.return) {
        const selected = paletteCommands(paletteQuery)[0];
        setOverlay(null);
        setPaletteQuery('');
        if (selected) selected.run({ setView, setSidebar, setAgentPanel, execute });
        return;
      }
      if (key.backspace || key.delete) setPaletteQuery((current) => current.slice(0, -1));
      else if (!key.ctrl && character) setPaletteQuery((current) => current + character);
      return;
    }
    if (overlay === 'help') {
      if (key.escape || character === '?') setOverlay(null);
      return;
    }
    if (key.ctrl && character === 'c') {
      if (active.current) {
        active.current.abort();
        setBusy(false);
        notify('warning', 'Operation cancelled');
      } else exit();
      return;
    }
    if (key.ctrl && character === 'p') {
      setOverlay('palette');
      return;
    }
    if (key.ctrl && character === 'b') {
      setSidebar((current) => !current);
      return;
    }
    if (key.ctrl && character === 'a') {
      setAgentPanel((current) => !current);
      return;
    }
    if (key.ctrl && character === 'g') {
      setView('graph');
      return;
    }
    if (key.ctrl && character === 't') {
      setView('telemetry');
      return;
    }
    if (key.ctrl && character === 'l') {
      setMessages([]);
      setTools([]);
      return;
    }
    if (character === '?' && !input) {
      setOverlay('help');
      return;
    }
    const shortcut = NAVIGATION.find((item) => key.ctrl && character === item.key);
    if (shortcut) {
      setView(shortcut.view);
      return;
    }
    if (key.tab) {
      const index = NAVIGATION.findIndex((item) => item.view === view);
      setView(NAVIGATION[(index + 1) % NAVIGATION.length]!.view);
      return;
    }
    if (key.pageUp) {
      setScroll((current) => current + 5);
      return;
    }
    if (key.pageDown) {
      setScroll((current) => Math.max(0, current - 5));
      return;
    }
    if (!input && key.upArrow && view !== 'chat') {
      setSelection((current) => Math.max(0, current - 1));
      return;
    }
    if (!input && key.downArrow && view !== 'chat') {
      setSelection((current) => current + 1);
      return;
    }
    if (key.return && key.shift) {
      updateInput(`${input.slice(0, cursor)}\n${input.slice(cursor)}`, cursor + 1);
      return;
    }
    if (key.return) {
      submit();
      return;
    }
    if (key.ctrl && character === 'z') {
      const previous = undo.at(-1);
      if (previous !== undefined) {
        setRedo((current) => [...current, input]);
        setUndo((current) => current.slice(0, -1));
        setInput(previous);
        setCursor(previous.length);
      }
      return;
    }
    if (key.ctrl && character === 'y') {
      const next = redo.at(-1);
      if (next !== undefined) {
        setUndo((current) => [...current, input]);
        setRedo((current) => current.slice(0, -1));
        setInput(next);
        setCursor(next.length);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((current) => Math.max(0, current - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((current) => Math.min(input.length, current + 1));
      return;
    }
    if (key.backspace) {
      if (cursor > 0) updateInput(`${input.slice(0, cursor - 1)}${input.slice(cursor)}`, cursor - 1);
      return;
    }
    if (key.delete) {
      if (cursor < input.length) updateInput(`${input.slice(0, cursor)}${input.slice(cursor + 1)}`, cursor);
      return;
    }
    if (key.upArrow && input.includes('\n')) {
      setCursor((current) => Math.max(0, current - (input.slice(0, current).split('\n').at(-1)?.length ?? 0) - 1));
      return;
    }
    if (key.upArrow && history.length) {
      const next = Math.min(historyIndex + 1, history.length - 1);
      const value = history[history.length - 1 - next] ?? '';
      setHistoryIndex(next);
      setInput(value);
      setCursor(value.length);
      return;
    }
    if (key.downArrow && historyIndex >= 0) {
      const next = historyIndex - 1;
      const value = next < 0 ? '' : (history[history.length - 1 - next] ?? '');
      setHistoryIndex(next);
      setInput(value);
      setCursor(value.length);
      return;
    }
    if (!key.ctrl && !key.meta && character)
      updateInput(`${input.slice(0, cursor)}${character}${input.slice(cursor)}`, cursor + character.length);
  });

  const compact = columns < 90;
  const showSidebar = sidebar && !compact;
  const showAgents = agentPanel && columns >= 115;
  const contentHeight = Math.max(8, rows - 7);
  return (
    <Box width={columns} height={rows} flexDirection="column">
      <Header workspace={workspace} connection={connection} busy={busy} />
      <Box height={contentHeight}>
        {showSidebar && <Navigation active={view} />}
        <Box flexGrow={1} flexDirection="column" paddingX={1} overflow="hidden">
          <MainView
            view={view}
            messages={messages}
            tools={tools}
            logs={logs}
            entities={entities}
            plans={plans}
            sessions={sessions}
            files={files}
            selection={selection}
            scroll={scroll}
            height={contentHeight}
            workspace={workspace}
          />
        </Box>
        {showAgents && <AgentPanel agents={[...agents.values()]} />}
      </Box>
      <Editor value={input} cursor={cursor} busy={busy} />
      <StatusBar workspace={workspace} connection={connection} agents={[...agents.values()]} busy={busy} view={view} />
      {overlay && <Overlay mode={overlay} query={paletteQuery} />}
      {confirmation && <Confirmation prompt={confirmation.prompt} />}
      <Toasts items={toasts} />
    </Box>
  );
}

function Header({ workspace, connection, busy }: { workspace?: WorkspaceSummary; connection: string; busy: boolean }) {
  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={1} justifyContent="space-between">
      <Text bold color="yellow">
        Vestara
      </Text>
      <Text>
        {workspace?.name ?? 'No workspace'} <Text dimColor>{workspace?.branch ?? ''}</Text>
      </Text>
      <Text color={connection === 'connected' ? 'green' : connection === 'error' ? 'red' : 'yellow'}>
        {busy ? '● working' : `● ${connection}`}
      </Text>
    </Box>
  );
}

function Navigation({ active }: { active: TuiView }) {
  return (
    <Box width={16} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
      <Text bold>Navigation</Text>
      {NAVIGATION.map((item) => (
        <Text key={item.view} color={active === item.view ? 'cyan' : undefined} bold={active === item.view}>
          {active === item.view ? '›' : ' '} {item.label}
        </Text>
      ))}
    </Box>
  );
}

function MainView(props: {
  view: TuiView;
  messages: ConversationEntry[];
  tools: ToolCard[];
  logs: LogEntry[];
  entities: readonly { id: string; kind: string; label: string; status?: string }[];
  plans: readonly PlanSummary[];
  sessions: readonly SessionSummary[];
  files: readonly FileSummary[];
  selection: number;
  scroll: number;
  height: number;
  workspace?: WorkspaceSummary;
}) {
  if (props.view === 'chat')
    return <Conversation messages={props.messages} tools={props.tools} scroll={props.scroll} height={props.height} />;
  if (props.view === 'graph')
    return (
      <ListView
        title="Engineering Graph"
        lines={props.entities.map(
          (item) => `${item.kind.padEnd(18)} ${item.label}${item.status ? ` · ${item.status}` : ''}`,
        )}
        selected={props.selection}
      />
    );
  if (props.view === 'telemetry' || props.view === 'logs')
    return (
      <ListView
        title={props.view === 'telemetry' ? 'Live Telemetry' : 'Runtime Logs'}
        lines={props.logs.slice(-Math.max(1, props.height - 2)).map((item) => `${item.label} ${item.detail}`)}
        selected={props.selection}
      />
    );
  if (props.view === 'explorer')
    return (
      <ListView
        title="Workspace Explorer"
        lines={props.files.map((file) => `${file.status ? `${file.status.padEnd(10)} ` : ''}${file.path}`)}
        selected={props.selection}
      />
    );
  if (props.view === 'plans')
    return (
      <ListView
        title="Plans"
        lines={props.plans.map((plan) => `${plan.status.padEnd(12)} ${plan.title} · ${plan.taskCount} tasks`)}
        selected={props.selection}
      />
    );
  if (props.view === 'sessions')
    return (
      <ListView
        title="Sessions"
        lines={props.sessions.map(
          (session) => `${session.status.padEnd(12)} ${session.title} · ${session.participantCount} participants`,
        )}
        selected={props.selection}
      />
    );
  return null;
}

function Conversation({
  messages,
  tools,
  scroll,
  height,
}: {
  messages: ConversationEntry[];
  tools: ToolCard[];
  scroll: number;
  height: number;
}) {
  const items = [
    ...messages.map((message) => ({ kind: 'message' as const, message })),
    ...tools.map((tool) => ({ kind: 'tool' as const, tool })),
  ];
  const end = Math.max(0, items.length - scroll);
  const visible = items.slice(Math.max(0, end - Math.max(2, height - 2)), end);
  return (
    <Box flexDirection="column">
      <Text bold>Conversation</Text>
      {visible.map((item) =>
        item.kind === 'tool' ? (
          <ToolExecution key={`tool-${item.tool.id}`} card={item.tool} />
        ) : (
          <Box key={item.message.id} flexDirection="column" marginBottom={1}>
            <Text
              bold
              color={item.message.role === 'user' ? 'cyan' : item.message.role === 'assistant' ? 'green' : 'yellow'}
            >
              {item.message.role === 'user' ? 'You' : item.message.role === 'assistant' ? 'Vestara' : 'System'}
              {item.message.streaming ? ' …' : ''}
            </Text>
            <MarkdownText content={item.message.content} />
          </Box>
        ),
      )}
    </Box>
  );
}

function MarkdownText({ content }: { content: string }) {
  let code = false;
  return (
    <>
      {content.split('\n').map((line) => {
        if (line.startsWith('```')) {
          code = !code;
          return (
            <Text key={`fence-${line}`} dimColor>
              {line}
            </Text>
          );
        }
        const heading = /^#{1,6}\s/.test(line);
        const bullet = /^\s*[-*]\s/.test(line);
        return (
          <Text key={line} color={code ? 'yellow' : heading ? 'cyan' : undefined} bold={heading}>
            {bullet ? `• ${line.replace(/^\s*[-*]\s/, '')}` : line || ' '}
          </Text>
        );
      })}
    </>
  );
}

function ToolExecution({ card }: { card: ToolCard }) {
  const icon =
    card.status === 'completed'
      ? '✓'
      : card.status === 'failed'
        ? '✖'
        : card.status === 'approval-required'
          ? '⚠'
          : '⟳';
  const color = card.status === 'completed' ? 'green' : card.status === 'failed' ? 'red' : 'yellow';
  return (
    <Box borderStyle="single" borderColor={color} paddingX={1} flexDirection="column">
      <Text color={color}>
        {icon} {card.label}
      </Text>
      <Text dimColor>
        {card.tool}
        {card.detail ? ` · ${card.detail}` : ''}
      </Text>
    </Box>
  );
}

function AgentPanel({ agents }: { agents: AgentCard[] }) {
  return (
    <Box width={26} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
      <Text bold>Agents</Text>
      {agents.length ? (
        agents.map((agent) => (
          <Box key={agent.id} flexDirection="column" marginBottom={1}>
            <Text color={agent.status === 'completed' || agent.status === 'idle' ? 'green' : 'yellow'}>
              {agent.name} · {agent.status}
            </Text>
            <Text dimColor>{agent.task || 'Ready'}</Text>
            {agent.progress !== undefined && <Text>{progress(agent.progress)}</Text>}
          </Box>
        ))
      ) : (
        <Text dimColor>No active agents</Text>
      )}
    </Box>
  );
}

function Editor({ value, cursor, busy }: { value: string; cursor: number; busy: boolean }) {
  return (
    <Box minHeight={3} borderStyle="round" borderColor={busy ? 'gray' : 'cyan'} paddingX={1} flexDirection="column">
      <Text color="cyan">
        › <Text>{value.slice(0, cursor)}</Text>
        <Text inverse={!busy}>{value[cursor] ?? ' '}</Text>
        <Text>{value.slice(cursor + (value[cursor] ? 1 : 0))}</Text>
      </Text>
      <Text dimColor>{busy ? 'Ctrl+C cancel' : 'Enter send · Shift+Enter newline · Ctrl+P palette'}</Text>
    </Box>
  );
}

function StatusBar({
  workspace,
  connection,
  agents,
  busy,
  view,
}: {
  workspace?: WorkspaceSummary;
  connection: string;
  agents: AgentCard[];
  busy: boolean;
  view: TuiView;
}) {
  const memory = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const tokens = agents.reduce((sum, agent) => sum + (agent.tokens ?? 0), 0);
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Text dimColor>
        {workspace?.name ?? 'workspace'} · {workspace?.branch ?? 'no branch'} · {view}
      </Text>
      <Text dimColor>
        {agents.filter((agent) => !['idle', 'completed'].includes(agent.status)).length} agents · {tokens} tokens ·{' '}
        {memory}MB · {busy ? 'working' : 'ready'} · {connection}
      </Text>
    </Box>
  );
}

function ListView({ title, lines, selected }: { title: string; lines: string[]; selected?: number }) {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">
        {title}
      </Text>
      {lines.length ? (
        lines.map((line, index) => (
          <Text key={`${index}-${line}`} color={selected === index ? 'cyan' : undefined} bold={selected === index}>
            {selected === index ? '› ' : '  '}
            {line}
          </Text>
        ))
      ) : (
        <Text dimColor>No data yet</Text>
      )}
    </Box>
  );
}
function progress(value: number): string {
  const width = 10;
  const count = Math.round((Math.max(0, Math.min(100, value)) / 100) * width);
  return `${'█'.repeat(count)}${'░'.repeat(width - count)} ${Math.round(value)}%`;
}

interface PaletteContext {
  setView: (view: TuiView) => void;
  setSidebar: React.Dispatch<React.SetStateAction<boolean>>;
  setAgentPanel: React.Dispatch<React.SetStateAction<boolean>>;
  execute: (command: string) => Promise<void>;
}
function paletteCommands(query: string): Array<{ label: string; run(context: PaletteContext): void }> {
  const commands = [
    ...NAVIGATION.map((item) => ({
      label: `Open ${item.label}`,
      run: (context: PaletteContext) => context.setView(item.view),
    })),
    {
      label: 'Runtime Status',
      run: (context: PaletteContext) => {
        void context.execute('/status');
      },
    },
    {
      label: 'Show Routing',
      run: (context: PaletteContext) => {
        void context.execute('/routing show');
      },
    },
    { label: 'Toggle Sidebar', run: (context: PaletteContext) => context.setSidebar((value) => !value) },
    { label: 'Toggle Agents', run: (context: PaletteContext) => context.setAgentPanel((value) => !value) },
  ];
  const normalized = query.trim().toLowerCase();
  return normalized ? commands.filter((item) => item.label.toLowerCase().includes(normalized)) : commands;
}

function Overlay({ mode, query }: { mode: 'palette' | 'help'; query: string }) {
  const lines =
    mode === 'palette'
      ? paletteCommands(query)
          .slice(0, 10)
          .map((item, index) => `${index === 0 ? '›' : ' '} ${item.label}`)
      : [
          'Ctrl+P Command palette',
          'Ctrl+B Toggle navigation',
          'Ctrl+A Toggle agents',
          'Ctrl+G Engineering graph',
          'Ctrl+T Telemetry',
          'Ctrl+L Clear conversation',
          'Tab Switch view',
          'PgUp/PgDn Scroll',
          'Ctrl+Z/Y Undo/redo',
          'Esc Back',
        ];
  return (
    <Box
      position="absolute"
      marginTop={2}
      marginLeft={4}
      width={54}
      borderStyle="double"
      borderColor="yellow"
      padding={1}
      flexDirection="column"
    >
      <Text bold>{mode === 'palette' ? `Command Palette › ${query}` : 'Keyboard'}</Text>
      {lines.map((line) => (
        <Text key={line}>{line}</Text>
      ))}
      <Text dimColor>Esc close · Enter select</Text>
    </Box>
  );
}
function Confirmation({ prompt }: { prompt: string }) {
  return (
    <Box
      position="absolute"
      marginTop={4}
      marginLeft={6}
      borderStyle="double"
      borderColor="yellow"
      padding={1}
      flexDirection="column"
    >
      <Text bold color="yellow">
        Approval required
      </Text>
      <Text>{prompt}</Text>
      <Text dimColor>Y approve · N cancel</Text>
    </Box>
  );
}
function Toasts({ items }: { items: Toast[] }) {
  return (
    <Box position="absolute" marginTop={1} marginLeft={2} flexDirection="column">
      {items.map((item) => (
        <Text
          key={item.id}
          color={
            item.level === 'error'
              ? 'red'
              : item.level === 'warning'
                ? 'yellow'
                : item.level === 'success'
                  ? 'green'
                  : 'cyan'
          }
        >
          {item.level === 'success' ? '✓' : item.level === 'error' ? '✖' : item.level === 'warning' ? '⚠' : '•'}{' '}
          {item.message}
        </Text>
      ))}
    </Box>
  );
}
