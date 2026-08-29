// Package-owned configuration schema for the TUI. Precedence (highest first):
// CLI override > workspace configuration > user configuration > package defaults.

export type TuiDefaultView = 'chat' | 'sessions' | 'plans' | 'graph' | 'execution' | 'workflow' | 'logs';

export interface TuiConfiguration {
  readonly enabled: boolean;
  readonly defaultView: TuiDefaultView;
  readonly connection: {
    readonly mode: 'local' | 'remote';
    readonly apiUrl?: string;
    readonly websocketUrl?: string;
    readonly reconnect: boolean;
    readonly reconnectDelayMs: number;
  };
  readonly appearance: {
    readonly theme: string;
    readonly density: 'compact' | 'comfortable';
    readonly reducedMotion: boolean;
    readonly borderStyle: 'auto' | 'unicode' | 'ascii';
  };
  readonly telemetry: {
    readonly maxBufferedEvents: number;
  };
}

export const TUI_CONFIGURATION_DEFAULTS: TuiConfiguration = {
  enabled: true,
  defaultView: 'chat',
  connection: {
    mode: 'local',
    apiUrl: 'http://127.0.0.1:3001',
    reconnect: true,
    reconnectDelayMs: 1000,
  },
  appearance: {
    theme: 'gold',
    density: 'comfortable',
    reducedMotion: false,
    borderStyle: 'auto',
  },
  telemetry: {
    maxBufferedEvents: 500,
  },
};

export const TUI_DEFAULT_VIEWS: readonly TuiDefaultView[] = [
  'chat',
  'sessions',
  'plans',
  'graph',
  'execution',
  'workflow',
  'logs',
];

const THEMES = new Set(['gold', 'amber', 'emerald', 'blue', 'violet', 'rose', 'teal', 'neutral', 'orange']);

export interface TuiConfigValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** Validate a config object strictly. An invalid config must not reach the executable. */
export function validateTuiConfiguration(value: unknown): TuiConfigValidation {
  if (!value || typeof value !== 'object') return { valid: false, errors: ['configuration must be an object'] };
  const record = value as Record<string, unknown>;
  const errors: string[] = [];
  if (record.enabled !== undefined && typeof record.enabled !== 'boolean') errors.push('enabled must be a boolean');
  if (record.defaultView !== undefined && !TUI_DEFAULT_VIEWS.includes(record.defaultView as TuiDefaultView))
    errors.push(`defaultView must be one of: ${TUI_DEFAULT_VIEWS.join(', ')}`);
  const connection = record.connection as Record<string, unknown> | undefined;
  if (connection) {
    if (connection.mode !== undefined && connection.mode !== 'local' && connection.mode !== 'remote')
      errors.push('connection.mode must be local or remote');
    if (connection.apiUrl !== undefined && typeof connection.apiUrl !== 'string')
      errors.push('connection.apiUrl must be a string');
    if (connection.reconnect !== undefined && typeof connection.reconnect !== 'boolean')
      errors.push('connection.reconnect must be a boolean');
  }
  const appearance = record.appearance as Record<string, unknown> | undefined;
  if (appearance) {
    if (appearance.theme !== undefined && typeof appearance.theme === 'string' && !THEMES.has(appearance.theme))
      errors.push(`appearance.theme must be one of: ${[...THEMES].join(', ')}`);
    if (appearance.density !== undefined && appearance.density !== 'compact' && appearance.density !== 'comfortable')
      errors.push('appearance.density must be compact or comfortable');
    if (appearance.reducedMotion !== undefined && typeof appearance.reducedMotion !== 'boolean')
      errors.push('appearance.reducedMotion must be a boolean');
    if (
      appearance.borderStyle !== undefined &&
      appearance.borderStyle !== 'auto' &&
      appearance.borderStyle !== 'unicode' &&
      appearance.borderStyle !== 'ascii'
    )
      errors.push('appearance.borderStyle must be auto, unicode, or ascii');
  }
  return { valid: errors.length === 0, errors };
}

export function resolveTuiConfiguration(input: Partial<TuiConfiguration> | undefined): TuiConfiguration {
  if (!input) return TUI_CONFIGURATION_DEFAULTS;
  const validation = validateTuiConfiguration(input);
  if (!validation.valid) throw new Error(`Invalid TUI configuration: ${validation.errors.join('; ')}`);
  return {
    ...TUI_CONFIGURATION_DEFAULTS,
    ...input,
    connection: { ...TUI_CONFIGURATION_DEFAULTS.connection, ...input.connection },
    appearance: { ...TUI_CONFIGURATION_DEFAULTS.appearance, ...input.appearance },
    telemetry: { ...TUI_CONFIGURATION_DEFAULTS.telemetry, ...input.telemetry },
  };
}
