export interface DocumentationFinding {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  documentId?: string;
  evidence: { kind: string; ref: string; detail?: string }[];
}

export interface DocumentationPlan {
  id: string;
  source: string;
  status: string;
  createdAt: string;
  tasks: { id: string; title: string; role: string; status: string; dependsOn: string[] }[];
}

export interface DocumentationProposal {
  id: string;
  documentPath: string;
  operation: string;
  authority: string;
  status: string;
  rationale: string;
  proposedContent: string;
  validationResult: { valid: boolean };
}

export interface DocumentationReport {
  id: string;
  generatedAt: string;
  health: Record<string, number>;
  inventory: { summary: Record<string, number> };
}

export interface DocumentationStatus {
  health: Record<string, number> | null;
  inventory: Record<string, number> | null;
  pendingProposals: number;
  lastScan: string | null;
  lastFailure: string | null;
}

export interface DocumentationStandard {
  id: string;
  description: string;
  severity: string;
  profiles: string[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/documentation${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `Request failed: ${response.status}`);
  return value;
}

export const documentationApi = {
  status: () => request<DocumentationStatus>('/status'),
  scan: () => request<unknown>('/scan', { method: 'POST', body: '{}' }),
  findings: async () => (await request<{ findings: DocumentationFinding[] }>('/findings')).findings,
  plans: async () => (await request<{ plans: DocumentationPlan[] }>('/plans')).plans,
  proposals: async () => (await request<{ proposals: DocumentationProposal[] }>('/proposals')).proposals,
  reports: async () => (await request<{ reports: DocumentationReport[] }>('/reports')).reports,
  standards: async () => (await request<{ standards: DocumentationStandard[] }>('/standards')).standards,
  createPlan: (findingIds: string[]) => request<DocumentationPlan>('/plans', { method: 'POST', body: JSON.stringify({ findingIds }) }),
  runPlan: (id: string) => request<{ proposals: DocumentationProposal[] }>(`/plans/${encodeURIComponent(id)}/run`, { method: 'POST', body: JSON.stringify({ dryRun: true }) }),
  verify: () => request<unknown>('/verify', { method: 'POST', body: JSON.stringify({ profile: 'standard' }) }),
  proposalAction: (id: string, action: 'approve' | 'reject' | 'apply') => request<DocumentationProposal>(`/proposals/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: '{}' }),
};
