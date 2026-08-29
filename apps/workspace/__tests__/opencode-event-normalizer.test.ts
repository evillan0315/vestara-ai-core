import { describe, expect, it } from 'vitest';
import {
  lifecycleStageFromStatus,
  normalizeActivityEvent,
} from '../src/components/opencode/session/openCodeEventNormalizer';
import type { OpenCodeStreamEnvelope } from '../src/lib/opencode-events';
import { isEventForSession } from '../src/lib/opencode-events';

function envelope(
  id: string,
  type: string,
  sessionId: string | undefined,
  inner: Record<string, unknown> = {},
  timestamp = '2026-08-05T00:00:01Z',
): OpenCodeStreamEnvelope {
  return {
    id,
    type,
    timestamp,
    payload: {
      type: type.replace(/^opencode\./, ''),
      category: 'session',
      sessionId,
      timestamp,
      payload: inner,
    },
  };
}

describe('isEventForSession', () => {
  it('matches events correlated to the session', () => {
    expect(isEventForSession(envelope('e1', 'opencode.message.updated', 'ses_1'), 'ses_1')).toBe(true);
    expect(isEventForSession(envelope('e2', 'opencode.message.updated', 'ses_2'), 'ses_1')).toBe(false);
  });

  it('passes server-scoped events regardless of session', () => {
    expect(isEventForSession(envelope('s1', 'opencode.server.connected', undefined), 'ses_1')).toBe(true);
  });
});

describe('normalizeActivityEvent', () => {
  it('normalizes user messages', () => {
    const event = normalizeActivityEvent(
      envelope('e1', 'opencode.message.updated', 'ses_1', {
        info: { id: 'msg_1', role: 'user', text: 'hello' },
      }),
    );
    expect(event).toMatchObject({ kind: 'message', role: 'user', text: 'hello', messageId: 'msg_1' });
  });

  it('normalizes tool started events', () => {
    const event = normalizeActivityEvent(
      envelope('e2', 'opencode.message.part.updated', 'ses_1', {
        part: { type: 'tool', tool: 'bash', callID: 'call_1', state: { status: 'running' } },
      }),
    );
    expect(event).toMatchObject({ kind: 'tool', phase: 'started', tool: 'bash', callId: 'call_1' });
  });

  it('normalizes tool completed events with output', () => {
    const event = normalizeActivityEvent(
      envelope('e3', 'opencode.message.part.updated', 'ses_1', {
        part: {
          type: 'tool',
          tool: 'bash',
          callID: 'call_1',
          state: { status: 'completed', metadata: { output: 'ok' } },
        },
      }),
    );
    expect(event).toMatchObject({ kind: 'tool', phase: 'completed', tool: 'bash', output: 'ok' });
  });

  it('normalizes status events', () => {
    const event = normalizeActivityEvent(
      envelope('e4', 'opencode.session.status', 'ses_1', { status: { type: 'busy' } }),
    );
    expect(event).toMatchObject({ kind: 'status', status: 'busy' });
  });

  it('degrades unknown event types to a neutral unknown event', () => {
    const event = normalizeActivityEvent(envelope('e5', 'opencode.widget.wobble', 'ses_1', {}));
    expect(event?.kind).toBe('unknown');
    expect(event && 'rawType' in event ? event.rawType : '').toBe('widget.wobble');
  });
});

describe('lifecycleStageFromStatus', () => {
  it('maps recognized statuses to stages', () => {
    expect(lifecycleStageFromStatus('planning')).toBe('planning');
    expect(lifecycleStageFromStatus('executing')).toBe('execution');
    expect(lifecycleStageFromStatus('running')).toBe('execution');
    expect(lifecycleStageFromStatus('verifying')).toBe('verification');
    expect(lifecycleStageFromStatus('completed')).toBe('complete');
    expect(lifecycleStageFromStatus('weird')).toBeUndefined();
  });
});
