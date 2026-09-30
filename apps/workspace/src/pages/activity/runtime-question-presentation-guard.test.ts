/**
 * AR-TOOL-ASK-003A4B — Browser resolution guard evidence.
 *
 * Proves: Activity/SSE hint alone cannot enable answer controls; controls
 * become actionable ONLY with an authoritative presentation credential.
 */

import { describe, expect, it } from 'vitest';
import { buildPresentRequest, isAnswerControlsEnabled } from './runtime-question-presentation-guard';

describe('AR-TOOL-ASK-003A4B browser resolution guard', () => {
  it('hint alone never enables answer controls', () => {
    expect(isAnswerControlsEnabled(null)).toBe(false);
    expect(isAnswerControlsEnabled(undefined)).toBe(false);
  });

  it('incomplete credentials stay non-actionable', () => {
    expect(
      isAnswerControlsEnabled({
        interactionId: 'rq-1',
        conversationId: 'conv-1',
        openCodeSessionId: 'ses',
        openCodeRequestId: 'req',
        status: 'presented',
        version: 0,
        claimToken: 'token',
        questions: [],
      }),
    ).toBe(false);
    expect(
      isAnswerControlsEnabled({
        interactionId: 'rq-1',
        conversationId: 'conv-1',
        openCodeSessionId: 'ses',
        openCodeRequestId: 'req',
        status: 'presented',
        version: 1,
        claimToken: '',
        questions: [],
      }),
    ).toBe(false);
  });

  it('complete presented credential enables controls', () => {
    expect(
      isAnswerControlsEnabled({
        interactionId: 'rq-1',
        conversationId: 'conv-1',
        openCodeSessionId: 'ses',
        openCodeRequestId: 'req',
        status: 'presented',
        version: 1,
        claimToken: 'single-use-token',
        questions: [{ header: 'H', question: 'Q?', options: [] }],
      }),
    ).toBe(true);
  });

  it('builds the exact POST present request without inference', () => {
    expect(buildPresentRequest({ conversationId: 'conv-1' })).toBeNull();
    expect(buildPresentRequest({ conversationId: '', interactionId: 'rq-1' })).toBeNull();
    const request = buildPresentRequest({
      conversationId: 'conv-1',
      interactionId: 'rq-1',
      openCodeSessionId: 'ses',
      openCodeRequestId: 'req',
    });
    expect(request?.method).toBe('POST');
    expect(request?.path).toBe('/api/activity-room/v1/interactions/rq-1/present');
    expect(request?.body).toEqual({ conversationId: 'conv-1', openCodeSessionId: 'ses', openCodeRequestId: 'req' });
  });
});
