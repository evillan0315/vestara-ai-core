import { describe, expect, it } from 'vitest';
import { resolveBrowserDriverFactory } from '../src/workspace-context';

interface EnvironmentCarrier {
  readonly environment: NodeJS.ProcessEnv;
}

describe('resolveBrowserDriverFactory', () => {
  it('returns undefined (Playwright default) when VESTARA_BROWSER_DRIVER is unset', () => {
    expect(resolveBrowserDriverFactory({})).toBeUndefined();
  });

  it('returns undefined for the explicit playwright driver', () => {
    expect(resolveBrowserDriverFactory({ VESTARA_BROWSER_DRIVER: 'playwright' })).toBeUndefined();
  });

  it('returns undefined for case/whitespace-normalized playwright values', () => {
    expect(resolveBrowserDriverFactory({ VESTARA_BROWSER_DRIVER: '  Playwright ' })).toBeUndefined();
  });

  it('returns an AgentBrowserDriver factory for agent-browser', () => {
    const factory = resolveBrowserDriverFactory({ VESTARA_BROWSER_DRIVER: 'agent-browser' });
    expect(factory).toBeTypeOf('function');
    const driver = factory!({ workspaceId: 'w', baseUrl: 'http://app.local' });
    expect(driver.id).toBe('agent-browser');
  });

  it('passes VESTARA_AGENT_BROWSER_EXECUTABLE_PATH into the driver as the Chromium executable', () => {
    const factory = resolveBrowserDriverFactory({
      VESTARA_BROWSER_DRIVER: 'agent-browser',
      VESTARA_AGENT_BROWSER_EXECUTABLE_PATH: '/opt/chrome/chrome',
    });
    const driver = factory!({ workspaceId: 'w', baseUrl: 'http://app.local' }) as unknown as EnvironmentCarrier;
    expect(driver.environment.AGENT_BROWSER_EXECUTABLE_PATH).toBe('/opt/chrome/chrome');
  });

  it('mirrors the session allow-list into AGENT_BROWSER_ALLOWED_DOMAINS for agent-browser', () => {
    const factory = resolveBrowserDriverFactory({ VESTARA_BROWSER_DRIVER: 'agent-browser' });
    const driver = factory!({
      workspaceId: 'w',
      baseUrl: 'http://app.local',
      allowedOrigins: ['https://docs.example.com'],
    }) as unknown as EnvironmentCarrier;
    expect(driver.environment.AGENT_BROWSER_ALLOWED_DOMAINS).toBe('app.local,docs.example.com');
  });

  it('falls back to Playwright (undefined) for unknown driver values', () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    try {
      expect(resolveBrowserDriverFactory({ VESTARA_BROWSER_DRIVER: 'safari' })).toBeUndefined();
    } finally {
      console.warn = originalWarn;
    }
    expect(warnings.some((entry) => entry.includes('unknown VESTARA_BROWSER_DRIVER "safari"'))).toBe(true);
  });
});
