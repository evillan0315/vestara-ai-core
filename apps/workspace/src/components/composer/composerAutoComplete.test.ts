import { describe, expect, it } from 'vitest';
import {
  ALL_COMMANDS,
  applyAutoComplete,
  detectAutoComplete,
  dismissAutoComplete,
} from './composerAutoComplete';

describe('detectAutoComplete', () => {
  it('returns null for plain text without a trigger', () => {
    expect(detectAutoComplete('hello world')).toBeNull();
    expect(detectAutoComplete('I want to /suggest something')).toBeNull();
  });

  it('detects a bare trailing slash', () => {
    const state = detectAutoComplete('Please help me\n/');
    expect(state).not.toBeNull();
    expect(state?.active).toBe(true);
    expect(state?.query).toBe('');
    expect(state?.commands).toHaveLength(ALL_COMMANDS.length);
  });

  it('detects a slash at the start of the draft', () => {
    const state = detectAutoComplete('/');
    expect(state).not.toBeNull();
    expect(state?.commands.length).toBeGreaterThan(0);
  });

  it('filters commands by partial query', () => {
    const state = detectAutoComplete('/doc');
    expect(state).not.toBeNull();
    expect(state?.query).toBe('doc');
    expect(state?.commands.length).toBeGreaterThan(0);
    expect(state?.commands.every((c) => c.trigger.startsWith('/doc'))).toBe(true);
  });

  it('returns null when no command matches the partial query', () => {
    expect(detectAutoComplete('/xyz')).toBeNull();
  });

  it('detects a full command trigger', () => {
    const state = detectAutoComplete('/suggest');
    expect(state).not.toBeNull();
    expect(state?.query).toBe('suggest');
    expect(state?.commands).toHaveLength(1);
    expect(state?.commands[0]?.mode).toBe('suggest');
  });

  it('does not trigger on inline slash within a word', () => {
    expect(detectAutoComplete('and/or')).toBeNull();
  });

  it('triggers on a new line with leading whitespace', () => {
    const state = detectAutoComplete('Some text\n  /exp');
    expect(state).not.toBeNull();
    expect(state?.query).toBe('exp');
  });
});

describe('applyAutoComplete', () => {
  it('replaces the trigger with the selected command', () => {
    const state = detectAutoComplete('/doc');
    expect(state).not.toBeNull();
    const command = state?.commands[0];
    if (!command) throw new Error('No command');
    expect(applyAutoComplete('/doc', state, command)).toBe('/docs');
  });

  it('preserves text before the trigger', () => {
    const state = detectAutoComplete('Please help\n/');
    expect(state).not.toBeNull();
    const command = state?.commands[0];
    if (!command) throw new Error('No command');
    expect(applyAutoComplete('Please help\n/', state, command)).toBe(`Please help\n/${command.mode}`);
  });
});

describe('dismissAutoComplete', () => {
  it('removes the trigger and trailing whitespace', () => {
    const state = detectAutoComplete('Please help\n/');
    expect(state).not.toBeNull();
    expect(dismissAutoComplete('Please help\n/', state)).toBe('Please help');
  });

  it('handles trigger at the start', () => {
    const state = detectAutoComplete('/');
    expect(state).not.toBeNull();
    expect(dismissAutoComplete('/', state)).toBe('');
  });
});
