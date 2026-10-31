/**
 * Framework-free assistant turn state machine.
 *
 * Ports the transient projection logic from
 * `apps/workspace/src/hooks/useAssistantConversation.ts` (op-id keying from
 * `8ddd753`) without React, so workspace v1, workspace-ui v2, the TUI, and
 * Telegram can share one implementation. The stage-3 rewire keeps the v1
 * hook as a thin adapter over this class.
 *
 * Lifecycle (proven by chunk type, never by prose):
 * - `tool` → one `running` card per start. Same-name starts never merge —
 *   parallel calls stay distinct. Chunks carrying an authoritative
 *   `operationId` correlate via the id map; detail-less chunks resolve FIFO.
 * - `tool_result` → earliest running same-name op completes; explicit
 *   `execution.state` wins over the legacy `content === 'failed'` heuristic.
 * - Status-channel `assistant.execution.v1` details upsert structured
 *   edit/terminal/verification projections (rich surface supersedes the
 *   generic row when operationIds correlate), the task snapshot, and pending
 *   permission/question queues.
 */

import {
  type AssistantExecutionDetail,
  type GenericToolExecutionDetail,
  isAssistantExecutionDetail,
  type TerminalExecutionDetail,
  type ToolExecutionDetail,
} from '@vestara/shared';
import type { ConversationMessage } from './transport';

export type ToolOperationState = 'running' | 'completed' | 'failed';

export interface AssistantToolOperation {
  /**
   * Client projection id. Live cards use a per-start counter; rehydrated
   * durable cards use deterministic `hist-<operationId|toolCallId>` so a
   * later live result for the same authoritative operation correlates.
   */
  readonly id: string;
  /** Tool name exactly as delivered by the `tool`/`tool_result` event. */
  name: string;
  state: ToolOperationState;
  /** Bounded result preview (≤200 chars), completed operations only. */
  preview?: string;
}

/** Structured projection (edit/terminal/verification) for one operation. */
export interface StructuredProjection {
  /** Stable upstream operation identity (OpenCode callID). */
  readonly operationId: string;
  readonly detail: AssistantExecutionDetail;
  /** Generic client op id this rich surface supersedes, if correlated. */
  supersedesOpId?: string;
}

export type TurnTerminal = 'completed' | 'failed';

/** Defensive bound: the adapter already slices to ≤200 chars; never trust the wire. */
const TOOL_PREVIEW_MAX = 200;

let toolOpCounter = 0;

function makeToolOpId(name: string): string {
  toolOpCounter += 1;
  return `op-${name || 'tool'}-${toolOpCounter}`;
}

function boundPreview(content: unknown): string | undefined {
  if (typeof content !== 'string' || content.length === 0) return undefined;
  return content.slice(0, TOOL_PREVIEW_MAX);
}

function previewFor(detail: AssistantExecutionDetail, fallback: string): string | undefined {
  if (detail.kind === 'terminal') return boundPreview((detail as TerminalExecutionDetail).outputPreview ?? fallback);
  if (detail.kind === 'tool' || detail.kind === 'generic') {
    return boundPreview((detail as ToolExecutionDetail | GenericToolExecutionDetail).preview ?? fallback);
  }
  return boundPreview(fallback);
}

export class AssistantTurn {
  readonly operations: AssistantToolOperation[] = [];
  readonly structuredEdits: StructuredProjection[] = [];
  readonly structuredTerminals: StructuredProjection[] = [];
  readonly structuredVerifications: StructuredProjection[] = [];
  taskSnapshot: AssistantExecutionDetail | null = null;
  readonly pendingPermissions: AssistantExecutionDetail[] = [];
  readonly pendingQuestions: AssistantExecutionDetail[] = [];
  streamingText = '';

  private readonly operationIds = new Map<string, string>();

  /** Append streaming text (delta frames). */
  onDelta(text: string): void {
    this.streamingText += text;
  }

  /** One card per start — same-name `running` rows never merge. */
  onToolStart(name: string, operationId?: string): void {
    const toolName = name || 'tool';
    if (operationId) {
      const knownId = this.operationIds.get(operationId);
      if (knownId) {
        const existing = this.operations.find((op) => op.id === knownId);
        if (existing && existing.state !== 'running') existing.state = 'running';
        if (existing) return;
      }
      const created: AssistantToolOperation = { id: makeToolOpId(toolName), name: toolName, state: 'running' };
      this.operationIds.set(operationId, created.id);
      this.operations.push(created);
      return;
    }
    this.operations.push({ id: makeToolOpId(toolName), name: toolName, state: 'running' });
  }

  /**
   * Complete the earliest still-running op of this name (FIFO — parallel
   * same-name calls resolve in start order). Explicit execution detail wins
   * over the legacy `content === 'failed'` heuristic.
   */
  onToolResult(name: string, content: string, execution?: AssistantExecutionDetail): void {
    const toolName = name || 'tool';
    if (execution?.operationId) return this.applyStructuredToolResult(toolName, content, execution);
    const failed = content === 'failed';
    const preview = failed ? undefined : boundPreview(content);
    const match = this.operations.find((op) => op.name === toolName && op.state === 'running');
    if (match) {
      match.state = failed ? 'failed' : 'completed';
      if (preview !== undefined) match.preview = preview;
      return;
    }
    const last = this.operations[this.operations.length - 1];
    if (
      last &&
      last.name === toolName &&
      last.state === (failed ? 'failed' : 'completed') &&
      last.preview === preview
    ) {
      return;
    }
    this.operations.push({
      id: makeToolOpId(toolName),
      name: toolName,
      state: failed ? 'failed' : 'completed',
      ...(preview !== undefined ? { preview } : {}),
    });
  }

