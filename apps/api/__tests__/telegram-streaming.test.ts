/**
 * VES-TG-STREAM — Telegram live-edit helper tests.
 *
 * Proves the flood-guard logic for editMessageText streaming:
 * empty/identical text never fires (the Bot API rejects no-op edits),
 * and distinct text is throttled.
 */

import { describe, expect, it } from 'vitest';
import { STREAM_EDIT_THROTTLE_MS, shouldSendStreamEdit, truncateLiveText } from '../src/routes/telegram';

describe('shouldSendStreamEdit', () => {
  it('fires for new text after the throttle window', () => {
    expect(shouldSendStreamEdit(2000, 0, 'Hi', 'Hi there')).toBe(true);
  });

  it('suppresses edits inside the throttle window', () => {
    expect(shouldSendStreamEdit(500, 0, 'Hi', 'Hi there')).toBe(false);
  });

  it('never fires for empty or identical text (Bot API rejects no-ops)', () => {
    expect(shouldSendStreamEdit(5000, 0, 'Hi', '')).toBe(false);
    expect(shouldSendStreamEdit(5000, 0, 'Hi', 'Hi')).toBe(false);
  });

  it('fires on the first delta when nothing was sent yet', () => {
    expect(shouldSendStreamEdit(Date.now(), 0, '', 'Hello')).toBe(true);
  });

  it('honours a custom throttle', () => {
    expect(shouldSendStreamEdit(100, 0, 'a', 'ab', 50)).toBe(true);
    expect(shouldSendStreamEdit(100, 0, 'a', 'ab', STREAM_EDIT_THROTTLE_MS)).toBe(false);
  });
});

describe('truncateLiveText', () => {
  it('passes short text through untouched', () => {
    expect(truncateLiveText('hello')).toBe('hello');
  });

  it('caps long text at the chunk target for live edits', () => {
    const long = 'x'.repeat(5000);
    expect(truncateLiveText(long)).toBe('x'.repeat(4000));
  });
});
