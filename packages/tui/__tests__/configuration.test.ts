import { describe, expect, it } from 'vitest';
import { createBootstrapConfig, parseBootstrapConfig } from '../src/bootstrap.js';
import {
  resolveTuiConfiguration,
  TUI_CONFIGURATION_DEFAULTS,
  TUI_DEFAULT_VIEWS,
  validateTuiConfiguration,
} from '../src/configuration.js';

describe('TUI configuration schema', () => {
  it('provides sensible defaults', () => {
    expect(TUI_CONFIGURATION_DEFAULTS.enabled).toBe(true);
    expect(TUI_CONFIGURATION_DEFAULTS.defaultView).toBe('chat');
    expect(TUI_CONFIGURATION_DEFAULTS.appearance.theme).toBe('gold');
  });

  it('validates a valid config', () => {
    const validation = validateTuiConfiguration(TUI_CONFIGURATION_DEFAULTS);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('rejects an invalid default view', () => {
    const validation = validateTuiConfiguration({ ...TUI_CONFIGURATION_DEFAULTS, defaultView: 'nope' });
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('defaultView');
  });

  it('rejects an unknown theme', () => {
    const validation = validateTuiConfiguration({
      ...TUI_CONFIGURATION_DEFAULTS,
      appearance: { ...TUI_CONFIGURATION_DEFAULTS.appearance, theme: 'neon' },
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('theme');
  });

  it('resolves a partial config by merging defaults', () => {
    const config = resolveTuiConfiguration({
      defaultView: 'plans',
      connection: { mode: 'remote', apiUrl: 'https://x' },
    });
    expect(config.defaultView).toBe('plans');
    expect(config.connection.mode).toBe('remote');
    expect(config.appearance.theme).toBe('gold');
    expect(config.telemetry.maxBufferedEvents).toBe(500);
  });

  it('defines the supported default views', () => {
    expect(TUI_DEFAULT_VIEWS).toContain('chat');
    expect(TUI_DEFAULT_VIEWS).toContain('workflow');
    expect(TUI_DEFAULT_VIEWS).toContain('execution');
  });
});

describe('TUI bootstrap contract', () => {
  it('creates a versioned bootstrap document', () => {
    const doc = createBootstrapConfig({
      connection: { apiUrl: 'http://127.0.0.1:3001' },
      session: { invocationId: 'inv-1', source: 'root-command' },
    });
    expect(doc.schemaVersion).toBe(1);
  });

  it('parses a valid bootstrap document', () => {
    const doc = parseBootstrapConfig({
      schemaVersion: 1,
      connection: { apiUrl: 'http://127.0.0.1:3001' },
      session: { invocationId: 'inv-1', source: 'tui-command' },
    });
    expect(doc.connection.apiUrl).toBe('http://127.0.0.1:3001');
  });

  it('rejects missing apiUrl', () => {
    expect(() =>
      parseBootstrapConfig({
        schemaVersion: 1,
        connection: {},
        session: { invocationId: 'inv-1', source: 'root-command' },
      }),
    ).toThrow('apiUrl');
  });

  it('rejects an unsupported schema version', () => {
    expect(() =>
      parseBootstrapConfig({
        schemaVersion: 2,
        connection: { apiUrl: 'http://x' },
        session: { invocationId: 'inv-1', source: 'root-command' },
      }),
    ).toThrow('schema version');
  });
});
