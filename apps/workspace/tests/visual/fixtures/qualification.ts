import type { QualificationTrial, QualificationTrials } from '../../../src/lib/qualification.js';

export const QUALIFICATION_VISUAL_PROFILE_ID = 'deepseekV4FlashOpenCodeGo';

export const qualificationVisualTrial = {
  profileId: QUALIFICATION_VISUAL_PROFILE_ID,
  outcome: 'awaiting-human-approval',
  credentialResolved: true,
  identity: {
    providerId: 'opencode',
    modelId: 'deepseek-v4-flash',
    repositorySha: 'visual-fixture-sha',
    contextHash: 'visual-fixture-context',
    promptTemplateVersion: 'wfo-e2e-002b-live.visual',
  },
  execution: {
    callCount: 3,
    retryCount: 1,
    totalInputTokens: 18420,
    totalOutputTokens: 3910,
    totalDurationMs: 142000,
    providerStatuses: ['ok', 'schema-retry', 'ok'],
    controls: {
      status: 'execution-blocked',
      reasons: ['Visual fixture records the governed planning/review path only.'],
    },
  },
  planner: {
    schemaValidFirstAttempt: false,
    versions: [
      { version: 1, planHash: 'plan-v1-visual-fixture' },
      { version: 2, planHash: 'plan-v2-visual-fixture' },
    ],
    plan: {
      summary:
        'Add a read-only worker scheduling status endpoint with targeted contract coverage and documentation.',
      assumptions: [
        'The route is read-only and does not mutate worker state.',
        'Existing workspace runtime contracts remain authoritative.',
      ],
      steps: [
        {
          id: 'api-contract',
          description: 'Define the response contract for worker scheduling status.',
          assignedRole: 'planner',
          expectedArtifacts: ['typed endpoint response', 'route handler'],
          verificationRequirements: ['contract test covers empty and active worker states'],
        },
        {
          id: 'workspace-view',
          description: 'Expose the status in the workspace operations surface.',
          assignedRole: 'developer',
          expectedArtifacts: ['workspace UI projection'],
          verificationRequirements: ['visual state remains read-only'],
        },
      ],
      affectedPaths: ['apps/api/src/routes/workers.ts', 'apps/workspace/src/pages/Workers.tsx'],
      outOfScope: ['starting or stopping workers', 'changing scheduler policy'],
      requiredApprovals: ['human approval before execution'],
      risks: ['stale worker snapshots could be mistaken for live scheduler authority'],
      completionCriteria: ['endpoint returns deterministic status', 'tests document authority boundaries'],
    },
    materialProgress: true,
  },
  reviewer: {
    review: {
      conclusion: 'changes-requested',
      findings: [
        {
          id: 'review-001',
          severity: 'warning',
          category: 'authority',
          message: 'Clarify that the endpoint is a projection and not scheduler authority.',
          evidenceRefs: ['plan-v1-visual-fixture'],
        },
      ],
      evidenceRefs: ['review-visual-fixture'],
    },
    materialProgress: true,
  },
  workflowResult: {
    conclusion: 'blocked-before-execution',
    stoppedBeforeExecution: true,
    reasons: ['Execution requires human approval in the qualification trial.'],
    evidenceRefs: ['plan-v2-visual-fixture', 'review-visual-fixture'],
  },
  invocations: [
    {
      role: 'planner',
      modelId: 'deepseek-v4-flash',
      providerStatus: 'ok',
      schemaValid: false,
      retries: 1,
      inputTokens: 8200,
      outputTokens: 1840,
      materialProgress: true,
      schemaErrors: ['missing completionCriteria'],
    },
    {
      role: 'reviewer',
      modelId: 'deepseek-v4-flash',
      providerStatus: 'ok',
      schemaValid: true,
      retries: 0,
      inputTokens: 5110,
      outputTokens: 920,
      materialProgress: true,
      schemaErrors: [],
    },
    {
      role: 'planner',
      modelId: 'deepseek-v4-flash',
      providerStatus: 'ok',
      schemaValid: true,
      retries: 0,
      inputTokens: 5110,
      outputTokens: 1150,
      materialProgress: true,
      schemaErrors: [],
    },
  ],
} satisfies QualificationTrial;

export const qualificationVisualTrials = {
  repositorySha: 'visual-fixture-sha',
  contextHash: 'visual-fixture-context',
  generatedAt: '2026-09-20T00:00:00.000Z',
  trials: [qualificationVisualTrial],
} satisfies QualificationTrials;
