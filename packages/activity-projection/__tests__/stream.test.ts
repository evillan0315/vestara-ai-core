import type { ActivityRecord } from '@vestara/activity-projection';
import { ActivityStreamHub, type ActivityStreamMessage, type ActivityStreamSink } from '@vestara/activity-projection';
import { describe, expect, it } from 'vitest';
import { workflowRecord } from './helpers';

interface RecordingSink extends ActivityStreamSink {
  messages: ActivityStreamMessage[];
}

function recordingSink(): RecordingSink {
  const messages: ActivityStreamMessage[] = [];
  return { messages, send: (message) => messages.push(message) };
}

function records(...sequences: number[]): ActivityRecord[] {
  return sequences.map((sequence) => workflowRecord({ id: `activity:${sequence}`, sequence }));
}

describe('ActivityStreamHub', () => {
  it('broadcasts appended records to attached connections exactly once', () => {
    const hub = new ActivityStreamHub();
    const sink = recordingSink();
    hub.attach('client-1', sink);
    hub.broadcast(records(1)[0]);
    hub.broadcast(records(2)[0]);
    expect(sink.messages.map((message) => message.type)).toEqual(['activity.appended', 'activity.appended']);
    const first = sink.messages[0];
    if (first.type === 'activity.appended') {
      expect(first.sequence).toBe(1);
      expect(first.activity).toMatchObject({ id: 'activity:1' });
    }
    expect(hub.checkpoint('client-1')).toBe(2);
  });

  it('delivers to every attached connection once, and not after detach', () => {
    const hub = new ActivityStreamHub();
    const first = recordingSink();
    const second = recordingSink();
    hub.attach('a', first);
    hub.attach('b', second);
    hub.broadcast(records(1)[0]);
    hub.detach('a');
    hub.broadcast(records(2)[0]);
    expect(first.messages).toHaveLength(1);
    expect(second.messages).toHaveLength(2);
    expect(hub.isAttached('a')).toBe(false);
  });

  it('ignores records at or below the attached checkpoint (dedup + recovery boundary)', () => {
    const hub = new ActivityStreamHub();
    const sink = recordingSink();
    hub.attach('client-1', sink, 3);
    hub.broadcast(records(3)[0]);
    hub.broadcast(records(2)[0]);
    hub.broadcast(records(4)[0]);
    const delivered = sink.messages.filter((message) => message.type === 'activity.appended');
    expect(delivered).toHaveLength(1);
    if (delivered[0].type === 'activity.appended') expect(delivered[0].sequence).toBe(4);
  });

  it('holds out-of-order records and flushes them in sequence order', () => {
    const hub = new ActivityStreamHub();
    const sink = recordingSink();
    hub.attach('client-1', sink, 0);
    hub.broadcast(records(2)[0]);
    hub.broadcast(records(1)[0]);
    const sequences = sink.messages
      .filter(
        (message): message is Extract<ActivityStreamMessage, { type: 'activity.appended' }> =>
          message.type === 'activity.appended',
      )
      .map((message) => message.sequence);
    expect(sequences).toEqual([1, 2]);
  });

  it('sends resync-required and detaches when a gap cannot be closed', () => {
    const hub = new ActivityStreamHub({ bufferCapacity: 2 });
    const sink = recordingSink();
    hub.attach('client-1', sink, 0);
    // Create an unclosable gap: records 2..4 arrive without 1 filling the buffer.
    hub.broadcast(records(2)[0]);
    hub.broadcast(records(3)[0]);
    hub.broadcast(records(4)[0]);
    const resync = sink.messages.find((message) => message.type === 'activity.resync-required');
    expect(resync).toBeDefined();
    if (resync?.type === 'activity.resync-required') {
      expect(resync.earliestAvailableSequence).toBe(1);
      expect(resync.latestSequence).toBe(4);
    }
    expect(hub.isAttached('client-1')).toBe(false);
  });

  it('tracks latest and earliest sequences on the hub', () => {
    const hub = new ActivityStreamHub({ earliestAvailableSequence: 7 });
    const sink = recordingSink();
    hub.attach('client-1', sink, 7);
    hub.broadcast(records(8)[0]);
    expect(hub.latest).toBe(8);
    expect(hub.earliest).toBe(7);
  });

  it('duplicate broadcasts of the same record are ignored', () => {
    const hub = new ActivityStreamHub();
    const sink = recordingSink();
    hub.attach('client-1', sink);
    const record = records(1)[0];
    hub.broadcast(record);
    hub.broadcast(record);
    expect(sink.messages.filter((message) => message.type === 'activity.appended')).toHaveLength(1);
  });

  it('re-attaching resets the checkpoint from the new afterSequence', () => {
    const hub = new ActivityStreamHub();
    const sink = recordingSink();
    hub.attach('client-1', sink, 5);
    hub.broadcast(records(6)[0]);
    expect(sink.messages).toHaveLength(1);
    const fresh = recordingSink();
    hub.attach('client-1', fresh, 6);
    hub.broadcast(records(7)[0]);
    expect(fresh.messages.filter((message) => message.type === 'activity.appended')).toHaveLength(1);
    if (fresh.messages[0].type === 'activity.appended') expect(fresh.messages[0].sequence).toBe(7);
  });
});
