/**
 * @vestara/shared — Assistant Execution Projection contract (`assistant.execution.v1`).
 *
 * GA-UX-PREMIUM M3: a trustworthy, bounded projection from runtime/OpenCode
 * execution into the Vestara Assistant surface. The browser consumes THIS
 * contract — never raw OpenCode event schemas.
 *
 * Design rules (see docs/blueprint/GA-UX-PREMIUM-M3-execution-projection-contract.md):
 * - Discriminated union: no `detail?: unknown` escape hatches.
 * - Common bounded envelope (§2): version, operationId, kind, state, tool,
 *   source, timestamp; correlation fields only when authoritative.
 * - Explicit lifecycle (§4): state is `running | completed | failed`, never
 *   derived from output text.
 * - Sanitization (§11): details are CONSTRUCTED from allowlisted fields only;
 *   the normalizer never clones a runtime payload.
 * - Versioned (§12): unknown versions/kinds degrade safely to `generic`.
 */

export const ASSISTANT_EXECUTION_CONTRACT = 'assistant.execution.v1' as const;
export const ASSISTANT_EXECUTION_VERSION = 1 as const;

export type AssistantExecutionKind =
  | 'tool' // generic tool activity
  | 'edit' // file edit (diff evidence, not rendered in M3)
  | 'terminal' // shell execution
  | 'task-snapshot' // OpenCode local todo snapshot
  | 'permission' // permission request/resolution (no UI in M3)
  | 'verification' // verification projection (UNAVAILABLE in M3 — no source)
  | 'artifact' // generated/modified file evidence
  | 'generic'; // safe degradation for unknown future variants

export type AssistantExecutionState = 'running' | 'completed' | 'failed';

export type AssistantExecutionSource = 'opencode' | 'vestara-workflow';

export type AssistantExecutionProvenance = 'runtime-provided' | 'vestara-derived' | 'unavailable';

// ─── Field bounds (sanitization policy §11) ───────────────────

export const ASSISTANT_EXECUTION_BOUNDS = {
  /** Bounded operation/tool result preview (matches the M2 ≤200 rule). */
  preview: 200,
  /** Bounded error message. */
  error: 500,
  /** Bounded terminal output preview — never stream unlimited output. */
  terminalOutputPreview: 2000,
  /** Bounded shell command. */
  command: 500,
  /** Bounded repository-relative path. */
  path: 500,
  /** Bounded identity strings (callID/sessionID/messageID/operationId). */
  identity: 200,
  /** Max resources surfaced per permission request. */
  permissionResources: 20,
  /** Max todos surfaced per task snapshot. */
  todoItems: 20,
  /**
   * Max hunks per edit projection (GA-UX-PREMIUM M3.1). Prevents a huge
   * repository diff from becoming an unbounded Conversation SSE payload.
   */
  hunkCount: 50,
  /** Max chars per hunk content (unified-diff text). */
  hunkContent: 1_000,
  /** Max aggregate hunk content chars across all hunks of one edit projection. */
  hunkContentTotal: 8_000,
  /**
   * Max chars for the runtime patch evidence (GA-UX-PREMIUM M3.2). No explicit
   * Conversation SSE frame cap exists in the API; the closest payload bounds are
   * terminal preview 2000 and the hunk aggregate 8000. A patch is whole-file
   * unified-diff text and may legitimately exceed a hunk group, so the bound is
   * set at 20_000 (4× the hunk aggregate) — comfortably bounded for a single
   * SSE frame while covering typical small/medium diffs. Deterministic
   * truncation beyond it, flagged via `patchTruncated`.
   */
  patchContent: 20_000,
} as const;

// ─── Common envelope ──────────────────────────────────────────

export interface AssistantExecutionBase {
  readonly contract: typeof ASSISTANT_EXECUTION_CONTRACT;
  readonly version: typeof ASSISTANT_EXECUTION_VERSION;
  /** Stable upstream operation identity (OpenCode `callID` when available). */
  readonly operationId: string;
  readonly state: AssistantExecutionState;
  /** Tool name, when the operation is a tool/terminal/edit. */
  readonly tool?: string;
  /** Provenance of the projection's authority. */
  readonly source: AssistantExecutionSource;
  /** Authoritative epoch ms from the source event. */
  readonly timestamp: number;
  /** Authoritative correlation — present only when the runtime supplied it. */
  readonly assistantMessageId?: string;
  readonly sessionId?: string;
  readonly parentOperationId?: string;
  readonly sequence?: number;
}

