// Versioned bootstrap contract between the Node CLI and the TUI executable.
// The CLI writes this document to a temp file (or passes via stdin) before the
// TUI enters raw mode; credentials are never passed as command-line arguments.

export interface TuiBootstrapWorkspace {
  readonly id?: string;
  readonly root?: string;
  readonly name?: string;
}

export interface TuiBootstrapConnection {
  readonly apiUrl: string;
  readonly websocketUrl?: string;
  readonly authenticationReference?: string;
}

export interface TuiBootstrapSession {
  readonly invocationId: string;
  readonly source: 'root-command' | 'tui-command' | 'marketplace';
}

export interface TuiBootstrapAppearance {
  readonly themeId?: string;
  readonly reducedMotion?: boolean;
}

export interface TuiBootstrapConfigV1 {
  readonly schemaVersion: 1;
  readonly workspace?: TuiBootstrapWorkspace;
  readonly connection: TuiBootstrapConnection;
  readonly session: TuiBootstrapSession;
  readonly appearance?: TuiBootstrapAppearance;
}

export const TUI_BOOTSTRAP_SCHEMA_VERSION = 1;

export function createBootstrapConfig(input: Omit<TuiBootstrapConfigV1, 'schemaVersion'>): TuiBootstrapConfigV1 {
  return { schemaVersion: 1, ...input };
}

export function parseBootstrapConfig(value: unknown): TuiBootstrapConfigV1 {
  if (!value || typeof value !== 'object') throw new Error('Invalid TUI bootstrap document');
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new Error('Unsupported TUI bootstrap schema version');
  const connection = record.connection as TuiBootstrapConnection | undefined;
  if (!connection || typeof connection.apiUrl !== 'string' || !connection.apiUrl)
    throw new Error('TUI bootstrap requires connection.apiUrl');
  const session = record.session as TuiBootstrapSession | undefined;
  if (!session || typeof session.invocationId !== 'string')
    throw new Error('TUI bootstrap requires session.invocationId');
  return value as TuiBootstrapConfigV1;
}
