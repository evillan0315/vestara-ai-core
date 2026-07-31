import type { ResolvedConfiguration, SettingsSectionId } from '@vestara/configuration';

export interface RuntimeStatusDto {
  status: string;
  apiEndpoint: string;
  websocketEndpoint: string;
  websocketStatus: string;
  runtimeVersion: string;
  workspaceId: string;
  currentSession: string;
  activeExecutionCount: number;
  eventBusStatus: string;
  engineeringGraphStatus: string;
  engineeringEventStoreStatus: string;
  engineeringEventCount: number;
  filesystemRuntimeStatus: string;
  verificationRuntimeStatus: string;
  telemetryStatus: string;
}

export interface CliStatusDto {
  detected: boolean;
  executablePath: string | null;
  cliVersion: string | null;
  runtimeVersion: string;
  compatible: boolean;
  runtimeConnected: boolean;
  connectionEvidence: string;
  workspaceId: string;
  connectedWorkspace: string;
  runtimeEndpoint: string;
  authenticationStatus: string;
  localSocketPath: string;
  localSocketAvailable: boolean;
  transport: 'unix-socket' | 'http';
  configurationSynchronized: boolean;
  verifiedAt?: string;
  validation?: Array<{ stage: string; status: 'passed' | 'failed' }>;
}

export interface EventStoreStatusDto {
  persistence: 'memory' | 'sqlite';
  warning?: string;
  eventCount: number;
  latestSequence: number;
  oldestRetainedAt: string | null;
  checkpointCount: number;
  checkpointInterval: number;
  checkpointRetention: number;
  eventSchemaVersion: number;
  workspaceStoreIdentity: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  return body;
}

export const settingsClient = {
  configuration: () => request<ResolvedConfiguration>('/api/settings'),
  runtime: () => request<RuntimeStatusDto>('/api/runtime/status'),
  cli: () => request<CliStatusDto>('/api/cli/status'),
  history: () => request<EventStoreStatusDto>('/api/graph/store'),
  save: (configuration: ResolvedConfiguration, section: SettingsSectionId, overrides: Record<string, unknown>) =>
    request<{ configuration: ResolvedConfiguration }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ section, overrides, expectedRevision: configuration.revision, source: 'workspace-ui' }),
    }),
  reset: (configuration: ResolvedConfiguration, section: SettingsSectionId) =>
    request<{ configuration: ResolvedConfiguration }>(`/api/settings/overrides/${section}`, {
      method: 'DELETE',
      headers: { 'If-Match': configuration.revision, 'X-Vestara-Source': 'workspace-ui' },
    }),
  healthCheck: () => request<{ health: { status: string } }>('/api/runtime/health-check', { method: 'POST' }),
  rebuildGraph: () => request<{ result: unknown }>('/api/graph/rebuild', { method: 'POST' }),
  verifyCli: () => request<CliStatusDto>('/api/cli/verify', { method: 'POST' }),
  verifyStore: () =>
    request<{ valid: boolean; checkedAt: string }>('/api/graph/store/integrity', { method: 'POST' }),
  checkpoint: () => request<{ checkpoint: { seq: number } }>('/api/graph/store/checkpoint', { method: 'POST' }),
};