// ─── Discriminated variants ───────────────────────────────────

export interface ToolExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'tool';
  readonly tool: string;
  /** Bounded display title from the runtime part (e.g. target path). */
  readonly title?: string;
  /** Bounded result preview (completed), ≤ ASSISTANT_EXECUTION_BOUNDS.preview. */
  readonly preview?: string;
  /** Bounded error (failed only). */
  readonly error?: string;
  /** Authoritative duration (time.end − time.start), when the runtime supplies it. */
  readonly durationMs?: number;
}

/**
 * One unified-diff hunk from the runtime (GA-UX-PREMIUM M3.1).
 *
 * Values are PRESERVED from an upstream structured-hunk source when supplied;
 * absent line fields stay `undefined` — never manufactured (no 0, no
 * previous+1, no array index). `content` is the diff text (context /
 * additions / deletions lines) and is bounded. OpenCode 1.18.27 does NOT
 * supply structured hunks (it exposes `patch?: string`) — hunks remain a valid
 * optional representation for runtimes that do.
 */
export interface AssistantEditHunk {
  readonly oldStart?: number;
  readonly oldLines?: number;
  readonly newStart?: number;
  readonly newLines?: number;
  readonly content: string;
}

export type AssistantDiffRepresentation = 'patch' | 'hunks' | 'unavailable';

export interface EditExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'edit';
  /** Repository-relative target path (never a bare absolute external path). */
  readonly file: string;
  readonly operation?: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly additions?: number;
  readonly deletions?: number;
  /**
   * Which diff representation the runtime actually supplied (GA-UX-PREMIUM
   * M3.2): `patch` (OpenCode 1.18.27 `patch?: string`), `hunks` (structured
   * line metadata from a hunk-supplying runtime), or `unavailable`.
   * Deterministic — derived from the carried evidence, never claimed
   * speculatively. The invariant: patch present → runtime patch; hunks present
   * → runtime structured hunks; neither → unavailable. Never converted.
   */
  readonly diffRepresentation: AssistantDiffRepresentation;
  /**
   * Opaque runtime patch evidence (unified diff text), bounded. Preserved
   * verbatim as runtime evidence — M3.2 performs no parsing, no line-number
   * computation, no hunk splitting, no before/after reconstruction.
   */
  readonly patch?: string;
  /** True when the runtime patch was deterministically truncated at the bound. */
  readonly patchTruncated?: boolean;
  /** Runtime-provided structured hunks (M3.1), for hunk-supplying runtimes. */
  readonly hunks?: readonly AssistantEditHunk[];
  /**
   * True when any configured bound caused loss of upstream hunk evidence
   * (hunk count, per-hunk content, or aggregate content truncation) — the
   * projection is then NOT the complete upstream diff.
   */
  readonly hunksTruncated?: boolean;
  /** True when the runtime supplied diff evidence (patch or hunks). */
  readonly diffProvenance: 'runtime-provided' | 'unavailable';
  readonly beforeAfterProvenance: 'unavailable';
}

export interface TerminalExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'terminal';
  /** Bounded command, ≤ ASSISTANT_EXECUTION_BOUNDS.command. */
  readonly command?: string;
  /** Authoritative cwd — server-provided only, never inferred from the browser. */
  readonly cwd?: string;
  readonly exitCode?: number;
  /** Derived from authoritative started/ended timestamps. */
  readonly durationMs?: number;
  /** Bounded output preview, ≤ ASSISTANT_EXECUTION_BOUNDS.terminalOutputPreview. */
  readonly outputPreview?: string;
  readonly cwdProvenance: 'runtime-provided' | 'unavailable';
  readonly exitCodeProvenance: 'runtime-provided' | 'unavailable';
}

export interface TaskSnapshotDetail extends AssistantExecutionBase {
  readonly kind: 'task-snapshot';
  /** OpenCode local todo — never merged with Vestara Workflow Task authority. */
  readonly source: 'opencode';
  readonly todos: readonly { readonly title: string; readonly status: string }[];
}

