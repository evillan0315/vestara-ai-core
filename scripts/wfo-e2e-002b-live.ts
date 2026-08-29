/**
 * WFO-E2E-002B-LIVE — comparable live planning & review qualification runs.
 *
 * Runs the governed Planner + Reviewer trial against the configured Opencode Go
 * profiles (default: deepseekV4FlashOpenCodeGo, mimoV25OpenCodeGo) using one
 * fixed repository + context snapshot and identical trial limits, then writes a
 * structured evidence report to `stage/wfo-e2e-002b-live/` for inspection.
 *
 * The trial is advisory and execution-blocked: no repository mutation, no
 * implementation tasks. Credentials resolve at invocation and are never logged.
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/wfo-e2e-002b-live.ts [profileId ...]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  hashText,
  OpenCodeRuntimeTrialProvider,
  type PlanTrialContext,
  type PlanTrialResult,
  PlanTrialRunner,
  type RealAgentProfilePresetId,
  resolveRealAgentProfile,
} from '../packages/workflow-orchestrator/__tests__/e2e-support/real-agent';

const CONTEXT: PlanTrialContext = {
  objective:
    'Add a read-only API endpoint that exposes worker scheduling status, include targeted tests, and document the endpoint without changing worker lifecycle semantics.',
  repositorySummary:
    'Vestara AI core — TypeScript pnpm workspace. WorkerCluster, WorkerRegistry, WorkerScheduler, and WorkerStore live in packages/workflow-orchestrator/src/distributed/.',
  relevantAdrs: ['ADR-012 — verification evidence framework', 'PCS-027 — distributed worker cluster'],
  packageBoundaries: ['packages/workflow-orchestrator/src/distributed/'],
  verificationRequirements: ['targeted tests', 'pnpm build', 'pnpm lint:check'],
  permittedScope: ['packages/workflow-orchestrator/src/distributed/'],
};

const DEFAULT_PROFILES: RealAgentProfilePresetId[] = ['deepseekV4FlashOpenCodeGo', 'mimoV25OpenCodeGo'];

function toReport(profileId: string, repositorySha: string, contextHash: string, result: PlanTrialResult) {
  const invocations = result.invocations.map((record) => ({
    role: record.role,
    providerId: record.invocation.providerId,
    modelId: record.invocation.modelId,
    providerStatus: record.invocation.providerStatus,
    schemaValid: record.invocation.schemaValidation === 'valid',
    retries: record.invocation.retryCount,
    inputTokens: record.invocation.inputTokens,
    outputTokens: record.invocation.outputTokens,
    durationMs: record.invocation.durationMs,
    materialProgress: record.invocation.materialProgress,
    schemaErrors: record.errors,
  }));
  return {
    profileId,
    identity: {
      providerId: result.invocations[0]?.invocation.providerId,
      modelId: result.invocations[0]?.invocation.modelId,
      repositorySha,
      contextHash,
      promptTemplateVersion: result.invocations[0]?.invocation.promptTemplateVersion,
    },
    execution: {
      callCount: result.invocations.length,
      retryCount: result.invocations.reduce((sum, record) => sum + record.invocation.retryCount, 0),
      totalInputTokens: result.invocations.reduce((sum, record) => sum + record.invocation.inputTokens, 0),
      totalOutputTokens: result.invocations.reduce((sum, record) => sum + record.invocation.outputTokens, 0),
      totalDurationMs: result.invocations.reduce((sum, record) => sum + record.invocation.durationMs, 0),
      providerStatuses: [...new Set(result.invocations.map((record) => record.invocation.providerStatus))],
      controls: result.controls,
    },
    planner: {
      schemaValidFirstAttempt: result.invocations
        .filter((record) => record.role === 'planner')
        .some((record) => record.valid && record.invocation.retryCount === 0),
      versions: result.planVersions.map((artifact) => ({ version: artifact.version, planHash: artifact.planHash })),
      plan: result.planArtifact?.plan ?? null,
      materialProgress: result.invocations.some(
        (record) => record.role === 'planner' && record.invocation.materialProgress,
      ),
    },
    reviewer: {
      review: result.review ?? null,
      materialProgress: result.invocations.some(
        (record) => record.role === 'reviewer' && record.invocation.materialProgress,
      ),
    },
    workflowResult: {
      conclusion: result.conclusion,
      stoppedBeforeExecution: result.stoppedBeforeExecution,
      reasons: result.reasons,
      evidenceRefs: result.evidenceRefs,
    },
    invocations,
  };
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const profiles: RealAgentProfilePresetId[] =
    requested.length > 0 ? (requested as RealAgentProfilePresetId[]) : DEFAULT_PROFILES;
  const repositorySha = process.env.VESTARA_REPO_SHA ?? 'local-working-tree';
  const contextHash = hashText(JSON.stringify(CONTEXT));
  const reports: unknown[] = [];

  for (const profileId of profiles) {
    const profile = resolveRealAgentProfile(profileId);
    let provider;
    try {
      provider = OpenCodeRuntimeTrialProvider.fromEnv();
    } catch (error) {
      reports.push({
        profileId,
        outcome: 'advisory-failure',
        reason: error instanceof Error ? error.message : 'credential resolution failed',
        credentialResolved: false,
      });
      continue;
    }
    const runner = new PlanTrialRunner({ maxPlanRevisions: 2 });
    const result = await runner.run({
      workflowId: `live-${profileId}`,
      profile,
      provider,
      context: CONTEXT,
      promptTemplateVersion: '002b-live-v1',
    });
    reports.push({
      profileId,
      outcome: result.conclusion,
      credentialResolved: true,
      ...toReport(profileId, repositorySha, contextHash, result),
    });
  }

  const outputDir = path.resolve(process.cwd(), 'stage', 'wfo-e2e-002b-live');
  fs.mkdirSync(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, `report-${Date.now()}.json`);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), repositorySha, contextHash, profiles: reports }, null, 2)}\n`,
  );

  console.log(`WFO-E2E-002B-LIVE report written to ${reportPath}`);
  console.log(
    JSON.stringify(
      reports.map((report) => {
        const r = report as {
          profileId: string;
          outcome: string;
          credentialResolved?: boolean;
          execution?: { callCount: number };
        };
        return {
          profileId: r.profileId,
          outcome: r.outcome,
          credentialResolved: r.credentialResolved,
          callCount: r.execution?.callCount,
        };
      }),
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error('live trial failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
