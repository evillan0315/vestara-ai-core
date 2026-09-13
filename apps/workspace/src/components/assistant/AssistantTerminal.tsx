/**
 * GA-UX-PREMIUM M6 — AssistantTerminal.
 *
 * Dedicated shell execution presentation consuming the authoritative
 * `assistant.execution.v1` terminal projection. Presentation-only:
 * command, output preview, exit code, duration — all from the bounded
 * projection; never reads repository state, never executes commands.
 *
 * Visual grammar: command with `$` prefix, bounded output preview,
 * exit code badge, duration, collapsed/expanded state. Sensitive
 * output (credentials, tokens) is redacted by the projection layer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalExecutionDetail } from '@vestara/shared';

// ─── Helpers ──────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = Math.round(seconds % 60);
  return `${minutes}m ${remainSec}s`;
}

function filenameOf(file: string): string {
  const segments = file.split('/');
  return segments[segments.length - 1] ?? file;
}

// ─── Component ────────────────────────────────────────────────

export interface AssistantTerminalProps {
  detail: TerminalExecutionDetail;
}

/**
 * M6: Terminal execution presentation. One card per shell operation.
 * Collapsed by default for long output; expandable on demand.
 * Running state shows a spinner; completed shows exit code + duration;
 * failed shows a visible error indicator.
 */
