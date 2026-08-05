import { DEFAULT_THEME, TUI_NAVIGATION, TUI_SEMANTIC_PALETTES } from '@vestara/design-system';
import { useTerminalDimensions } from '@vestara/tui-renderer';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useReducer, useState } from 'react';
import { type ArtifactSummary, ArtifactsView } from './components/artifacts.js';
import { ChatView } from './components/chat.js';
import { ExecutionView } from './components/execution-view.js';
import { ListView } from './components/list-view.js';
import { LogsView } from './components/logs.js';
import { Navigation } from './components/navigation.js';
import { SessionsView } from './components/sessions.js';
import { type SettingsEntry, SettingsView } from './components/settings.js';
import { ConversationProvider, useConversation } from './hooks/conversation-context.js';
import { handled, useKeyboardRouter } from './hooks/use-keyboard-router.js';
import type { TuiHostHandle } from './host.js';
import { computeShellLayout } from './layout/responsive-layout.js';
import { createCommandPaletteModal } from './modals/command-palette-modal.js';
import { ModalHost, useTopModal } from './modals/modal-host.js';
import { ModalProvider, useModal } from './modals/modal-provider.js';
import { createRuntimeConfigModal } from './modals/runtime-config-modal.js';
import { StatusMessage } from './shared/status-message.js';
import { BottomArea } from './shell/bottom-area.js';
import { ContextSidebar } from './shell/context-sidebar.js';
import { ShellHeader } from './shell/header.js';
import {
  connectionReducer,
  initialConnectionState,
  isOperational,
  presentConnection,
} from './state/connection-state.js';
import type { HarnessTaskSnapshot, HarnessThreadSummary, SessionSummary, TuiEvent, TuiView } from './types.js';

export interface TuiShellProps {
  host: TuiHostHandle;
  endpoint: string;
  repoPath: string;
}

export function TuiShell(props: TuiShellProps): ReactNode {
  const notify = useCallback(
    (level: 'success' | 'warning' | 'error' | 'info', message: string) => {
      props.host.host.notifications.notify(level, message);
    },
    [props.host],
  );
  return (
    <ConversationProvider host={props.host} notify={notify}>
      <ModalProvider>
        <TuiShellContent {...props} notify={notify} />
      </ModalProvider>
    </ConversationProvider>
  );
}

interface TuiShellContentProps extends TuiShellProps {
  readonly notify: (level: 'success' | 'warning' | 'error' | 'info', message: string) => void;
}

