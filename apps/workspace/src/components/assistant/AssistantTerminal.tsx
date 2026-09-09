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

import { useCallback, useState } from 'react';
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

  const isRunning = detail.state === 'running';
  const isFailed = detail.state === 'failed';
  const hasOutput = typeof detail.outputPreview === 'string' && detail.outputPreview.length > 0;
  const hasExitCode = typeof detail.exitCode === 'number';
  const hasDuration = typeof detail.durationMs === 'number';
  const hasCwd = typeof detail.cwd === 'string' && detail.cwd.length > 0;

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

      {/* Output preview (expandable) */}
      {hasOutput && expanded && (
        <div data-testid="terminal-output" className="border-t border-zinc-800/70 px-3 py-2 max-h-48 overflow-y-auto">
          <pre className="text-[11px] leading-relaxed text-zinc-400 font-mono whitespace-pre-wrap break-words">
            {detail.outputPreview}
          </pre>
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
