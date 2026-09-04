/**
 * GA-UX-PREMIUM M2 — AssistantToolCard + AssistantExecutionTimeline.
 *
 * Reusable tool presentation primitives. They project runtime activity that
 * the existing browser-facing SSE contract already delivers (tool name,
 * chunk-type lifecycle, bounded result preview, verbatim status string).
 * They are NEVER tool-execution authority and manufacture no structured
 * detail: no diffs, no task lists, no exit codes, no durations, no
 * verification verdicts, no permission decisions (those need M3 payloads).
 *
 * Visual grammar: icon + operation + secondary detail + state. Restrained
 * semantic iconography, quiet completed rows, one subtle running indicator.
 * `waiting_permission` is reserved for M3/GA-CAP-002 and is intentionally
 * absent here — today's contract collapses permission asks into status text.
 */

import type { AssistantToolOperation, StructuredEditOperation } from '../../hooks/useAssistantConversation';
import { AssistantCodeEdit } from './AssistantCodeEdit';

// ─── Categories ─────────────────────────────────────────────────

export type ToolCategory = 'read' | 'search' | 'list' | 'edit' | 'bash' | 'task' | 'generic';

/**
 * Normalize a wire tool name into a presentation category.
 * Pure string matching on the delivered name — never invents detail.
 * Unknown tools fall through to `generic`, which displays the raw name.
 */
export function normalizeToolCategory(name: string): ToolCategory {
  const n = name.toLowerCase();
  if (/(^|[^a-z])(read|cat|open)([^a-z]|$)/.test(n) || n.includes('read')) return 'read';
  if (n.includes('grep') || n.includes('search') || n.includes('find') || n.includes('rg')) return 'search';
  if (n.includes('glob') || n.includes('list') || n.includes('ls') || n.includes('dir') || n.includes('glob')) return 'list';
  if (n.includes('edit') || n.includes('write') || n.includes('apply') || n.includes('patch')) return 'edit';
  if (n.includes('bash') || n.includes('exec') || n.includes('shell') || n.includes('terminal') || n.includes('command') || /(^|[^a-z])run([^a-z]|$)/.test(n)) return 'bash';
  if (n.includes('todo') || n.includes('task')) return 'task';
  return 'generic';
}

/** Display label. Generic shows the raw wire name (escaped by React) — never guessed. */
export function toolDisplayLabel(category: ToolCategory, rawName: string): string {
  switch (category) {
    case 'read':
      return 'Read';
    case 'search':
      return 'Search';
    case 'list':
      return 'List';
    case 'edit':
      return 'Edit';
    case 'bash':
      return 'Bash';
    case 'task':
      return 'Task';
    case 'generic':
      return rawName.trim() ? rawName.trim() : 'Tool';
  }
}

// ─── Icons (restrained, monochrome) ─────────────────────────────

function CategoryIcon({ category }: { category: ToolCategory }) {
  const cls = 'w-3.5 h-3.5 text-zinc-600 shrink-0';
  const common = { className: cls, fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 2 } as const;
  switch (category) {
    case 'read':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
    case 'list':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
    case 'bash':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'task':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      );
    case 'generic':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        </svg>
      );
  }
}

// ─── Tool card ──────────────────────────────────────────────────

export interface AssistantToolCardProps {
  operation: AssistantToolOperation;
}

/**
 * One projected tool operation. Completed rows are visually quiet; the
 * running row carries the single subtle activity indicator. Previews render
 * as plain text (React-escaped, bounded, never raw HTML) and are labeled a
 * preview — never complete output.
 */
