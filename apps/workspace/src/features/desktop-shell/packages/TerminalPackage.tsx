/**
 * VES-UI-001 T6: Terminal Package
 *
 * Live terminal surface promoted from the v2 prototype transcript
 * (`assets/templates/html/v2/start/workspace-ui-v2/src/packages/Terminal.tsx`).
 * Sessions stream over `/ws/terminal` via `useTerminalPackage`; the fixture
 * transcript renders only while the API is unreachable (SNAPSHOT).
 * Never hardcoded arrays in JSX.
 *
 * Visual roles bind to the scoped `--ds-*` layer, never hex literals.
 *
 * Architecture Traceability:
 *   VES-UI-001: Workspace UI v2 Desktop Shell (T6 Terminal live surface)
 *   @see docs/plans/VES-UI-001-workspace-ui-v2-desktop-shell-plan.md §6
 */

import { useState } from 'react';
import { useTerminalPackage } from './useTerminalPackage';
import '../desktop-shell.tokens.css';

export function TerminalPackage() {
  const { sessions, activeId, lines, isLoading, isLive, connected, error, createSession, selectSession, send } =
    useTerminalPackage();
  const [draft, setDraft] = useState('');
  const active = sessions.find((session) => session.id === activeId) ?? null;

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-[var(--vestara-spacing-2)] border-b border-[var(--ds-border)] px-[var(--vestara-spacing-3)]">
        <div className="flex min-w-0 items-center gap-[var(--vestara-spacing-2)]">
          <span className="text-[length:var(--vestara-font-size-xs)] tracking-[0.12em] text-[var(--ds-text-muted)]">
            TERMINAL · SHELL SESSIONS
          </span>
          <span className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)]">
            {isLive ? (connected ? 'LIVE' : 'CONNECTING') : 'SNAPSHOT'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void createSession()}
          className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
        >
          New session
        </button>
      </div>
      {sessions.length > 1 ? (
        <div className="flex shrink-0 gap-[var(--vestara-spacing-1)] overflow-x-auto border-b border-[var(--ds-border)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)]" role="tablist" aria-label="Terminal sessions">
          {sessions.map((session) => {
            const selected = session.id === activeId;
            return (
              <button
                key={session.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectSession(session.id)}
                className={`rounded-[var(--vestara-radius-md)] border px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] ${
                  selected
                    ? 'border-[var(--ds-accent)] bg-[var(--ds-accent-bg)] text-[var(--ds-accent)]'
                    : 'border-[var(--ds-border)] bg-[var(--ds-surface-bg)] text-[var(--ds-text-muted)]'
                }`}
              >
                {session.name} · {session.cwd}
              </button>
            );
          })}
        </div>
      ) : null}
      <div
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        aria-busy={isLoading}
        className="min-h-0 flex-1 space-y-[var(--vestara-spacing-1)] overflow-auto bg-[var(--ds-surface-bg)] p-[var(--vestara-spacing-3)] text-[length:var(--vestara-font-size-xs)] leading-relaxed [font-family:var(--ds-font-mono)]"
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className={
              line.kind === 'input'
                ? 'text-[var(--ds-text-muted)]'
                : line.kind === 'status'
                  ? 'text-[var(--ds-accent)]'
                  : 'text-[var(--ds-text-secondary)]'
            }
          >
            {line.text}
          </div>
        ))}
      </div>
      <form
        className="flex shrink-0 items-center gap-[var(--vestara-spacing-2)] border-t border-[var(--ds-border)] bg-[var(--ds-surface-panel)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-2)]"
        onSubmit={(event) => {
          event.preventDefault();
          send(draft);
          setDraft('');
        }}
      >
        <span aria-hidden="true" className="text-[length:var(--vestara-font-size-sm)] text-[var(--ds-accent)]">
          ➜
        </span>
        <span className="hidden truncate text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)] sm:inline">
          {active ? `${active.name}@${active.cwd}` : 'shell'}
        </span>
        <label htmlFor="ds-terminal-input" className="sr-only">
          Terminal input
        </label>
        <input
          id="ds-terminal-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={connected ? 'Type a command…' : 'Snapshot — start the API for live execution'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)] [font-family:var(--ds-font-mono)]"
        />
        <button
          type="submit"
          className="rounded-[var(--vestara-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-bg)] px-[var(--vestara-spacing-2)] py-px text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-secondary)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-text)]"
        >
          Send
        </button>
      </form>
      {error ? (
        <div role="note" className="shrink-0 border-t border-[var(--ds-border)] px-[var(--vestara-spacing-3)] py-[var(--vestara-spacing-1)] text-[length:var(--vestara-font-size-xs)] text-[var(--ds-text-muted)]">
          Terminal snapshot incomplete · {error}
        </div>
      ) : null}
    </div>
  );
}
