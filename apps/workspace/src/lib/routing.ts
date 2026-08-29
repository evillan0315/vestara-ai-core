export type EngineeringAgentRole = 'planner' | 'architect' | 'developer' | 'reviewer' | 'verifier' | 'documentation';

export interface ProviderModelRef {
  providerId: string;
  modelId: string;
  modelRevision?: string;
}

export interface RoutingProfile {
  id: string;
  name: string;
  description: string;
  policy: {
    mode: string;
    constraints: {
      locality: string;
      dataPolicy: string;
      costPolicy: string;
      requireIndependentVerifier: boolean;
    };
  };
}

export interface RoutingCandidate {
  ref: ProviderModelRef;
  providerName: string;
  locality: 'local' | 'cloud';
  capabilities: string[];
  availability: {
    installed: boolean;
    authenticated: boolean;
    reachable: boolean;
    available: boolean;
    allowed: boolean;
    busy: boolean;
    state: string;
    latencyMs?: number;
  };
}

export interface RoutingCatalog {
  profiles: RoutingProfile[];
  candidates: RoutingCandidate[];
}

export interface VersionedRoutingSelection {
  revision: number;
  updatedAt: string;
  updatedByClientId: string;
  selection: {
    profileId: string;
    roles: Partial<Record<EngineeringAgentRole, ProviderModelRef>>;
  };
}

export interface RoutingResolution {
  selected: RoutingCandidate;
  evidence: {
    decisionId: string;
    agentRole: EngineeringAgentRole;
    selectedAgentId: string;
    policyId: string;
    reasonCodes: string[];
    rejectedCandidates: Array<{ ref: ProviderModelRef; reasonCodes: string[] }>;
  };
}

export interface RoutingAssignment {
  taskId: string;
  revision: number;
  role: EngineeringAgentRole;
  agentId: string;
  route: ProviderModelRef;
  status: string;
  sideEffectsRecorded: boolean;
  updatedAt: string;
}

export class RoutingRevisionConflictError extends Error {
  constructor(readonly current: VersionedRoutingSelection) {
    super('Routing changed in another client');
    this.name = 'RoutingRevisionConflictError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', 'X-Vestara-Actor': 'workspace-ui' },
    ...options,
  });
  const data = (await response.json()) as T & { error?: string; current?: VersionedRoutingSelection };
  if (response.status === 409 && data.current) throw new RoutingRevisionConflictError(data.current);
  if (!response.ok) throw new Error(data.error ?? `Routing API ${response.status}`);
  return data;
}

export const routingClient = {
  catalog: () => request<RoutingCatalog>('/api/routing/catalog'),
  selection: () => request<VersionedRoutingSelection>('/api/routing/selection'),
  assignments: async () =>
    (await request<{ assignments: RoutingAssignment[] }>('/api/routing/assignments')).assignments,
  updateSelection: (selection: VersionedRoutingSelection['selection'], expectedRevision: number) =>
    request<VersionedRoutingSelection>('/api/routing/selection', {
      method: 'PATCH',
      body: JSON.stringify({ selection, expectedRevision, updatedByClientId: 'workspace-ui' }),
    }),
  preview: (input: {
    role: EngineeringAgentRole;
    agentId: string;
    profileId?: string;
    implementationProviderId?: string;
  }) =>
    request<RoutingResolution>('/api/routing/preview', {
      method: 'POST',
      body: JSON.stringify({ ...input, source: 'workspace-ui' }),
    }),
};
