/**
 * GA-TERM-001 Phase 3 — terminal inspector.
 *
 * Contextual inspector using actual available session state from the
 * terminal registry. Only shows sections backed by authority.
 *
 * Inspectors are contextual — they reflect runtime state, not UI state.
 * Environment values are redacted: never expose secrets, tokens, or
 * private environment values.
 */

import type { TerminalSession } from './types';

interface TerminalInspectorProps {
  session: TerminalSession | null;
  sessions: readonly TerminalSession[];
  onReconnect: (id: string) => void;
  onClear: (id: string) => void;
}

export function TerminalInspector({
  session,
  sessions,
  onReconnect,
  onClear,
}: TerminalInspectorProps) {

  // Helper: safely format a value for display (redact secrets)
  const safeValue = (value: unknown): string => {
    if (value == null) return '—';
    if (typeof value === 'string') {
      // Redact common secrets patterns
      const redacted = value
        .replace(/[a-zA-Z0-9]{32,}/g, '••••••••••••••••••••••••••••••••') // long random strings
        .replace(/[a-zA-Z0-9]{20,}:[a-zA-Z0-9]{20,}/g, '••••••••••••••••••••••••••••••••:••••••••••••••••••••••••'); // key:value
      return redacted || '—';
    }
    return String(value);
  };

  return (
    <div className="space-y-2 p-4 bg-[var(--vestara-surface-panel)] border-t border-[var(--vestara-accent-border)] min-w-[280px]">
      {session && (
        <>
          {/* SESSION section */}
          <div className="border-b border-[var(--vestara-accent-border-border)] pb-2 mb-2">
            <h3 className="text-[var(--vestara-text-sm)] font-medium text-[var(--vestara-text)] mb-1">
              Session
            </h3>
            <div className="grid grid-cols-2 gap-1 text-[var(--vestara-text-2)] text-xs">
              <div>
                <span className="font-medium text-[var(--vestara-text-dim)]">ID</span>
                <span>{session.id}</span>
              </div>
              <div>
                <span className="font-medium text-[var(--vestara-text-dim)]">Shell</span>
                <span>{session.shell}</span>
              </div>
              <div>
                <span className="font-medium text-[var(--vestara-text-dim)]">Status</span>
                <span className={[
                  'text-[var(--vestara-text)]',
                  session.status === 'connecting' && 'var(--vestara-status-pending)',
                  session.status === 'disconnected' && 'var(--vestara-status-error)',
                  session.status === 'error' && 'var(--vestara-status-error)',
                ].join(' ')}>{session.status}</span>
              </div>
              <div>
                <span className="font-medium text-[var(--vestara-text-dim)]">PID</span>
                <span>{session.processId || '—'}</span>
              </div>
              <div>
                <span className="font-medium text-[var(--vestara-text-dim)]">Created</span>
                <span>
                  {new Date(session.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* WORKING DIRECTORY section */}
          {session.cwd && (
            <div className="border-b border-[var(--vestara-accent-border-border)] pb-2 mb-2">
              <h3 className="text-[var(--vestara-text-sm)] font-medium text-[var(--vestara-text)] mb-1">
                Working Directory
              </h3>
              <p className="text-[var(--vestara-text-2)] overflow-break-word whitespace-pre-wrap">{session.cwd}</p>
            </div>
          )}

          {/* CONNECTION section */}
          {session.status === 'connected' || session.status === 'connecting' && (
            <div className="border-b border-[var(--vestara-accent-border-border)] pb-2 mb-2">
              <h3 className="text-[var(--vestara-text-sm)] font-medium text-[var(--vestara-text)] mb-1">
                Connection
              </h3>
              <div className="grid grid-cols-2 gap-1 text-[var(--vestara-text-2)] text-xs">
                <div>
                  <span className="font-medium text-[var(--vestara-text-dim)]">State</span>
                  <span>{session.status}</span>
                </div>
                <div>
                  <span className="font-medium text-[var(--vestara-text-dim)]">Transport</span>
                  <span>WebSocket / ws:/terminal</span>
                </div>
              </div>
            </div>
          )}

          {/* ENVIRONMENT section - only safe metadata */}
          {session.processStatus === 'running' && (
            <div className="border-b border-[var(--vestara-accent-border-border)] pb-2 mb-2">
              <h3 className="text-[var(--vestara-text-sm)] font-medium text-[var(--vestara-text)] mb-1">
                Environment
              </h3>
              <p className="text-[var(--vestara-text-2)] text-xs italic">
                Session runtime environment — sensitive values redacted
              </p>
            </div>
          )}

          {/* QUICK ACTIONS section */}
          <div>
            <h3 className="text-[var(--vestara-text-sm)] font-medium text-[var(--vestara-text)] mb-1">
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-1 text-[var(--vestara-text-2)] text-xs">
              <div>
                <span className="font-semibold cursor-pointer" onClick={() => onReconnect(session.id)}>
                  Reconnect
                </span>
              </div>
              <div>
                <span className="font-semibold cursor-pointer" onClick={() => onClear(session.id)}>
                  Clear
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* No session state */}
      {!session && (
        <div className="text-[var(--vestara-text-muted)] text-center py-8">
          No active session
        </div>
      )}
    </div>
  );
}
