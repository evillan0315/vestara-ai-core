/**
 * GA-TOOL-UX-001B — ToolObservationRenderer.
 *
 * Durable historical tool evidence for completed assistant messages.
 * Groups observations by operation (`operationId` falling back to
 * `toolCallId`) so one operation renders one card — a terminal observation
 * supersedes its running projection; a lone running projection renders only
 * when no terminal evidence arrived (aborted/detached turns).
 *
 * Dispatch: structured `read` observations render the Read card; everything
 * else renders the generic card. Unknown tools remain generic — never guessed.
 *
 * View Observation ≠ Open File: the expanded card shows PERSISTED historical
 * content only. Open File navigates the CURRENT workspace file via
 * `onOpenInEditor` and never replaces the historical content.
 *
 * Presentation only — no execution authority, no raw tool payloads (the
 * OpenCode Read wrapper is parsed server-side; this renderer consumes the
 * structured `read` detail).
 */

import { memo, useMemo, useState } from 'react';
import type { ToolObservation } from '@vestara/shared';
import { normalizeToolCategory, toolDisplayLabel } from './AssistantToolCard';
import { copyTextToClipboard } from './AssistantResponseActions';

export interface ToolObservationRendererProps {
  readonly observations: readonly ToolObservation[];
  /** Navigate the CURRENT workspace file (relative path). Never mutates historical content. */
  readonly onOpenInEditor?: (file: string) => void;
}

/** One operation → one card. Terminal evidence wins over a running projection. */
function groupByOperation(observations: readonly ToolObservation[]): ToolObservation[] {
  const byKey = new Map<string, ToolObservation>();
  const order: string[] = [];
  const isTerminal = (status: ToolObservation['status']) =>
    status === 'completed' || status === 'failed' || status === 'denied';
  for (const obs of observations) {
    const key = obs.operationId ?? obs.toolCallId;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, obs);
      order.push(key);
    } else if (isTerminal(obs.status) && !isTerminal(existing.status)) {
      byKey.set(key, obs);
    }
  }
  return order.map((key) => byKey.get(key) as ToolObservation);
}

function isReadObservation(obs: ToolObservation): boolean {
  return obs.observationKind === 'read' && !!obs.read;
}

function basename(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base || path;
}