  private applyStructuredToolResult(toolName: string, content: string, execution: AssistantExecutionDetail): void {
    // Permission projections never create cards (no authority mutation here).
    if (execution.kind === 'permission') return;
    const operationId = execution.operationId;
    const explicit: ToolOperationState = execution.state === 'failed' ? 'failed' : 'completed';
    const preview = explicit === 'failed' ? undefined : previewFor(execution, content);
    const knownId = this.operationIds.get(operationId);
    if (knownId) {
      const match = this.operations.find((op) => op.id === knownId);
      if (match) {
        match.name = toolName;
        match.state = explicit;
        if (preview !== undefined) match.preview = preview;
        return;
      }
    }
    // Completion with authoritative identity but no observed start: resolve
    // the trailing same-name running op (e.g. start emitted before subscribe).
    const trailing = [...this.operations].reverse().find((op) => op.state === 'running' && op.name === toolName);
    if (trailing) {
      this.operationIds.set(operationId, trailing.id);
      trailing.name = toolName;
      trailing.state = explicit;
      if (preview !== undefined) trailing.preview = preview;
      return;
    }
    const created: AssistantToolOperation = {
      id: makeToolOpId(toolName),
      name: toolName,
      state: explicit,
      ...(preview !== undefined ? { preview } : {}),
    };
    this.operationIds.set(operationId, created.id);
    this.operations.push(created);
  }

  /**
   * Status-channel execution detail: structured projections, task snapshot,
   * and pending permission/question queues. No-ops for unvalidated payloads.
   */
  onExecution(value: unknown): void {
    if (!isAssistantExecutionDetail(value)) return;
    const execution = value;
    if (execution.kind === 'edit') this.upsertStructured(this.structuredEdits, execution);
    else if (execution.kind === 'terminal') this.upsertStructured(this.structuredTerminals, execution);
    else if (execution.kind === 'verification') this.upsertStructured(this.structuredVerifications, execution);
    else if (execution.kind === 'task-snapshot') this.taskSnapshot = execution;
    else if (execution.kind === 'permission') {
      if (execution.permissionState === 'requested') {
        if (!this.pendingPermissions.some((p) => p.operationId === execution.operationId)) {
          this.pendingPermissions.push(execution);
        }
      } else {
        this.removePending(this.pendingPermissions, execution.operationId);
      }
    } else if (execution.kind === 'question') {
      if (execution.questionState === 'requested') {
        if (!this.pendingQuestions.some((q) => q.operationId === execution.operationId)) {
          this.pendingQuestions.push(execution);
        }
      } else {
        this.removePending(this.pendingQuestions, execution.operationId);
      }
    }
  }

  private upsertStructured(list: StructuredProjection[], detail: AssistantExecutionDetail): void {
    const supersedesOpId = this.operationIds.get(detail.operationId);
    const existing = list.findIndex((entry) => entry.operationId === detail.operationId);
    const next: StructuredProjection = {
      operationId: detail.operationId,
      detail,
      ...(supersedesOpId ? { supersedesOpId } : {}),
    };
    if (existing >= 0) list[existing] = next;
    else list.push(next);
  }

  private removePending(list: AssistantExecutionDetail[], operationId: string): void {
    const idx = list.findIndex((entry) => entry.operationId === operationId);
    if (idx >= 0) list.splice(idx, 1);
  }

  /** Drop a decided/answered interaction from its pending queue. */
  dismissPending(kind: 'permission' | 'question', operationId: string): void {
    this.removePending(kind === 'permission' ? this.pendingPermissions : this.pendingQuestions, operationId);
  }

  /** Turn terminal proves execution ended: resolve leftover running ops. */
  finalize(terminal: TurnTerminal): void {
    for (const op of this.operations) {
      if (op.state === 'running') op.state = terminal;
    }
  }

  /** Clear all transient turn state (send/select/abort). */
  reset(): void {
    this.operations.length = 0;
    this.structuredEdits.length = 0;
    this.structuredTerminals.length = 0;
    this.structuredVerifications.length = 0;
    this.taskSnapshot = null;
    this.pendingPermissions.length = 0;
    this.pendingQuestions.length = 0;
    this.streamingText = '';
    this.operationIds.clear();
  }

  /**
   * Rehydrate the durable tool timeline from persisted messages
   * (`toolObservations`, GA-CTX-001) — one entry per operation. Ids are
   * deterministic so a later live result for the same authoritative
   * operation correlates instead of duplicating. Never fabricates.
   */
  rehydrateFromMessages(messages: readonly ConversationMessage[]): void {
    this.reset();
    const seen = new Set<string>();
    for (const msg of messages) {
      if (msg.role !== 'assistant' || !msg.toolObservations) continue;
      for (const obs of msg.toolObservations) {
        if (!obs || typeof obs.toolName !== 'string') continue;
        const operationId = typeof obs.operationId === 'string' && obs.operationId ? obs.operationId : undefined;
        const clientId = `hist-${operationId ?? obs.toolCallId ?? msg.id}`;
        if (seen.has(clientId)) continue;
        seen.add(clientId);
        const state: ToolOperationState =
          obs.status === 'running' ? 'running' : obs.status === 'completed' ? 'completed' : 'failed';
        this.operations.push({
          id: clientId,
          name: obs.toolName || 'tool',
          state,
          ...(state === 'completed' && obs.content ? { preview: obs.content.slice(0, TOOL_PREVIEW_MAX) } : {}),
        });
        if (operationId) this.operationIds.set(operationId, clientId);
      }
    }
  }
}