function TuiShellContent(props: TuiShellContentProps): ReactNode {
  const palette = TUI_SEMANTIC_PALETTES[DEFAULT_THEME];
  const { width, height } = useTerminalDimensions();
  const conversation = useConversation();
  const modal = useModal();
  const router = useKeyboardRouter();
  const topModal = useTopModal();
  const [view, setView] = useState<TuiView>('chat');
  const [connection, dispatchConnection] = useReducer(connectionReducer, undefined, initialConnectionState);
  const [workspace, setWorkspace] = useState<{ name: string; root?: string; branch?: string }>();
  const [agents, setAgents] = useState<Array<{ id: string; name: string; status: string; task?: string }>>([]);
  const [logs, setLogs] = useState<Array<{ id: string; label: string; detail: string; timestamp: string }>>([]);
  const [sessions, setSessions] = useState<readonly SessionSummary[]>([]);
  const [plans, setPlans] = useState<readonly { id: string; title: string; status: string }[]>([]);
  const [files, setFiles] = useState<readonly { path: string; status?: string }[]>([]);
  const [routing, setRouting] = useState<import('./types.js').RoutingSelection>();
  const [harnessThreads, setHarnessThreads] = useState<readonly HarnessThreadSummary[]>([]);
  const [harnessTask, setHarnessTask] = useState<HarnessTaskSnapshot>();
  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [notifications, setNotifications] = useState<Array<{ id: string; level: string; message: string }>>([]);

  const handleEvent = useCallback((event: TuiEvent) => {
    switch (event.type) {
      case 'connection':
        dispatchConnection({ type: 'set', state: event.state, message: event.message });
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
      case 'files':
        setFiles(event.files);
        break;
      case 'routing':
        setRouting(event.routing);
        break;
      case 'harness-threads':
        setHarnessThreads(event.threads);
        break;
      case 'harness-task':
        setHarnessTask(event.snapshot);
        break;
      case 'notification': {
        const id = `toast-${Date.now()}-${Math.random()}`;
        setNotifications((current) => [...current, { id, level: event.level, message: event.message }].slice(-3));
        setTimeout(() => setNotifications((current) => current.filter((item) => item.id !== id)), 3500);
        break;
      }
      case 'navigate':
        setView(event.view);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let mounted = true;
    void props.host
      .subscribe((event: TuiEvent) => {
        if (!mounted) return;
        handleEvent(event);
      })
      .then((unsubscribe) => {
        if (!mounted) unsubscribe();
        else dispose = unsubscribe;
      });
    return () => {
      mounted = false;
      dispose?.();
    };
  }, [props.host, handleEvent]);

  useEffect(() => {
    return router.register('view', (key) => {
      if (topModal.count > 0) return 'unhandled';
      if (key.ctrl && key.name === 'p') {
        modal.open(createCommandPaletteModal(palette, (command) => void props.host.controller.execute(command)));
        return handled();
      }
      if (key.ctrl && key.name === 'r') {
        modal.open(
          createRuntimeConfigModal(palette, routing, async (selection) => {
            const { controller } = props.host;
            if (selection.apiKey) {
              for await (const event of controller.setProviderCredential(selection.providerId, selection.apiKey)) {
                handleEvent(event);
              }
            }
            const agent = routing?.agents.find((agent) => agent.id === routing?.activeAgentId);
            if (agent) {
              for await (const event of controller.execute(
                `/routing select "${agent.id}" "${agent.role}" "${selection.providerId}" "${selection.modelId}"`,
              )) {
                handleEvent(event);
              }
            } else {
              throw new Error('Routing catalog is not available');
            }
          }),
        );
        return handled();
      }
      if (key.name === 'tab') {
        if (conversation.composerFocused) return 'unhandled';
        setView((current) => {
          const index = TUI_NAVIGATION.findIndex((item) => item.id === current);
          const next = TUI_NAVIGATION[(index + 1) % TUI_NAVIGATION.length];
          return (next?.id ?? 'chat') as TuiView;
        });
        return handled();
      }
      const digit = key.sequence;
      if (conversation.composerFocused) return 'unhandled';
      if (digit === '1') setView('chat');
      else if (digit === '2') setView('sessions');
      else if (digit === '3') setView('plans');
      else if (digit === '4') setView('graph');
      else if (digit === '5') setView('execution');
      else if (digit === '6') setView('workflow');
      else if (digit === '7') setView('logs');
      else if (digit === '8') setView('artifacts');
      else if (digit === '9') setView('settings');
      return 'unhandled';
    });
  }, [router, topModal.count, conversation.composerFocused, modal, palette, props.host, routing, handleEvent]);

  const shellLayout = computeShellLayout({ columns: width, rows: height });
  const showSidebar = shellLayout.showSidebar;
  const connectionPresentation = presentConnection(connection);
  const operational = isOperational(connection);

  const settingsModel: readonly SettingsEntry[] = [
    { id: 'workspace', label: 'Workspace', value: workspace?.name ?? 'Not connected', description: workspace?.root },
    { id: 'connection', label: 'Connection', value: connectionPresentation.label },
    { id: 'provider', label: 'Provider', value: routing?.roles.developer?.providerId ?? 'Not configured' },
    { id: 'model', label: 'Model', value: routing?.roles.developer?.modelId ?? 'Not configured' },
    { id: 'theme', label: 'Theme', value: DEFAULT_THEME },
    { id: 'sessions', label: 'Sessions', value: String(sessions.length) },
  ];
  const settingsToRender = settingsModel;
  const artifactModel: readonly ArtifactSummary[] = files.map((file) => ({
    id: `artifact-${file.path}`,
    name: file.path.split('/').at(-1) ?? file.path,
    kind: 'file',
    status: file.status ?? 'present',
  }));

  return (
    <ModalHost palette={palette} onRequestOpen={() => {}} router={router}>
      <box flexDirection="column" height={height} width={width} backgroundColor={palette.background}>
        <ShellHeader palette={palette} workspace={workspace} connection={connection.name} activeView={view} />
        {!operational ? (
          <box paddingLeft={1} paddingRight={1}>
            <StatusMessage
              palette={palette}
              tone={connectionPresentation.tone}
              label={connectionPresentation.label}
              description={connectionPresentation.description}
            />
          </box>
        ) : null}
        <box flexGrow={1} flexDirection="row">
          {showSidebar && <Navigation active={view} palette={palette} onSelect={(id) => setView(id as TuiView)} />}
          <box flexGrow={1} paddingLeft={1} paddingRight={1} paddingTop={1}>
            {view === 'chat' && <ChatView palette={palette} />}
            {view === 'sessions' && (
              <SessionsView sessions={sessions} palette={palette} onNewSession={() => setView('chat')} />
            )}
            {view === 'plans' && (
              <ListView
                title="Plans"
                palette={palette}
                rows={plans.map((plan) => ({ id: plan.id, title: plan.title, status: plan.status }))}
                empty="No plans yet."
                emptyDescription="Plans appear here when you start a planning request."
                emptyAction={{ label: 'Start a conversation', onPress: () => setView('chat') }}
              />
            )}
            {view === 'logs' && <LogsView logs={logs} palette={palette} />}
            {view === 'graph' && (
              <ListView
                title="Graph"
                palette={palette}
                rows={agents.map((agent) => ({ id: agent.id, title: agent.name, status: agent.status }))}
                empty="No graph entities yet."
                emptyDescription="Agents and relationships appear here during execution."
              />
            )}
            {view === 'execution' && (
              <ExecutionView
                palette={palette}
                threads={harnessThreads}
                selectedThreadId={selectedThreadId}
                snapshot={harnessTask}
                onSelectThread={(threadId) => {
                  if (threadId === 'chat') {
                    setView('chat');
                    return;
                  }
                  setSelectedThreadId(threadId);
                  void (async () => {
                    for await (const event of props.host.controller.execute(`/exec ${threadId}`)) handleEvent(event);
                  })();
                }}
              />
            )}
            {view === 'workflow' && (
              <ListView
                title="Workflow"
                palette={palette}
                rows={[]}
                empty="No workflow projection yet."
                emptyDescription="Workflow stages appear here when a multi-step run is active."
                emptyAction={{ label: 'Go to Chat', onPress: () => setView('chat') }}
              />
            )}
            {view === 'artifacts' && <ArtifactsView palette={palette} artifacts={artifactModel} />}
            {view === 'settings' && <SettingsView palette={palette} entries={settingsToRender} />}
            {view === 'telemetry' && <LogsView logs={logs} palette={palette} />}
          </box>
          {showSidebar && (
            <ContextSidebar
              palette={palette}
              session={sessions[0]}
              routing={routing}
              files={files}
              agents={agents}
              connection={connection.name}
            />
          )}
        </box>
        <BottomArea
          palette={palette}
          connection={connection.name}
          activeAgent={routing?.agents.find((agent) => agent.id === routing.activeAgentId)?.name ?? agents[0]?.name}
          model={routing?.roles.developer?.modelId}
          router={router}
        />
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
              fg={
                toast.level === 'error' ? palette.error : toast.level === 'warning' ? palette.warning : palette.success
              }
            >
              {toast.message}
            </text>
          </box>
        ))}
      </box>
    </ModalHost>
  );
}