export interface PermissionExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'permission';
  readonly permissionRequestId: string;
  /** Capability key (e.g. `edit`, `bash`, `web`). */
  readonly action: string;
  /** Bounded target resources (paths), ≤ ASSISTANT_EXECUTION_BOUNDS.permissionResources. */
  readonly resources: readonly string[];
  /**
   * Permission lifecycle (distinct from the envelope lifecycle): the envelope
   * `state` stays `running` (requested) / `completed` (resolved) so the common
   * contract holds; this field carries the permission-specific semantics.
   */
  readonly permissionState: 'requested' | 'resolved';
  readonly reply?: 'once' | 'always' | 'reject';
}

export interface VerificationExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'verification';
  readonly state: 'completed' | 'failed';
  readonly verdict?: 'passed' | 'failed' | 'unknown';
  /** M3: no authoritative verification source exists → 'unavailable'. */
  readonly evidence: 'runtime-provided' | 'unavailable';
}

export interface ArtifactExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'artifact';
  /** Repository-relative path. */
  readonly file: string;
}

export interface GenericToolExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'generic';
  /** Bounded preview (safe degradation — unknown variants never crash the UI). */
  readonly preview?: string;
}

export type AssistantExecutionDetail =
  | ToolExecutionDetail
  | EditExecutionDetail
  | TerminalExecutionDetail
  | TaskSnapshotDetail
  | PermissionExecutionDetail
  | VerificationExecutionDetail
  | ArtifactExecutionDetail
  | GenericToolExecutionDetail;

// ─── Sanitization helpers (§11: construct, never clone) ───────

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function boundedNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function boundedStringArray(value: unknown, max: number, itemMax: number): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => boundedString(item, itemMax))
    .filter((item): item is string => item !== undefined)
    .slice(0, max);
}

function boundedTodoList(value: unknown): readonly { title: string; status: string }[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return undefined;
      const record = item as Record<string, unknown>;
      const title = boundedString(record.content ?? record.title, 200);
      const status = boundedString(record.status, 50);
      return title && status ? { title, status } : title ? { title, status: 'unknown' } : undefined;
    })
    .filter((item): item is { title: string; status: string } => item !== undefined)
    .slice(0, ASSISTANT_EXECUTION_BOUNDS.todoItems);
}

const KNOWN_STATES: readonly AssistantExecutionState[] = ['running', 'completed', 'failed'];
const KNOWN_REPLIES = ['once', 'always', 'reject'] as const;

/**
 * Bound + allowlist upstream diff hunks (GA-UX-PREMIUM M3.1).
 *
 * - Constructs new hunk objects from allowlisted fields only; arbitrary
 *   runtime fields are never forwarded.
 * - Line metadata is preserved when it is a non-negative integer; absent or
 *   invalid values become `undefined` — never manufactured (no 0/1/prev+1).
 * - `content` must be a string; it is bounded by slice (leading diff markers
 *   and spaces are significant and never trimmed).
 * - Deterministic truncation: hunk count, per-hunk content, and aggregate
 *   content are all bounded; any loss sets `truncated`.
 */
function boundedHunks(value: unknown): { items: readonly AssistantEditHunk[] | undefined; truncated: boolean } {
  // Absent (not an array) → no hunks field at all: legacy M3 payloads stay valid.
  if (!Array.isArray(value)) return { items: undefined, truncated: false };
  let truncated = false;
  let aggregate = 0;
  const items: AssistantEditHunk[] = [];
  for (const raw of value) {
    if (items.length >= ASSISTANT_EXECUTION_BOUNDS.hunkCount) {
      truncated = true;
      break;
    }
    if (!raw || typeof raw !== 'object') {
      truncated = true; // malformed hunk → evidence lost
      continue;
    }
    const record = raw as Record<string, unknown>;
    if (typeof record.content !== 'string') {
      truncated = true; // content not a string → evidence lost
      continue;
    }
    const content =
      record.content.length > ASSISTANT_EXECUTION_BOUNDS.hunkContent
        ? ((truncated = true), record.content.slice(0, ASSISTANT_EXECUTION_BOUNDS.hunkContent))
        : record.content;
    if (aggregate + content.length > ASSISTANT_EXECUTION_BOUNDS.hunkContentTotal) {
      truncated = true;
      break; // aggregate bound hit — remaining hunks are dropped
    }
    aggregate += content.length;
    items.push({
      oldStart: boundedDiffLine(record.oldStart),
      oldLines: boundedDiffLine(record.oldLines),
      newStart: boundedDiffLine(record.newStart),
      newLines: boundedDiffLine(record.newLines),
      content,
    });
  }
  return { items, truncated };
}