export function AssistantToolCard({ operation }: AssistantToolCardProps) {
  const category = normalizeToolCategory(operation.name);
  const label = toolDisplayLabel(category, operation.name);
  const { state, preview } = operation;

  return (
    <div
      data-testid="assistant-tool-card"
      data-tool={operation.name}
      data-state={state}
      data-category={category}
      className="flex items-start gap-2 py-1 min-w-0"
    >
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        {state === 'running' ? (
          <span className="block h-1.5 w-1.5 rounded-full bg-amber-500 motion-reduce:animate-none animate-pulse" />
        ) : state === 'completed' ? (
          <span className="text-[11px] leading-none text-emerald-500/80">✓</span>
        ) : (
          <span className="text-[11px] leading-none text-red-400/80">✕</span>
        )}
      </span>
      <CategoryIcon category={category} />
      <div className="min-w-0 flex-1">
        <div className={`text-[12px] leading-snug truncate ${state === 'failed' ? 'text-red-300/90' : 'text-zinc-400'}`}>
          {label}
          {state === 'running' && (
            <span className="ml-1.5 text-[10px] text-zinc-600 motion-reduce:animate-none animate-pulse">…</span>
          )}
        </div>
        {state !== 'running' && preview && (
          <div
            data-testid="assistant-tool-preview"
            className="mt-0.5 text-[11px] leading-snug text-zinc-600 break-words line-clamp-2"
          >
            {preview}
          </div>
        )}
        {state === 'failed' && !preview && (
          <div className="mt-0.5 text-[11px] leading-snug text-red-400/60">failed</div>
        )}
      </div>
    </div>
  );
}

// ─── Execution timeline ─────────────────────────────────────────

export interface AssistantExecutionTimelineProps {
  operations: AssistantToolOperation[];
  /**
   * Structured edit projections (GA-UX-PREMIUM M4A). A structured edit
   * supersedes the generic M2 row for the same operation identity (one
   * operation, one presentation); standalone structured edits render too.
   */
  structuredEdits?: readonly StructuredEditOperation[];
  /** Collapsed once response generation begins; user-expandable. */
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Compact execution observability. Expanded during tool execution;
 * collapsed to `▸ N operations` once the final response starts streaming.
 * Transient presentation only — never persisted as Conversation messages.
 * The toggle is a native button (keyboard accessible, aria-expanded);
 * lifecycle changes announce through the existing bounded `role="status"`
 * line owned by ActiveTurn, never per-card live regions.
 */
export function AssistantExecutionTimeline({
  operations,
  structuredEdits = [],
  expanded,
  onToggle,
}: AssistantExecutionTimelineProps) {
  if (operations.length === 0 && structuredEdits.length === 0) return null;
  const count = operations.length;
  const noun = count === 1 ? 'operation' : 'operations';

  const supersededOpIds = new Set(structuredEdits.map((edit) => edit.supersedesOpId).filter((id): id is string => id !== undefined));
  const standaloneEdits = structuredEdits.filter((edit) => edit.supersedesOpId === undefined);
  const visibleCount = operations.filter((op) => !supersededOpIds.has(op.id)).length + standaloneEdits.length;
  const visibleNoun = visibleCount === 1 ? 'operation' : 'operations';

  return (
    <div data-testid="assistant-timeline" className="min-w-0 mb-1">
      <button
        type="button"
        data-testid="assistant-timeline-toggle"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={expanded ? `Hide ${visibleCount} ${visibleNoun}` : `Show ${visibleCount} ${visibleNoun}`}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-0.5 py-0.5 text-left text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500/60"
      >
        <span aria-hidden="true" className="text-zinc-600 text-[10px]">
          {expanded ? '▾' : '▸'}
        </span>
        <span className="truncate">
          {visibleCount} {visibleNoun}
        </span>
      </button>
      {expanded && (
        <div className="mt-0.5 border-l border-zinc-800 pl-2.5 ml-[3px] min-w-0">
          {operations.map((op) => {
            if (supersededOpIds.has(op.id)) {
              const edit = structuredEdits.find((entry) => entry.supersedesOpId === op.id);
              return edit ? <AssistantCodeEdit key={`edit-${edit.operationId}`} detail={edit.detail} /> : null;
            }
            return <AssistantToolCard key={op.id} operation={op} />;
          })}
          {standaloneEdits.map((edit) => (
            <AssistantCodeEdit key={`edit-${edit.operationId}`} detail={edit.detail} />
          ))}
        </div>
      )}
    </div>
  );
}
