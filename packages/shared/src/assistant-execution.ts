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

export interface EditExecutionDetail extends AssistantExecutionBase {
  readonly kind: 'edit';
  /** Repository-relative target path (never a bare absolute external path). */
  readonly file: string;
  readonly operation?: 'added' | 'modified' | 'deleted' | 'renamed';
  readonly additions?: number;
  readonly deletions?: number;
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
      return {
        ...base,
        kind: 'edit',
        file,
        operation,
        additions: boundedNumber(record.additions),
        deletions: boundedNumber(record.deletions),
        diffProvenance: record.diffProvenance === 'runtime-provided' ? 'runtime-provided' : 'unavailable',
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