/** Non-negative integer line metadata; anything else (absent/invalid) → undefined. */
function boundedDiffLine(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

/**
 * Bound the opaque runtime patch evidence (GA-UX-PREMIUM M3.2).
 *
 * The patch is preserved verbatim as runtime evidence — NOT parsed, NOT split
 * into hunks, NOT line-numbered, NOT trimmed (diff text whitespace is
 * significant). Deterministic truncation past ASSISTANT_EXECUTION_BOUNDS.patchContent
 * sets `truncated`. A non-string `patch` is absent (no fabrication).
 */
function boundedPatch(value: unknown): { value: string | undefined; truncated: boolean } {
  if (typeof value !== 'string') return { value: undefined, truncated: false };
  if (value.length <= ASSISTANT_EXECUTION_BOUNDS.patchContent) return { value, truncated: false };
  return { value: value.slice(0, ASSISTANT_EXECUTION_BOUNDS.patchContent), truncated: true };
}

/**
 * Normalize an unknown payload into a safe `AssistantExecutionDetail`.
 *
 * Constructs a NEW object from allowlisted fields only — never clones the
 * runtime payload, never forwards unknown properties (system prompts, hidden
 * reasoning, credentials, raw tool arguments, OpenCode internals).
 *
 * Degradation rules (§12):
 * - Missing/unknown `contract` or `version` → `undefined` (caller falls back
 *   to legacy M2 behavior — no crash).
 * - Unknown `kind` → `generic` with a bounded preview.
 * - Invalid `state` → `completed` for terminal events, `running` otherwise.
 */
export function normalizeAssistantExecutionDetail(value: unknown): AssistantExecutionDetail | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.contract !== ASSISTANT_EXECUTION_CONTRACT) return undefined;
  if (record.version !== ASSISTANT_EXECUTION_VERSION) return undefined;

  const operationId = boundedString(record.operationId, ASSISTANT_EXECUTION_BOUNDS.identity);
  if (!operationId) return undefined;

  const state = KNOWN_STATES.includes(record.state as AssistantExecutionState)
    ? (record.state as AssistantExecutionState)
    : undefined;
  if (!state) return undefined;

  const base: AssistantExecutionBase = {
    contract: ASSISTANT_EXECUTION_CONTRACT,
    version: ASSISTANT_EXECUTION_VERSION,
    operationId,
    state,
    tool: boundedString(record.tool, ASSISTANT_EXECUTION_BOUNDS.identity),
    source: record.source === 'vestara-workflow' ? 'vestara-workflow' : 'opencode',
    timestamp: boundedNumber(record.timestamp) ?? Date.now(),
    assistantMessageId: boundedString(record.assistantMessageId, ASSISTANT_EXECUTION_BOUNDS.identity),
    sessionId: boundedString(record.sessionId, ASSISTANT_EXECUTION_BOUNDS.identity),
    parentOperationId: boundedString(record.parentOperationId, ASSISTANT_EXECUTION_BOUNDS.identity),
    sequence: boundedNumber(record.sequence),
  };

  const kind = record.kind;
  switch (kind) {
    case 'tool': {
      return {
        ...base,
        kind: 'tool',
        tool: base.tool ?? 'tool',
        title: boundedString(record.title, 200),
        preview: state === 'completed' ? boundedString(record.preview, ASSISTANT_EXECUTION_BOUNDS.preview) : undefined,
        error: state === 'failed' ? boundedString(record.error, ASSISTANT_EXECUTION_BOUNDS.error) : undefined,
        durationMs: boundedNumber(record.durationMs),
      };
    }
    case 'edit': {
      const file = boundedString(record.file, ASSISTANT_EXECUTION_BOUNDS.path);
      if (!file) return undefined;
      const operation = ['added', 'modified', 'deleted', 'renamed'].includes(record.operation as string)
        ? (record.operation as 'added' | 'modified' | 'deleted' | 'renamed')
        : undefined;
      const patch = boundedPatch(record.patch);
      const hunks = boundedHunks(record.hunks);
      // Truthful representation: derived from the carried evidence, never
      // claimed speculatively; patch and hunks are never converted.
      const representation: AssistantDiffRepresentation =
        patch.value !== undefined
          ? 'patch'
          : hunks.items !== undefined && hunks.items.length > 0
            ? 'hunks'
            : 'unavailable';
      return {
        ...base,
        kind: 'edit',
        file,
        operation,
        additions: boundedNumber(record.additions),
        deletions: boundedNumber(record.deletions),
        diffRepresentation: representation,
        patch: patch.value,
        patchTruncated: patch.truncated || undefined,
        hunks: hunks.items,
        hunksTruncated: hunks.truncated || undefined,
        diffProvenance: representation === 'unavailable' ? 'unavailable' : 'runtime-provided',
        beforeAfterProvenance: 'unavailable',
      };
    }
    case 'terminal': {
      return {
        ...base,
        kind: 'terminal',
        command: boundedString(record.command, ASSISTANT_EXECUTION_BOUNDS.command),
        cwd: boundedString(record.cwd, ASSISTANT_EXECUTION_BOUNDS.path),
        exitCode: boundedNumber(record.exitCode),
        durationMs: boundedNumber(record.durationMs),
        outputPreview:
          state === 'completed'
            ? boundedString(record.outputPreview, ASSISTANT_EXECUTION_BOUNDS.terminalOutputPreview)
            : undefined,
        cwdProvenance: record.cwdProvenance === 'runtime-provided' ? 'runtime-provided' : 'unavailable',
        exitCodeProvenance: record.exitCodeProvenance === 'runtime-provided' ? 'runtime-provided' : 'unavailable',
      };
    }
    case 'task-snapshot': {
      return {
        ...base,
        kind: 'task-snapshot',
        source: 'opencode',
        todos: boundedTodoList(record.todos),
      };
    }
    case 'permission': {
      const permissionRequestId = boundedString(record.permissionRequestId, ASSISTANT_EXECUTION_BOUNDS.identity);
      if (!permissionRequestId) return undefined;
      const action = boundedString(record.action, ASSISTANT_EXECUTION_BOUNDS.identity);
      if (!action) return undefined;
      const reply = KNOWN_REPLIES.includes(record.reply as (typeof KNOWN_REPLIES)[number])
        ? (record.reply as 'once' | 'always' | 'reject')
        : undefined;
      return {
        ...base,
        kind: 'permission',
        permissionRequestId,
        action,
        resources: boundedStringArray(
          record.resources,
          ASSISTANT_EXECUTION_BOUNDS.permissionResources,
          ASSISTANT_EXECUTION_BOUNDS.path,
        ),
        permissionState: state === 'running' ? 'requested' : 'resolved',
        reply,
      };
    }
    case 'verification': {
      const verdict = ['passed', 'failed', 'unknown'].includes(record.verdict as string)
        ? (record.verdict as 'passed' | 'failed' | 'unknown')
        : undefined;
      return {
        ...base,
        kind: 'verification',
        state: state === 'failed' ? 'failed' : 'completed',
        verdict,
        evidence: record.evidence === 'runtime-provided' ? 'runtime-provided' : 'unavailable',
      };
    }
    case 'artifact': {
      const file = boundedString(record.file, ASSISTANT_EXECUTION_BOUNDS.path);
      if (!file) return undefined;
      return { ...base, kind: 'artifact', file };
    }
    default: {
      // Safe degradation: unknown kind → generic tool activity.
      return {
        ...base,
        kind: 'generic',
        preview: state === 'completed' ? boundedString(record.preview, ASSISTANT_EXECUTION_BOUNDS.preview) : undefined,
      };
    }
  }
}

/** Type guard: is this a well-formed execution detail (post-normalization)? */
export function isAssistantExecutionDetail(value: unknown): value is AssistantExecutionDetail {
  return normalizeAssistantExecutionDetail(value) !== undefined;
}
