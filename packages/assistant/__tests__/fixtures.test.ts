import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_ERROR_NOTICE,
  ASSISTANT_GREETING,
  ASSISTANT_IDENTITY,
  ASSISTANT_REPLIES,
  ASSISTANT_SUGGESTIONS,
} from '../src/fixtures';

describe('assistant fixtures', () => {
  it('has a stable identity and greeting', () => {
    expect(ASSISTANT_IDENTITY.name).toBe('Vestara Assistant');
    expect(ASSISTANT_GREETING).toHaveLength(1);
    expect(ASSISTANT_GREETING[0]?.from).toBe('assistant');
    expect(ASSISTANT_GREETING[0]?.text.length).toBeGreaterThan(0);
  });

  it('uses unique message ids', () => {
    const ids = ASSISTANT_GREETING.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers deterministic suggestions and replies', () => {
    expect(ASSISTANT_SUGGESTIONS.length).toBeGreaterThan(0);
    expect(ASSISTANT_REPLIES.length).toBeGreaterThan(0);
    expect(ASSISTANT_ERROR_NOTICE.length).toBeGreaterThan(0);
  });
});
