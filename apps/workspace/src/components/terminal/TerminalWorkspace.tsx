/**
 * GA-TERM-001 Phase 3 — real terminal workspace.
 *
 * Each tab is a server session (`POST /api/terminal/sessions`); the active
 * tab holds one WebSocket to `/ws/terminal?sessionId=…` carrying raw frames:
 * client `{op:'input'|'interrupt'|'resize'|'ping'}` → server
 * `{op:'stdout'|'stderr'|'cwd'|'exit'|'error'}`. The backend `bash` owns the
 * prompt and echo discipline except keystroke echo: piped stdio has no tty
 * line discipline, so `TerminalPane` echoes locally and this workspace
 * forwards complete lines (plus Ctrl-C/Ctrl-D control handling).
 *
 * Detaching (tab switch, socket drop) never kills the session — only the
 * tab ×, idle timeout, lifetime deadline, or server shutdown does.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ForwardedRef } from 'react';
import OperationalWorkspaceLayout from '../../layouts/OperationalWorkspaceLayout';
import { TerminalEmptyState } from './TerminalEmptyState';
import { TerminalInspector } from './TerminalInspector';
import TerminalPane, { clearTerminal, writelnToTerminal, writeToTerminal } from './TerminalPane';
import { TerminalStatusBar } from './TerminalStatusBar';
import { TerminalTabs } from './TerminalTabs';
import { TerminalToolbar } from './TerminalToolbar';
import { useTerminalSessions } from './useTerminalSessions';
import { resolveWsUrl } from '../../lib/clientConfig';

/**
 * Imperative session actions for hosts that render the workspace's toolbar
 * elsewhere (e.g. a drawer header). All actions guard internally and are
 * safe to call without an active session.
 */
export interface TerminalWorkspaceApi {
  readonly newSession: () => void;
  readonly clearActive: () => void;
  readonly killActive: () => void;
}

