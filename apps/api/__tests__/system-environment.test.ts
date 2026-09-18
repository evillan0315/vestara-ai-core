/**
 * Read-only environment registry — contract tests (SETTINGS-ENV-E1).
 *
 * Pure projection tests: no HTTP, no process spawn, no filesystem.
 * SECRET is a fake value used only to prove absence from output.
 */

import { describe, expect, it } from 'vitest';
import { type ConfigAttribution, projectRegistry } from '../src/routes/system-environment';

const FAKE_SECRET = 'sk-test-fake-secret-value-12345678';

function lookup(attributions: Record<string, ConfigAttribution>) {
  return (key: string) => attributions[key] ?? null;
}

const noConfig = () => null;

describe('environment registry enumeration', () => {
  it('projects only registered names — arbitrary host env stays invisible', () => {
    const views = projectRegistry(
      {
        VESTARA_API_PORT: '4001',
        HOST_SECRET_SOMETHING: 'should-never-appear',
        SSH_AUTH_SOCK: '/tmp/ssh-xyz/agent.1',
        PATH: '/usr/bin',
      },
      noConfig,
    );
    const names = views.map((view) => view.name);
    expect(names).not.toContain('HOST_SECRET_SOMETHING');
    expect(names).not.toContain('SSH_AUTH_SOCK');
    expect(names).not.toContain('PATH');
    expect(names).toContain('VESTARA_API_PORT');
    expect(names).toContain('OPENAI_API_KEY');
    // Registry order is curated (grouped by scope for stable UI order).
    expect(names.length).toBeGreaterThan(20);
  });

  it('renders ordinary values with environment attribution', () => {
    const views = projectRegistry({ VESTARA_API_PORT: '4001' }, noConfig);
    const port = views.find((view) => view.name === 'VESTARA_API_PORT');
    expect(port).toMatchObject({
      scope: 'api-process',
      effectiveSource: 'environment',
      hasValue: true,
      sensitive: false,
      masked: false,
      effectiveValue: '4001',
      editable: false,
      overridden: true,
      restartRequired: false,
    });
  });

  it('marks env-over-config as overridden with the file layer attributed', () => {
    const views = projectRegistry(
      { VESTARA_BROWSER_DRIVER: 'agent-browser' },
      lookup({
        'browser.driver': { source: 'workspace', sourcePath: '/repo/.vestara/config.json', value: 'playwright' },
      }),
    );
    const driver = views.find((view) => view.name === 'VESTARA_BROWSER_DRIVER');
    expect(driver).toMatchObject({
      effectiveSource: 'environment',
      effectiveValue: 'agent-browser',
      overridden: true,
      sourcePath: '/repo/.vestara/config.json',
    });
  });

  it('falls back to configuration layers, then verified defaults, then unknown', () => {
    const views = projectRegistry(
      {},
      lookup({
        'browser.driver': { source: 'user', sourcePath: '/home/u/.config/vestara/config.json', value: 'playwright' },
      }),
    );
    const driver = views.find((view) => view.name === 'VESTARA_BROWSER_DRIVER');
    expect(driver).toMatchObject({
      effectiveSource: 'user',
      effectiveValue: 'playwright',
      hasValue: true,
      overridden: false,
    });
    const idle = views.find((view) => view.name === 'VESTARA_OPENCODE_IDLE_STOP_MS');
    expect(idle).toMatchObject({ effectiveSource: 'default', effectiveValue: '1800000', hasValue: false });
    const repo = views.find((view) => view.name === 'VESTARA_REPO');
    expect(repo).toMatchObject({ effectiveSource: 'unknown', hasValue: false });
    expect(repo?.effectiveValue).toBeUndefined();
  });
});

describe('environment registry secrets', () => {
  it('exposes presence only — plaintext never enters the serialized view', () => {
    const views = projectRegistry(
      { OPENAI_API_KEY: FAKE_SECRET, TELEGRAM_BOT_TOKEN: FAKE_SECRET, GITHUB_TOKEN: '' },
      noConfig,
    );
    const serialized = JSON.stringify(views);
    expect(serialized).not.toContain(FAKE_SECRET);
    const openai = views.find((view) => view.name === 'OPENAI_API_KEY');
    expect(openai).toMatchObject({ sensitive: true, masked: true, hasValue: true, effectiveSource: 'environment' });
    expect(openai?.effectiveValue).toBeUndefined();
    expect('effectiveValue' in (openai ?? {})).toBe(false);
    const github = views.find((view) => view.name === 'GITHUB_TOKEN');
    expect(github).toMatchObject({ sensitive: true, masked: false, hasValue: false, effectiveSource: 'unknown' });
  });

  it('treats VESTARA_API_KEY as sensitive via explicit registry marking', () => {
    const views = projectRegistry({ VESTARA_API_KEY: FAKE_SECRET }, noConfig);
    const key = views.find((view) => view.name === 'VESTARA_API_KEY');
    expect(key?.sensitive).toBe(true);
    expect(JSON.stringify(views)).not.toContain(FAKE_SECRET);
  });
});
