import { TextAttributes } from '@opentui/core';
import { DEFAULT_THEME, TUI_NAVIGATION, TUI_SEMANTIC_PALETTES } from '@vestara/design-system';
import { useKeyboard, useTerminalDimensions } from '@vestara/tui-renderer';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ChatView } from './components/chat.js';
import { CommandPalette } from './components/command-palette.js';
import { ListView } from './components/list-view.js';
import { LogsView } from './components/logs.js';
import { Navigation } from './components/navigation.js';
import { SessionsView } from './components/sessions.js';
import { StatusBar } from './components/status-bar.js';
import type { TuiHostHandle } from './host.js';
import type { TuiEvent, TuiView } from './types.js';

export interface TuiShellProps {
  host: TuiHostHandle;
  endpoint: string;
  repoPath: string;
}

export function TuiShell(props: TuiShellProps): ReactNode {
  const palette = TUI_SEMANTIC_PALETTES[DEFAULT_THEME];
  const { width, height } = useTerminalDimensions();
  const [view, setView] = useState<TuiView>('chat');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [workspace, setWorkspace] = useState<{ name: string; root?: string; branch?: string }>();
  const [agents, setAgents] = useState<Array<{ id: string; name: string; status: string; task?: string }>>([]);
  const [logs, setLogs] = useState<Array<{ id: string; label: string; detail: string; timestamp: string }>>([]);
  const [sessions, setSessions] = useState<readonly { id: string; title: string; status: string }[]>([]);
  const [plans, setPlans] = useState<readonly { id: string; title: string; status: string }[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteInput, setPaletteInput] = useState('');
  const [notifications, setNotifications] = useState<Array<{ id: string; level: string; message: string }>>([]);

  const notify = useCallback((level: 'success' | 'warning' | 'error' | 'info', message: string) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setNotifications((current) => [...current, { id, level, message }].slice(-3));
    setTimeout(() => setNotifications((current) => current.filter((t) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let mounted = true;
    void props.host
      .subscribe((event: TuiEvent) => {
        if (!mounted) return;
        switch (event.type) {
          case 'connection':
            setConnection(event.state === 'connected' ? 'connected' : 'error');
            break;
          case 'workspace':
            setWorkspace({ name: event.workspace.name, root: event.workspace.root, branch: event.workspace.branch });
            break;
          case 'agent':
            setAgents((current) => {
              const rest = current.filter((a) => a.id !== event.agent.id);
              return [...rest, event.agent];
            });
            break;
          case 'telemetry':
            setLogs((current) => [...current, { id: event.timestamp, ...event }].slice(-200));
            break;
          case 'sessions':
            setSessions(event.sessions);
            break;
          case 'plans':
            setPlans(event.plans);
            break;
          case 'notification':
            notify(event.level, event.message);
            break;
          case 'navigate':
            setView(event.view);
            break;
          default:
            break;
        }
      })
      .then((unsubscribe) => {
        if (!mounted) unsubscribe();
        else dispose = unsubscribe;
      });
    return () => {
      mounted = false;
      dispose?.();
    };
  }, [props.host, notify]);

  useKeyboard((key) => {
    if (key.eventType === 'release') return;
    if (paletteOpen) {
      if (key.ctrl && key.name === 'p') setPaletteOpen(false);
      else if (key.name === 'escape') setPaletteOpen(false);
      else if (key.name === 'return' || key.name === 'enter') {
        const command = paletteInput.trim();
        setPaletteOpen(false);
        if (command) void props.host.controller.execute(command);
      } else if (key.name === 'backspace') {
        setPaletteInput((current) => current.slice(0, -1));
      } else if (!key.ctrl && !key.meta && key.sequence) {
        setPaletteInput((current) => current + key.sequence);
      }
      return;
    }
    if (key.ctrl && key.name === 'p') {
      setPaletteOpen(true);
      setPaletteInput('');
      return;
    }
    if (key.name === 'tab') {
      setView((current) => {
        const index = TUI_NAVIGATION.findIndex((item) => item.id === current);
        const next = TUI_NAVIGATION[(index + 1) % TUI_NAVIGATION.length];
        return (next?.id ?? 'chat') as TuiView;
      });
      return;
    }
    const digit = key.sequence;
    if (digit === '1') setView('chat');
    else if (digit === '2') setView('sessions');
    else if (digit === '3') setView('plans');
    else if (digit === '4') setView('graph');
    else if (digit === '5') setView('execution');
    else if (digit === '6') setView('workflow');
    else if (digit === '7') setView('logs');
  });

  const compact = width < 90;
  const showSidebar = !compact;

  return (
    <box flexDirection="column" height={height} width={width} backgroundColor={palette.background}>
      <box height={1} paddingLeft={1} paddingRight={1} flexDirection="row" backgroundColor={palette.backgroundPanel}>
        <text fg={palette.accent} attributes={TextAttributes.BOLD}>
          vestara
        </text>
        <text
          fg={connection === 'connected' ? palette.success : connection === 'error' ? palette.error : palette.warning}
        >
          {' '}
          {connection === 'connected' ? '●' : connection === 'error' ? '✗' : '○'}
        </text>
        <text fg={palette.textMuted} paddingLeft={1}>
          {workspace?.name ?? '…'}
        </text>
        {workspace?.branch ? (
          <text fg={palette.textDim} paddingLeft={1}>
            {workspace.branch}
          </text>
        ) : null}
        <box flexGrow={1} />
        <text fg={palette.textDim}>
          {width}×{height}
        </text>
      </box>
      <box flexGrow={1} flexDirection="row">
        {showSidebar && <Navigation active={view} palette={palette} onSelect={(id) => setView(id as TuiView)} />}
        <box flexGrow={1} paddingLeft={1} paddingRight={1} paddingTop={1}>
          {view === 'chat' && (
            <ChatView host={props.host} palette={palette} endpoint={props.endpoint} notify={notify} />
          )}
          {view === 'sessions' && <SessionsView sessions={sessions} palette={palette} />}
          {view === 'plans' && (
            <ListView
              title="Plans"
              palette={palette}
              rows={plans.map((plan) => ({ id: plan.id, title: plan.title, status: plan.status }))}
            />
          )}
          {view === 'logs' && <LogsView logs={logs} palette={palette} />}
          {view === 'graph' && (
            <ListView
              title="Graph"
              palette={palette}
              rows={agents.map((agent) => ({ id: agent.id, title: agent.name, status: agent.status }))}
            />
          )}
          {view === 'execution' && (
            <ListView title="Execution" palette={palette} rows={[]} empty="No execution data yet." />
          )}
          {view === 'workflow' && (
            <ListView title="Workflow" palette={palette} rows={[]} empty="No workflow projection yet." />
          )}
          {view === 'telemetry' && <LogsView logs={logs} palette={palette} />}
        </box>
      </box>
      <StatusBar palette={palette} connection={connection} agents={agents} workspace={workspace} view={view} />
      {paletteOpen && (
        <CommandPalette
          palette={palette}
          input={paletteInput}
          setInput={setPaletteInput}
          onClose={() => setPaletteOpen(false)}
          onSelect={(command) => {
            setPaletteOpen(false);
            void props.host.controller.execute(command);
          }}
        />
      )}
      {notifications.map((toast) => (
        <box
          key={toast.id}
          position="absolute"
          bottom={1}
          left={1}
          backgroundColor={palette.backgroundPanel}
          paddingLeft={1}
          paddingRight={1}
        >
          <text
            fg={toast.level === 'error' ? palette.error : toast.level === 'warning' ? palette.warning : palette.success}
          >
            {toast.message}
          </text>
        </box>
      ))}
    </box>
  );
}