function TerminalWorkspaceInner(
  { hideToolbar = false }: { readonly hideToolbar?: boolean },
  ref: ForwardedRef<TerminalWorkspaceApi>,
) {
  const {
    sessions,
    activeId,
    activeSession,
    error: sessionError,
    addSession,
    removeSession,
    renameSession,
    setActive,
    setSessionStatus,
    setProcessStatus,
    setCwd,
  } = useTerminalSessions();

  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState(0);
  // Sessions backed by the pty driver echo in-kernel: raw passthrough, no
  // line buffering, no local echo. Spawn sessions keep line discipline.
  const [ptySessions, setPtySessions] = useState<Readonly<Record<string, boolean>>>({});
  const ptySessionsRef = useRef<Record<string, boolean>>({});
  const isPty = activeId !== null && ptySessions[activeId] === true;
  const wsRef = useRef<WebSocket | null>(null);
  const lineBufRef = useRef<Record<string, string>>({});
  const uptimeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopUptime = useCallback(() => {
    if (uptimeRef.current) {
      clearInterval(uptimeRef.current);
      uptimeRef.current = null;
    }
    setUptime(0);
  }, []);

  const closeSocket = useCallback(() => {
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
    stopUptime();
  }, [stopUptime]);

  const connectSession = useCallback(
    (sessionId: string) => {
      closeSocket();
      setSessionStatus(sessionId, 'connecting');
      const ws = new WebSocket(resolveWsUrl(`/ws/terminal?sessionId=${encodeURIComponent(sessionId)}`));
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setSessionStatus(sessionId, 'connected');
        setUptime(0);
        if (uptimeRef.current) clearInterval(uptimeRef.current);
        uptimeRef.current = setInterval(() => setUptime((p) => p + 1), 1000);
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        wsRef.current = null;
        setConnected(false);
        stopUptime();
        setSessionStatus(sessionId, 'disconnected');
        // Reattach (never kill): the backend session survives socket drops.
        retryRef.current = setTimeout(() => connectSession(sessionId), 3000);
      };

      ws.onerror = () => {
        setSessionStatus(sessionId, 'error');
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as Record<string, unknown>;
          if (msg.op === 'stdout' && typeof msg.text === 'string') {
            writeToTerminal(sessionId, ptySessionsRef.current[sessionId] === true ? msg.text : msg.text.replace(/\r?\n/g, "\r\n"));
          } else if (msg.op === 'stderr' && typeof msg.text === 'string') {
            writeToTerminal(sessionId, `\x1b[31m${ptySessionsRef.current[sessionId] === true ? msg.text : msg.text.replace(/\r?\n/g, "\r\n")}\x1b[0m`);
          } else if (msg.op === 'cwd' && typeof msg.cwd === 'string') {
            setCwd(sessionId, msg.cwd);
          } else if (msg.op === 'driver' && (msg.driver === 'pty' || msg.driver === 'spawn')) {
            const pty = msg.driver === 'pty';
            ptySessionsRef.current[sessionId] = pty;
            setPtySessions((prev) => ({ ...prev, [sessionId]: pty }));
          } else if (msg.op === 'exit') {
            const code = typeof msg.code === 'number' ? msg.code : 0;
            setProcessStatus(sessionId, code === 0 ? 'completed' : 'failed', code);
            writelnToTerminal(sessionId, `\r\n[session ended · exit ${code}]`);
          } else if (msg.op === 'error' && typeof msg.error === 'string') {
            writelnToTerminal(sessionId, `\r\n\x1b[31m${msg.error}\x1b[0m`);
          }
        } catch {
          /* malformed frame — ignore */
        }
      };
    },
    [closeSocket, setCwd, setProcessStatus, setSessionStatus, stopUptime],
  );

  // One socket for the active tab; switching tabs detaches (session survives).
  useEffect(() => {
    if (activeId) connectSession(activeId);
    else closeSocket();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      stopUptime();
    };
    // connectSession/closeSocket are stable; activeId drives reconnection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const sendInput = useCallback((sessionId: string, data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ op: 'input', data }));
    } else {
      writelnToTerminal(sessionId, '\r\n[not connected — retrying…]');
    }
  }, []);

  const handleTerminalData = useCallback(
    (sessionId: string, data: string) => {
      if (ptySessions[sessionId] === true) {
        // Pty: raw passthrough — the kernel tty owns echo, line editing,
        // and signals (Ctrl-C/Ctrl-D arrive as bytes the tty interprets).
        // `clear` runs for real (terminfo present); nothing is local.
        setProcessStatus(sessionId, 'running');
        sendInput(sessionId, data);
        return;
      }
      for (const ch of data) {
        if (ch === '\x03') {
          // Ctrl-C: foreground interrupt via the backend process group.
          const ws = wsRef.current;
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'interrupt' }));
          writeToTerminal(sessionId, '^C\r\n');
          lineBufRef.current[sessionId] = '';
          setProcessStatus(sessionId, 'running');
        } else if (ch === '\x04') {
          // Ctrl-D: EOF on stdin (shell exits at prompt). Only when the line
          // is empty — otherwise ignore (no tty line editing to emulate).
          if (!lineBufRef.current[sessionId]) sendInput(sessionId, '\x04');
        } else if (ch === '\r' || ch === '\n') {
          const cmd = (lineBufRef.current[sessionId] || '').trim();
          lineBufRef.current[sessionId] = '';
          if (cmd === 'clear') {
            clearTerminal(sessionId);
          } else if (cmd === 'help') {
            // Display-only help; everything else executes in the backend shell.
            writelnToTerminal(sessionId, '');
            writelnToTerminal(sessionId, 'Vestara Terminal — real shell, workspace-scoped.');
            writelnToTerminal(sessionId, '  clear         Clear this view (display only)');
            writelnToTerminal(sessionId, '  Ctrl-C        Interrupt the foreground process');
            writelnToTerminal(sessionId, '  Ctrl-D        End input (exits the shell at prompt)');
            writelnToTerminal(sessionId, 'Everything else runs in bash under the workspace root.');
          } else if (cmd) {
            setProcessStatus(sessionId, 'running');
            // The pane already echoed the line; the backend echoes nothing
            // (piped stdio), so advance past it before the command output.
            writeToTerminal(sessionId, '\r\n');
            sendInput(sessionId, `${cmd}\n`);
          } else {
            // Empty line: the backend shell prints its own fresh prompt.
            sendInput(sessionId, '\n');
          }
        } else if (ch === '\x7f') {
          lineBufRef.current[sessionId] = (lineBufRef.current[sessionId] || '').slice(0, -1);
        } else if (ch >= ' ' || ch === '\t') {
          lineBufRef.current[sessionId] = (lineBufRef.current[sessionId] || '') + ch;
        }
      }
    },
    [ptySessions, sendInput, setProcessStatus],
  );

  const handleResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'resize', cols, rows }));
  }, []);

  const handleNewSession = useCallback(() => {
    void addSession();
  }, [addSession]);

  const handleCloseSession = useCallback(
    (id: string) => {
      if (wsRef.current && activeId === id) {
        wsRef.current.close();
        wsRef.current = null;
      }
      removeSession(id);
    },
    [activeId, removeSession],
  );

  const handleClearSession = useCallback(() => {
    if (activeSession) {
      clearTerminal(activeSession.id);
    }
  }, [activeSession]);

  const handleKillSession = useCallback(
    (id: string) => {
      if (window.confirm(`Kill terminal session ${id}?`)) {
        if (wsRef.current && activeId === id) {
          wsRef.current.close();
          wsRef.current = null;
        }
        removeSession(id);
      }
    },
    [activeId, removeSession],
  );

  useImperativeHandle(
    ref,
    () => ({
      newSession: () => handleNewSession(),
      clearActive: () => handleClearSession(),
      killActive: () => {
        if (activeId) handleKillSession(activeId);
      },
    }),
    [handleNewSession, handleClearSession, handleKillSession, activeId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <OperationalWorkspaceLayout context={<TerminalInspector session={activeSession} sessions={sessions} onReconnect={connectSession} onClear={clearTerminal} />} footer={<TerminalStatusBar session={activeSession} connected={connected} reconnectCount={0} uptime={uptime} />}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-[var(--vestara-accent-border)] rounded-xl">
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

      {!hideToolbar && (
        <TerminalToolbar
          activeSession={activeSession}
          onClear={handleClearSession}
          onKill={handleKillSession}
          onAddSession={handleNewSession}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden" key={activeId || 'empty'}>
        {activeSession ? (
          <div className="min-h-0 w-full flex-1">
            <TerminalPane
              sessionId={activeSession.id}
              onData={(data) => handleTerminalData(activeSession.id, data)}
              onResize={(cols, rows) => handleResize(cols, rows)}
              localEcho={!isPty}
            />
          </div>
        ) : (
          <TerminalEmptyState onNewSession={handleNewSession} />
        )}
      </div>

      {sessionError && (
        <div className="shrink-0 border-t border-[var(--vestara-status-error-border)] bg-[var(--vestara-status-error-bg)] px-3 py-1.5 text-[11px] text-[var(--vestara-status-error)]" role="alert">
          {sessionError}
        </div>
      )}

        </div>
      </OperationalWorkspaceLayout>
    </div>
  );
}

const TerminalWorkspace = forwardRef<TerminalWorkspaceApi, { readonly hideToolbar?: boolean }>(
  TerminalWorkspaceInner,
);
export default TerminalWorkspace;