export function AssistantTerminal({ detail }: AssistantTerminalProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  // GA-TERM-001 Phase 2: client-observed elapsed clock for running commands.
  // Anchored when the card first renders in `running` — the contract carries
  // no started-at timestamp, so this is labeled as observed, never as
  // authoritative. Authoritative `durationMs` replaces it on completion.
  const runningSinceRef = useRef<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Scrollback stick-to-bottom: follows new output while running unless the
  // user scrolled up to read history.
  const outputRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const isRunning = detail.state === 'running';
  const isFailed = detail.state === 'failed';
  const hasOutput = typeof detail.outputPreview === 'string' && detail.outputPreview.length > 0;
  const hasExitCode = typeof detail.exitCode === 'number';
  const hasDuration = typeof detail.durationMs === 'number';
  const hasCwd = typeof detail.cwd === 'string' && detail.cwd.length > 0;

  useEffect(() => {
    if (!isRunning) {
      runningSinceRef.current = null;
      return;
    }
    if (runningSinceRef.current === null) runningSinceRef.current = Date.now();
    const id = window.setInterval(() => {
      if (runningSinceRef.current !== null) setElapsedMs(Date.now() - runningSinceRef.current);
    }, 250);
    return () => window.clearInterval(id);
  }, [isRunning]);

  // Follow live output to the bottom while expanded + running + user at bottom.
  useEffect(() => {
    if (!expanded || !isRunning || !stickRef.current) return;
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [expanded, isRunning, detail.outputPreview]);

  const handleScroll = useCallback(() => {
    const el = outputRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }, []);

  const handleCopy = useCallback(async (e: React.SyntheticEvent) => {
    // Never let code-action interaction bubble into a panel drag handler
    // (same contract as CodeBlock + AssistantResponseActions).
    e.stopPropagation();
    if (!hasOutput) return;
    const text = detail.outputPreview ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCopyFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (permissions) — textarea fallback.
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        setCopyFailed(false);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopyFailed(true);
        window.setTimeout(() => setCopyFailed(false), 2000);
      }
    }
  }, [hasOutput, detail.outputPreview]);

  // Determine exit code styling
  const exitCodeOk = hasExitCode && detail.exitCode === 0;
  const exitCodeFail = hasExitCode && detail.exitCode !== 0;

  return (
    <div
      data-testid="assistant-terminal"
      data-state={detail.state}
      className="min-w-0 rounded-xl border border-zinc-800/70 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40 overflow-hidden"
    >
      {/* Header: lifecycle + command + actions */}
      <div className="flex min-w-0 items-center gap-2 px-3 py-2">
        {/* Lifecycle indicator */}
        {isRunning ? (
          <span data-testid="terminal-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
            <svg className="h-3 w-3 text-amber-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        ) : isFailed ? (
          <span data-testid="terminal-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-[10px] leading-none text-red-400" aria-hidden="true">
            ✕
          </span>
        ) : (
          <span data-testid="terminal-lifecycle" className="flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-[10px] leading-none text-emerald-400" aria-hidden="true">
            ✓
          </span>
        )}

        {/* Command toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} terminal output`}
          className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
          data-testid="terminal-toggle"
        >
          <span aria-hidden="true" className="text-[10px] text-zinc-600 shrink-0">
            {expanded ? '▾' : '▸'}
          </span>
          <span className="text-[12px] leading-snug text-zinc-400 shrink-0">Bash</span>
          {detail.command ? (
            <span className="min-w-0 text-[12px] leading-snug truncate text-zinc-200 font-mono">
              <span className="text-zinc-500 select-none">$</span>{' '}
              {detail.command}
            </span>
          ) : (
            <span className="text-[12px] leading-snug text-zinc-500 italic">command</span>
          )}
        </button>

        {/* Metadata badges */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {hasExitCode && (
            <span
              data-testid="terminal-exit-code"
              className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium tabular-nums ${
                exitCodeOk
                  ? 'bg-emerald-500/10 text-emerald-400/90'
                  : exitCodeFail
                    ? 'bg-red-500/10 text-red-400/90'
                    : 'bg-zinc-800/60 text-zinc-500'
              }`}
            >
              exit {detail.exitCode}
            </span>
          )}
          {hasDuration && (
            <span data-testid="terminal-duration" className="text-[10px] text-zinc-600 tabular-nums">
              {formatDuration(detail.durationMs!)}
            </span>
          )}
          {isRunning && !hasDuration && (
            <span
              data-testid="terminal-elapsed"
              title="Client-observed elapsed — the authoritative duration replaces it on completion"
              className="text-[10px] text-amber-400/80 tabular-nums"
            >
              {formatDuration(elapsedMs)}
            </span>
          )}
        </div>
      </div>

      {/* Working directory */}
      {hasCwd && (
        <div className="flex min-w-0 items-center gap-2 px-3 pb-1.5 -mt-0.5">
          <span
            data-testid="terminal-cwd"
            title={detail.cwd}
            className="min-w-0 truncate text-[10px] leading-none text-zinc-600 font-mono"
          >
            {detail.cwd}
          </span>
        </div>
      )}

      {/* Output preview (expandable) — scrollback follows live output while
          running unless the user scrolled up; Copy never bubbles into a
          panel drag handler. */}
      {hasOutput && expanded && (
        <div data-testid="terminal-output" className="border-t border-zinc-800/70">
          <div className="flex items-center justify-end px-3 pt-1.5">
            <button
              type="button"
              onClick={handleCopy}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Copy terminal output"
              title="Copy output"
              className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-zinc-700/40 cursor-pointer"
            >
              {copyFailed ? 'Copy failed' : copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div ref={outputRef} onScroll={handleScroll} className="px-3 pb-2 max-h-64 overflow-y-auto">
            <pre className="text-[11px] leading-relaxed text-zinc-400 font-mono whitespace-pre-wrap break-words">
              {detail.outputPreview}
            </pre>
          </div>
        </div>
      )}

      {/* Collapsed output hint */}
      {hasOutput && !expanded && (
        <div className="px-3 pb-2 -mt-0.5">
          <span className="text-[10px] text-zinc-600 italic">
            {detail.outputPreview!.split('\n').length} lines of output
          </span>
        </div>
      )}

      {/* Running state indicator */}
      {isRunning && !hasOutput && (
        <div className="px-3 pb-2 -mt-0.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-amber-400/80 motion-reduce:animate-none animate-pulse">
            <span>●</span><span>●</span><span>●</span>
          </span>
        </div>
      )}
    </div>
  );
}
