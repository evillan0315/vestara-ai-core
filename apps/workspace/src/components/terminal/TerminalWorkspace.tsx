import { useCallback, useEffect, useRef, useState } from 'react';
import { TerminalEmptyState } from './TerminalEmptyState';
import { clearTerminal, TerminalPane, writelnToTerminal, writeToTerminal } from './TerminalPane';
import { TerminalStatusBar } from './TerminalStatusBar';
import { TerminalTabs } from './TerminalTabs';
import { useTerminalSessions } from './useTerminalSessions';

export default function TerminalWorkspace() {
  const {
    sessions,
    activeId,
    activeSession,
    addSession,
    removeSession,
    renameSession,
    setActive,
    setSessionStatus,
    setProcessStatus,
    setCwd,
  } = useTerminalSessions();

  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [uptime, setUptime] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const lineBufRef = useRef<Record<string, string>>({});
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startUptime = useCallback(() => {
    if (uptimeRef.current) clearInterval(uptimeRef.current);
    setUptime(0);
    uptimeRef.current = setInterval(() => setUptime((p) => p + 1), 1000);
  }, []);

  const stopUptime = useCallback(() => {
    if (uptimeRef.current) {
      clearInterval(uptimeRef.current);
      uptimeRef.current = null;
    }
    setUptime(0);
  }, []);

  const connectWs = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnectCount(0);
      ws.send(JSON.stringify({ op: 'subscribe', channels: ['workspace'] }));
      startUptime();
    };

    ws.onclose = () => {
      setConnected(false);
      stopUptime();
      setReconnectCount((c) => c + 1);
      setTimeout(connectWs, 3000);
    };

    ws.onerror = () => setConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.op === 'output' && msg.sessionId && msg.text) {
          writeToTerminal(msg.sessionId, msg.text);
        } else if (msg.op === 'prompt' && msg.sessionId) {
          writelnToTerminal(msg.sessionId, '');
          lineBufRef.current[msg.sessionId] = '';
        } else if (msg.op === 'stdout' && msg.sessionId) {
          writeToTerminal(msg.sessionId, msg.text);
        } else if (msg.op === 'stderr' && msg.sessionId) {
          writeToTerminal(msg.sessionId, `\x1b[31m${msg.text}\x1b[0m`);
        } else if (msg.op === 'exit' && msg.sessionId) {
          setProcessStatus(msg.sessionId, 'completed', msg.code ?? 0);
        } else if (msg.op === 'cwd' && msg.sessionId && msg.cwd) {
          setCwd(msg.sessionId, msg.cwd);
        }
      } catch {}
    };
  }, [startUptime, stopUptime, setProcessStatus, setCwd]);

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      stopUptime();
    };
  }, []);

  const execLocalCommand = useCallback(
    (sessionId: string, cmd: string) => {
      const args = cmd.split(/\s+/);
      const main = args[0].toLowerCase();
      if (main === 'help') {
        writelnToTerminal(sessionId, '');
        writelnToTerminal(sessionId, 'Available commands:');
        writelnToTerminal(sessionId, '  help          Show this help');
        writelnToTerminal(sessionId, '  clear         Clear terminal');
        writelnToTerminal(sessionId, '  echo <text>   Print text');
        writelnToTerminal(sessionId, '  date          Show current date/time');
        writelnToTerminal(sessionId, '  whoami        Show user');
        writelnToTerminal(sessionId, '  uptime        Show connection uptime');
        writelnToTerminal(sessionId, '  status        Show connection status');
        writelnToTerminal(sessionId, '  health        Show system health');
      } else if (main === 'clear') {
        clearTerminal(sessionId);
      } else if (main === 'echo') {
        writelnToTerminal(sessionId, args.slice(1).join(' '));
      } else if (main === 'date') {
        writelnToTerminal(sessionId, new Date().toString());
      } else if (main === 'whoami') {
        writelnToTerminal(sessionId, 'developer');
      } else if (main === 'uptime') {
        writelnToTerminal(sessionId, `Uptime: ${uptime}s`);
      } else if (main === 'status') {
        writelnToTerminal(sessionId, `Connected: ${connected}`);
        writelnToTerminal(sessionId, `Reconnects: ${reconnectCount}`);
        writelnToTerminal(sessionId, `Uptime: ${uptime}s`);
      } else if (main === 'health') {
        writelnToTerminal(sessionId, 'Vestara Terminal');
        writelnToTerminal(sessionId, `  Backend: ${connected ? 'connected' : 'disconnected'}`);
        writelnToTerminal(sessionId, `  Shell: bash (local mode)`);
        writelnToTerminal(sessionId, `  Session: ${sessionId.slice(0, 12)}...`);
      } else {
        writelnToTerminal(sessionId, `Command not found: ${main}`);
      }
      setProcessStatus(sessionId, 'completed', 0);
      writeToTerminal(sessionId, '\r\n$ ');
    },
    [connected, reconnectCount, uptime, setProcessStatus],
  );

  const handleTerminalData = useCallback(
    (sessionId: string, data: string) => {
      const buf = lineBufRef.current[sessionId] || '';
      let lastCr = false;
      for (const ch of data) {
        if (ch === '\n' && lastCr) {
          lastCr = false;
          continue;
        }
        lastCr = ch === '\r';
        if (ch === '\r' || ch === '\n') {
          const cmd = buf.trim();
          if (cmd) {
            setProcessStatus(sessionId, 'running');
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ op: 'repl', command: cmd, sessionId }));
            } else {
              execLocalCommand(sessionId, cmd);
            }
          } else {
            writeToTerminal(sessionId, '\r\n$ ');
          }
          lineBufRef.current[sessionId] = '';
        } else if (ch === '\x7f') {
          lineBufRef.current[sessionId] = buf.slice(0, -1);
        } else {
          lineBufRef.current[sessionId] = (lineBufRef.current[sessionId] || '') + ch;
        }
      }
    },
    [setProcessStatus, execLocalCommand],
  );

  const handleNewSession = useCallback(() => {
    const id = addSession('bash', '~');
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 'create_terminal', sessionId: id }));
    }
    setSessionStatus(id, 'connected');
  }, [addSession, setSessionStatus]);

  const handleCloseSession = useCallback(
    (id: string) => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: 'kill_terminal', sessionId: id }));
      }
      removeSession(id);
    },
    [removeSession],
  );

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] bg-zinc-950 border border-(--vestara-accent-border) rounded-xl overflow-hidden">
      {sessions.length > 0 && (
        <TerminalTabs
          sessions={sessions}
          activeId={activeId}
          onSelect={setActive}
          onClose={handleCloseSession}
          onAdd={handleNewSession}
          onRename={renameSession}
        />
      )}

      <div className="flex-1 min-h-0 overflow-hidden" key={activeId || 'empty'}>
        {activeSession ? (
          <div className="w-full h-full">
            <TerminalPane sessionId={activeSession.id} onData={(data) => handleTerminalData(activeSession.id, data)} />
          </div>
        ) : (
          <TerminalEmptyState onNewSession={handleNewSession} />
        )}
      </div>

      <TerminalStatusBar
        session={activeSession}
        connected={connected}
        reconnectCount={reconnectCount}
        uptime={uptime}
      />
    </div>
  );
}