function StatusIcon({ status }: { status: ToolObservation['status'] }) {
  if (status === 'running') {
    return (
      <span
        className="block h-2 w-2 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)] motion-reduce:animate-none animate-pulse"
        aria-hidden="true"
      />
    );
  }
  if (status === 'completed') {
    return (
      <svg
        className="h-3.5 w-3.5 text-emerald-400/90"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg
      className="h-3.5 w-3.5 text-red-400/90"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

/** "Lines 1–42 of 311", "Lines 1–42 · truncated", or null when unknown. */
function readRangeText(obs: ToolObservation): string | null {
  const detail = obs.read;
  if (!detail || obs.status !== 'completed') return null;
  const parts: string[] = [];
  if (detail.offset !== undefined && detail.lineCount !== undefined) {
    const end = detail.offset + Math.max(detail.lineCount - 1, 0);
    parts.push(detail.totalLines !== undefined ? `Lines ${detail.offset}–${end} of ${detail.totalLines}` : `Lines ${detail.offset}–${end}`);
  } else if (detail.totalLines !== undefined) {
    parts.push(`${detail.totalLines} lines`);
  }
  if (detail.contentTruncated) parts.push('truncated');
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Split persisted numbered content into (lineNumber, text) rows. Never parses XML. */
function numberedRows(preview: string): Array<{ n: string; text: string }> {
  return preview.split('\n').map((line) => {
    const match = /^(\d+): ?([\s\S]*)$/.exec(line);
    return match ? { n: match[1], text: match[2] } : { n: '', text: line };
  });
}

const ReadObservationCard = memo(function ReadObservationCard({
  obs,
  onOpenInEditor,
}: {
  obs: ToolObservation;
  onOpenInEditor?: (file: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const detail = obs.read!;
  const file = detail.file;
  const rangeText = readRangeText(obs);
  const isRequestContext = detail.fileProvenance === 'request-context';
  const rows = useMemo(
    () => (detail.contentPreview !== undefined ? numberedRows(detail.contentPreview) : null),
    [detail.contentPreview],
  );

  const stateLabel = obs.status === 'completed' ? 'Completed' : obs.status === 'failed' ? 'Failed' : 'Reading…';
  const collapsedLabel =
    obs.status === 'running' ? `Reading ${file}…` : obs.status === 'failed' ? basename(file) : basename(file);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyTextToClipboard(detail.contentPreview ?? '');
    setCopied(ok);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenInEditor?.(file);
  };

  return (
    <div
      data-testid="tool-observation"
      data-kind="read"
      data-state={obs.status}
      className="min-w-0 rounded-lg border border-zinc-800/70 bg-zinc-900/40"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} read observation for ${file}`}
        data-testid="read-observation-toggle"
        className="flex w-full min-w-0 items-start gap-2 px-2.5 py-2 text-left transition-colors hover:bg-zinc-800/40 cursor-pointer"
      >
        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
          <StatusIcon status={obs.status} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[12px] font-medium text-zinc-200">Read</span>
            <span className="truncate text-[12px] text-zinc-400 font-mono">{collapsedLabel}</span>
            {isRequestContext && (
              <span className="shrink-0 rounded-full border border-zinc-700/60 px-1.5 py-px text-[9px] text-zinc-500">
                Request context
              </span>
            )}
          </span>
          {obs.status === 'completed' && (
            <span className="mt-0.5 block truncate text-[11px] text-zinc-600 font-mono">{file}</span>
          )}
          {rangeText && <span className="mt-0.5 block text-[11px] text-zinc-600">{rangeText}</span>}
          {obs.status === 'failed' && detail.error && (
            <span className="mt-0.5 block text-[11px] leading-snug text-red-400/70 break-words">{detail.error}</span>
          )}
        </span>
        <svg
          className={`mt-1 h-3 w-3 shrink-0 text-zinc-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800/70 px-2.5 py-2" data-testid="read-observation-content">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[12px] font-semibold text-zinc-200">Read</span>
            <span
              className={`rounded-full px-1.5 py-px text-[9px] font-medium ${
                obs.status === 'completed'
                  ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-300/90'
                  : obs.status === 'failed'
                    ? 'border border-red-500/25 bg-red-500/10 text-red-300/90'
                    : 'border border-amber-500/25 bg-amber-500/10 text-amber-300/90'
              }`}
            >
              {stateLabel}
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] text-zinc-400 font-mono" title={file}>
            {file}
          </div>
          {rangeText && <div className="mt-0.5 text-[11px] text-zinc-500">{rangeText}</div>}
          {rows && rows.length > 0 && (
            <div className="mt-2 overflow-x-auto rounded-md border border-zinc-800/70 bg-zinc-950/60">
              <table className="w-full border-collapse text-left">
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={index} className="border-b border-zinc-800/40 last:border-0">
                      <td className="w-10 shrink-0 select-none px-2 py-px text-right align-top font-mono text-[11px] text-zinc-600">
                        {row.n}
                      </td>
                      <td className="whitespace-pre-wrap break-words px-2 py-px align-top font-mono text-[11px] text-zinc-300">
                        {row.text}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rows && rows.length === 0 && (
            <div className="mt-2 text-[11px] text-zinc-600">Empty file.</div>
          )}
          {obs.status === 'completed' && detail.contentTruncated && (
            <div className="mt-1.5 text-[11px] text-zinc-500">Observation truncated</div>
          )}
          {obs.status === 'failed' && detail.error && (
            <div className="mt-1.5 text-[11px] leading-snug text-red-400/70 break-words">{detail.error}</div>
          )}
          <div className="mt-2 flex items-center gap-2">
            {rows && (
              <button
                type="button"
                onClick={handleCopy}
                data-testid="read-observation-copy"
                aria-label="Copy persisted observation content"
                className="rounded-md border border-zinc-700/60 bg-zinc-800/50 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100 cursor-pointer"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpen}
              data-testid="read-observation-open"
              aria-label={`Open current file ${file}`}
              title="Open the current workspace file (historical content above is unchanged)"
              className="rounded-md border border-zinc-700/60 bg-zinc-800/50 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700/60 hover:text-zinc-100 cursor-pointer"
            >
              Open File
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

const GenericObservationCard = memo(function GenericObservationCard({ obs }: { obs: ToolObservation }) {
  const category = normalizeToolCategory(obs.toolName);
  const label = toolDisplayLabel(category, obs.toolName);
  return (
    <div
      data-testid="tool-observation"
      data-kind="generic"
      data-state={obs.status}
      data-tool={obs.toolName}
      className="flex min-w-0 items-start gap-2 px-1.5 py-1.5"
    >
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <StatusIcon status={obs.status} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-zinc-400">
          {label}
          <span className="ml-1.5 font-mono text-[10px] text-zinc-600">{obs.toolName}</span>
        </div>
        {obs.status === 'completed' && obs.content && (
          <div className="mt-0.5 text-[11px] leading-snug text-zinc-600 break-words line-clamp-2 font-mono">
            {obs.content}
          </div>
        )}
        {obs.status === 'failed' && (
          <div className="mt-0.5 text-[11px] leading-snug text-red-400/60 break-words">
            {obs.error ?? obs.content ?? 'failed'}
          </div>
        )}
      </div>
    </div>
  );
});

export const ToolObservationRenderer = memo(function ToolObservationRenderer({
  observations,
  onOpenInEditor,
}: ToolObservationRendererProps) {
  const grouped = useMemo(() => groupByOperation(observations), [observations]);
  if (grouped.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1.5" data-testid="tool-observation-list">
      {grouped.map((obs) =>
        isReadObservation(obs) ? (
          <ReadObservationCard
            key={obs.operationId ?? obs.toolCallId}
            obs={obs}
            onOpenInEditor={onOpenInEditor}
          />
        ) : (
          <GenericObservationCard key={obs.operationId ?? obs.toolCallId} obs={obs} />
        ),
      )}
    </div>
  );
});
