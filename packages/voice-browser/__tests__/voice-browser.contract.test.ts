import { describe, expect, it } from 'vitest';
import { intentToAction, parseVoiceIntent } from '../src/voice-intent-parser';

describe('voice intent parsing contract', () => {
  it('rejects empty input as unknown', () => {
    const intent = parseVoiceIntent('   ');
    expect(intent.type).toBe('unknown');
    expect(intent.confidence).toBe(0);
  });

  it('navigates raw URLs to browser actions', () => {
    const intent = parseVoiceIntent('https://example.com/docs');
    expect(intent.type).toBe('navigate_url');
    expect(intent.confidence).toBeGreaterThan(0);
    expect(intentToAction(intent)).toMatchObject({ type: 'navigate' });
  });
});
