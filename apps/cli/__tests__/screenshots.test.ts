import { describe, expect, it } from 'vitest';
import { buildScreenshotInvocation } from '../src/commands/screenshots.js';

const repositoryRoot = process.cwd();

describe('screenshots command', () => {
  it('defaults to a non-mutating comparison run', () => {
    const invocation = buildScreenshotInvocation([], repositoryRoot);

    expect(invocation.action).toBe('run');
    expect(invocation.script).toBe('screenshots');
    expect(invocation.cwd).toBe(repositoryRoot);
    expect(invocation.env.SCREENSHOT_MODE).toBe('compare');
  });

  it('maps validated filters to the existing Playwright environment', () => {
    const invocation = buildScreenshotInvocation(
      [
        'run',
        '--viewport',
        'mobile',
        '--theme',
        'dark',
        '--routes',
        'dashboard, docs',
        '--tolerance',
        '0.2',
        '--max-diff',
        '1.5',
        '--base-url',
        'http://localhost:5173/',
        '--wait-network',
        '--ci',
      ],
      repositoryRoot,
    );

    expect(invocation.env.SCREENSHOT_VIEWPORT).toBe('mobile');
    expect(invocation.env.SCREENSHOT_THEME).toBe('dark');
    expect(invocation.env.SCREENSHOT_ROUTES).toBe('dashboard,docs');
    expect(invocation.env.SCREENSHOT_TOLERANCE).toBe('0.2');
    expect(invocation.env.SCREENSHOT_MAX_DIFF).toBe('1.5');
    expect(invocation.env.PLAYWRIGHT_BASE_URL).toBe('http://localhost:5173');
    expect(invocation.env.SCREENSHOT_WAIT_NETWORK).toBe('1');
    expect(invocation.env.CI).toBe('true');
  });

  it('requires an explicit update action before selecting the baseline script', () => {
    const invocation = buildScreenshotInvocation(['update', '--routes', 'settings'], repositoryRoot);
    expect(invocation.action).toBe('update');
    expect(invocation.script).toBe('screenshots:update');
    expect(invocation.env.SCREENSHOT_MODE).toBe('update');
  });

  it.each([
    [['run', '--viewport', 'watch'], '--viewport must be one of'],
    [['run', '--theme', 'system'], '--theme must be one of'],
    [['run', '--routes', '../secrets'], '--routes must be'],
    [['run', '--tolerance', '2'], '--tolerance must be between'],
    [['run', '--workers', '8'], 'Unknown screenshots option'],
    [['publish'], 'Usage: vestara screenshots'],
  ])('rejects invalid arguments: %s', (args, message) => {
    expect(() => buildScreenshotInvocation(args, repositoryRoot)).toThrow(message);
  });
});
