// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseShellIntent, stripShellPrefix } from '../src/components/assistant/shell-mode';

describe('parseShellIntent', () => {
  it('detects $ prefix with a command', () => {
    expect(parseShellIntent('$ pnpm vestara doctor')).toEqual({
      command: 'pnpm vestara doctor',
      prefix: '$',
    });
  });

  it('detects $ without space', () => {
    expect(parseShellIntent('$ls -la')).toEqual({ command: 'ls -la', prefix: '$' });
  });

  it('tolerates leading whitespace', () => {
    expect(parseShellIntent('  $ echo hi')).toEqual({ command: 'echo hi', prefix: '$' });
  });

  it('detects /terminal prefix', () => {
    expect(parseShellIntent('/terminal pnpm test')).toEqual({
      command: 'pnpm test',
      prefix: '/terminal',
    });
  });

  it('returns null for chat text', () => {
    expect(parseShellIntent('how do I deploy?')).toBeNull();
    expect(parseShellIntent('the $5 price is fine')).toBeNull();
  });

  it('returns null for a bare prefix with no command (still typing)', () => {
    expect(parseShellIntent('$')).toBeNull();
    expect(parseShellIntent('$   ')).toBeNull();
    expect(parseShellIntent('/terminal')).toBeNull();
    expect(parseShellIntent('/terminal   ')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parseShellIntent('')).toBeNull();
    expect(parseShellIntent('   ')).toBeNull();
  });
});

describe('stripShellPrefix', () => {
  it('strips the prefix, keeping the command', () => {
    expect(stripShellPrefix('$ pnpm test')).toBe('pnpm test');
    expect(stripShellPrefix('/terminal pnpm test')).toBe('pnpm test');
  });

  it('passes chat text through unchanged', () => {
    expect(stripShellPrefix('hello there')).toBe('hello there');
    expect(stripShellPrefix('$')).toBe('$');
  });
});
