/**
 * SSE frame parsing for the Vestara assistant conversation stream.
 *
 * Frame: `data: {schemaVersion, conversationId, messageId, sequence,
 * timestamp, event}\n\n` with event delta/tool/tool_result/status/
 * permission/question/error/done. The `execution` payload carries the
 * `assistant.execution.v1` projection detail verbatim (typed unknown here —
 * consumers narrow it; the stage-2 store binds it to `@vestara/shared`).
 *
 * Malformed frames are skipped, never fatal — one bad line must not kill
 * the turn.
 */

export type AssistantStreamEventType =
  | 'delta'
  | 'tool'
  | 'tool_result'
  | 'status'
  | 'permission'
  | 'question'
  | 'error'
  | 'done';

/** One parsed stream frame. Unknown event types are preserved, not dropped. */
export interface AssistantStreamEvent {
  readonly type: string;
  readonly content?: string;
  /** Tool name for `tool` / `tool_result` frames. */
  readonly name?: string;
  /** Verbatim `assistant.execution.v1` detail (status/permission/question/tool). */
  readonly execution?: unknown;
}

export interface AssistantStreamFrame {
  readonly schemaVersion?: number;
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly sequence?: number;
  readonly timestamp?: string;
  readonly event?: AssistantStreamEvent;
}

/** Split an accumulated buffer on blank lines; unparsed tail is returned. */
export function parseStreamFrames(buffer: string): { frames: AssistantStreamFrame[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames: AssistantStreamFrame[] = [];
  for (const part of parts) {
    const line = part
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('data:'));
    if (!line) continue;
    try {
      frames.push(JSON.parse(line.slice(5).trim()) as AssistantStreamFrame);
    } catch {
      // Malformed frame — skip, keep the turn alive.
    }
  }
  return { frames, rest };
}
