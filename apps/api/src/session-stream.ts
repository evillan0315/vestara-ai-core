/**
 * SessionStreamAccumulator — coalesces OpenCode incremental deltas into a live,
 * human-readable stream item per participant/session.
 *
 * Transport truth (raw SSE) and runtime truth (normalized execution events) are
 * preserved; this is a PROJECTION concern. Character/token deltas are appended
 * to a mutable live item and finalized only on semantic boundaries (tool
 * activity, stage completion, failure, session idle). The Activity Room renders
 * the readable narrative — not hundreds of per-character telemetry records.
 */

export type StreamItemState = 'live' | 'finalized';

export interface LiveStreamItem {
  readonly sessionId: string;
  readonly threadId: string;
  readonly role: string;
  readonly agentId: string;
  readonly text: string;
  readonly lastActivityAt: string;
  readonly state: StreamItemState;
}

export interface StreamItemSeed {
  readonly sessionId: string;
  readonly threadId: string;
  readonly role: string;
  readonly agentId: string;
  readonly at: string;
}

export class SessionStreamAccumulator {
  private readonly items = new Map<string, LiveStreamItem>();

  /** Append streamed text to the participant's live narrative. */
  update(seed: StreamItemSeed, delta: string): LiveStreamItem {
    const key = seed.threadId;
    const existing = this.items.get(key);
    if (existing && existing.state === 'live') {
      const updated: LiveStreamItem = {
        ...existing,
        text: existing.text + delta,
        lastActivityAt: seed.at,
      };
      this.items.set(key, updated);
      return updated;
    }
    const item: LiveStreamItem = {
      sessionId: seed.sessionId,
      threadId: seed.threadId,
      role: seed.role,
      agentId: seed.agentId,
      text: delta,
      lastActivityAt: seed.at,
      state: 'live',
    };
    this.items.set(key, item);
    return item;
  }

  /** Finalize the participant's live narrative (returns it; removes from live). */
  finalize(threadId: string, at: string): LiveStreamItem | undefined {
    const existing = this.items.get(threadId);
    if (!existing) return undefined;
    const finalized: LiveStreamItem = { ...existing, lastActivityAt: at, state: 'finalized' };
    this.items.delete(threadId);
    return finalized;
  }

  /** All live (not yet finalized) narratives. */
  live(): readonly LiveStreamItem[] {
    return [...this.items.values()].filter((item) => item.state === 'live');
  }

  /** Live narrative for a specific participant. */
  get(threadId: string): LiveStreamItem | undefined {
    return this.items.get(threadId);
  }
}
