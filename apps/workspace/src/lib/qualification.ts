/**
 * Qualification client — typed fetch wrappers over the live-trial evidence
 * endpoints (`apps/api/src/routes/qualification.ts`).
 */

export interface QualificationTrial {
  profileId: string;
  outcome: string;
  credentialResolved: boolean;
  identity: {
    providerId: string;
    modelId: string;
    repositorySha: string;
    contextHash: string;
    promptTemplateVersion: string;
  };
  execution: {
    callCount: number;
    retryCount: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalDurationMs: number;
    providerStatuses: string[];
    controls: { status: string; reasons: string[] };
  };
  planner: {
    schemaValidFirstAttempt: boolean;
    versions: Array<{ version: number; planHash: string }>;
    plan: unknown;
    materialProgress: boolean;
  };
  reviewer: { review: unknown; materialProgress: boolean };
  workflowResult: {
    conclusion: string;
    stoppedBeforeExecution: boolean;
    reasons: string[];
    evidenceRefs: string[];
  };
  invocations: Array<{
    role: string;
    modelId: string;
    providerStatus: string;
    schemaValid: boolean;
    retries: number;
    inputTokens: number;
    outputTokens: number;
    materialProgress: boolean;
    schemaErrors: string[];
  }>;
}

export interface QualificationTrials {
  repositorySha: string;
  contextHash: string;
  generatedAt: string;
  trials: QualificationTrial[];
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Qualification API error: ${res.status}`);
  return (await res.json()) as T;
}

export const qualificationClient = {
  async trials(): Promise<QualificationTrials> {
    return request<QualificationTrials>('/api/qualification/trials');
  },
  async trial(profileId: string): Promise<QualificationTrial> {
    const data = await request<{ trial: QualificationTrial }>(
      `/api/qualification/trials/${encodeURIComponent(profileId)}`,
    );
    return data.trial;
  },
  async run(profileId: string): Promise<{ started: boolean; profileId: string }> {
    const res = await fetch('/api/qualification/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId }),
    });
    if (!res.ok) throw new Error(`Qualification run error: ${res.status}`);
    return (await res.json()) as { started: boolean; profileId: string };
  },
};
