/**
 * Qualification routes — serve the WFO-E2E-002B-LIVE trial evidence.
 *
 * Reads the gitignored `stage/wfo-e2e-002b-live/report-*.json` artifacts so the
 * Workspace can inspect and human-review real Planner/Reviewer trials (plan
 * versions, review findings, schema-retry evidence, usage, execution-blocked
 * outcome) without reading terminal logs or raw JSON files.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export interface QualificationTrialRecord {
  readonly profileId: string;
  readonly outcome: string;
  readonly credentialResolved: boolean;
  readonly identity: {
    readonly providerId: string;
    readonly modelId: string;
    readonly repositorySha: string;
    readonly contextHash: string;
    readonly promptTemplateVersion: string;
  };
  readonly execution: {
    readonly callCount: number;
    readonly retryCount: number;
    readonly totalInputTokens: number;
    readonly totalOutputTokens: number;
    readonly totalDurationMs: number;
    readonly providerStatuses: readonly string[];
    readonly controls: { readonly status: string; readonly reasons: readonly string[] };
  };
  readonly planner: {
    readonly schemaValidFirstAttempt: boolean;
    readonly versions: readonly { readonly version: number; readonly planHash: string }[];
    readonly plan: unknown;
    readonly materialProgress: boolean;
  };
  readonly reviewer: { readonly review: unknown; readonly materialProgress: boolean };
  readonly workflowResult: {
    readonly conclusion: string;
    readonly stoppedBeforeExecution: boolean;
    readonly reasons: readonly string[];
    readonly evidenceRefs: readonly string[];
  };
  readonly invocations: readonly unknown[];
}

export interface QualificationTrialsResponse {
  readonly repositorySha: string;
  readonly contextHash: string;
  readonly generatedAt: string;
  readonly trials: readonly QualificationTrialRecord[];
}

/** On-disk report artifact shape (written by `scripts/wfo-e2e-002b-live.ts`). */
interface QualificationTrialFile {
  readonly generatedAt: string;
  readonly repositorySha: string;
  readonly contextHash: string;
  readonly profiles: readonly QualificationTrialRecord[];
}

function trialDirectory(ctx: WorkspaceContext): string {
  return path.resolve(ctx.repoPath, 'stage', 'wfo-e2e-002b-live');
}

function readTrialFiles(ctx: WorkspaceContext): Array<{ report: QualificationTrialFile; file: string }> {
  const directory = trialDirectory(ctx);
  if (!fs.existsSync(directory)) return [];
  const files = fs
    .readdirSync(directory)
    .filter((name) => /^report-.*\.json$/.test(name))
    .sort();
  const reports: Array<{ report: QualificationTrialFile; file: string }> = [];
  for (const file of files) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) as QualificationTrialFile;
      reports.push({ report, file });
    } catch {
      // skip malformed reports
    }
  }
  return reports;
}

/** Latest report per profile (report files are named with a timestamp suffix). */
function latestPerProfile(
  reports: Array<{ report: QualificationTrialFile; file: string }>,
): Map<string, QualificationTrialRecord> {
  const latest = new Map<string, QualificationTrialRecord>();
  for (const { report } of reports) {
    for (const trial of report.profiles ?? []) {
      latest.set(trial.profileId, trial);
    }
  }
  return latest;
}

export async function handleQualificationRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/qualification/trials') {
    const reports = readTrialFiles(ctx);
    const latest = latestPerProfile(reports);
    const newest = reports.at(-1);
    const trials = [...latest.values()].sort((a, b) => a.profileId.localeCompare(b.profileId));
    json(res, 200, {
      repositorySha: newest?.report.repositorySha ?? 'no-reports',
      contextHash: newest?.report.contextHash ?? '',
      generatedAt: newest?.report.generatedAt ?? '',
      trials,
    } satisfies QualificationTrialsResponse);
    return true;
  }

  const trialMatch = p.match(/^\/api\/qualification\/trials\/([^/]+)$/);
  if (method === 'GET' && trialMatch) {
    const profileId = decodeURIComponent(trialMatch[1]);
    const trial = latestPerProfile(readTrialFiles(ctx)).get(profileId);
    if (!trial) {
      json(res, 404, { error: `no qualification trial for ${profileId}` });
      return true;
    }
    json(res, 200, { trial });
    return true;
  }

  // POST /api/qualification/run — initiate a live governed planning trial
  // (Planner + Reviewer, advisory, execution-blocked). Runs asynchronously; the
  // Workspace polls /api/qualification/trials until the new report appears.
  if (method === 'POST' && p === '/api/qualification/run') {
    const raw = await readBody(_req);
    let body: { profileId?: string } = {};
    try {
      body = JSON.parse(raw || '{}') as { profileId?: string };
    } catch {
      // empty body is allowed
    }
    const profileId = body.profileId ?? 'deepseekV4FlashOpenCodeGo';
    if (!QUALIFICATION_PROFILES.includes(profileId)) {
      json(res, 400, { error: `unknown qualification profile: ${profileId}` });
      return true;
    }
    try {
      if (ctx.qualificationLiveRunner) {
        await ctx.qualificationLiveRunner(profileId);
      } else {
        startLiveTrial(ctx, profileId);
      }
      json(res, 202, { started: true, profileId });
    } catch (error) {
      json(res, 503, {
        error: `unable to start live trial: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
    return true;
  }

  return false;
}

export const QUALIFICATION_PROFILES = [
  'deepseekV4FlashOpenCodeGo',
  'mimoV25OpenCodeGo',
  'deepseekV4FlashOpenCodeFree',
  'mimoV25OpenCodeFree',
];

/** Spawn the live-trial script detached (it writes a report under stage/). */
function startLiveTrial(ctx: WorkspaceContext, profileId: string): void {
  const repoRoot = path.resolve(ctx.repoPath);
  const tsx = path.join(repoRoot, 'node_modules', '.bin', 'tsx');
  const script = path.join(repoRoot, 'scripts', 'wfo-e2e-002b-live.ts');
  if (!fs.existsSync(tsx)) throw new Error('tsx runner not found');
  if (!fs.existsSync(script)) throw new Error('live-trial script not found');
  const child = spawn(tsx, ['--env-file=.env', script, profileId], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
