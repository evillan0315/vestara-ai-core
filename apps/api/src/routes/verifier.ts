/**
 * Verifier routes — evaluate evidence bundles against acceptance criteria
 * and produce structured verification verdicts (PCS-026 Verifier role).
 */

import type * as http from 'node:http';
import {
  type EvidenceKind,
  type VerifierCriterionSpec,
  VerifierService,
  type VerifierVerdict,
} from '@vestara/evidence';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

interface VerifierRequestBody {
  claim?: string;
  executionId?: string;
  criteria?: Array<{
    id: string;
    description: string;
    required?: boolean;
    expectEvidenceKinds?: string[];
    minEvidenceCount?: number;
    requireChecksPassed?: string[];
    minConfidenceScore?: number;
  }>;
}

interface OverrideRequestBody {
  decision?: 'PROCEED' | 'REJECT';
  reason?: string;
  decidedBy?: string;
}

const CRITERIA_KIND = new Set<EvidenceKind>([
  'command',
  'test',
  'build',
  'filesystem-change',
  'source-diff',
  'browser-navigation',
  'screenshot',
  'visual-comparison',
]);

function normalizeCriteria(raw: VerifierRequestBody['criteria']): VerifierCriterionSpec[] {
  return (raw ?? []).map((entry) => ({
    id: entry.id,
    description: entry.description,
    required: entry.required ?? true,
    expectEvidenceKinds: entry.expectEvidenceKinds?.filter((kind): kind is EvidenceKind =>
      CRITERIA_KIND.has(kind as EvidenceKind),
    ),
    minEvidenceCount: entry.minEvidenceCount,
    requireChecksPassed: entry.requireChecksPassed,
    minConfidenceScore: entry.minConfidenceScore,
  }));
}

const verifierService = new VerifierService();

/** Strips raw evidence payloads before serializing a verdict to the client. */
function sanitizeVerdict(verdict: VerifierVerdict) {
  return {
    id: verdict.id,
    executionId: verdict.executionId,
    claim: verdict.claim,
    status: verdict.status,
    criteria: verdict.criteria,
    gaps: verdict.gaps,
    contradictions: verdict.contradictions,
    confidence: verdict.confidence,
    reasoning: verdict.reasoning,
    evaluatedAt: verdict.evaluatedAt,
    previousVerdictId: verdict.previousVerdictId,
  };
}

export async function handleVerifierRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  // POST /api/verifier/evaluate — evaluate a bundle against acceptance criteria.
  if (method === 'POST' && p === '/api/verifier/evaluate') {
    const raw = await readBody(_req);
    const body = (JSON.parse(raw) as VerifierRequestBody) ?? {};
    const executionId = new URL(_req.url ?? '', 'http://x').searchParams.get('executionId') ?? 'unknown';
    const claim = typeof body?.claim === 'string' ? body.claim : 'Untitled claim';
    const criteria = normalizeCriteria(body.criteria);
    const bundle = ctx.evidenceBundles.read(executionId);
    if (!bundle) {
      json(res, 404, { error: { code: 'BUNDLE_NOT_FOUND', message: `No evidence bundle for ${executionId}.` } });
      return true;
    }
    const verdict = verifierService.evaluate(bundle, criteria, claim);
    ctx.verifierResults.record(verdict);
    json(res, 200, { verdict: sanitizeVerdict(verdict) });
    return true;
  }

  // GET /api/verifier/verdicts/:executionId — most recent verdict for an execution.
  const verdictMatch = p.match(/^\/api\/verifier\/verdicts\/([^/]+)$/);
  if (verdictMatch && method === 'GET') {
    const executionId = decodeURIComponent(verdictMatch[1]);
    const verdict = ctx.verifierResults.read(executionId);
    if (!verdict) {
      json(res, 404, { error: { code: 'VERDICT_NOT_FOUND', message: `No verdict for ${executionId}.` } });
      return true;
    }
    json(res, 200, { verdict: sanitizeVerdict(verdict) });
    return true;
  }

  // POST /api/verifier/verdicts/:executionId/override — Director override.
  if (verdictMatch && method === 'POST') {
    const executionId = decodeURIComponent(verdictMatch[1]);
    const prior = ctx.verifierResults.read(executionId);
    if (!prior) {
      json(res, 404, { error: { code: 'VERDICT_NOT_FOUND', message: `No verdict for ${executionId}.` } });
      return true;
    }
    const raw = await readBody(_req);
    const body = (JSON.parse(raw) as OverrideRequestBody) ?? {};
    const decision = body.decision === 'REJECT' ? 'REJECT' : 'PROCEED';
    const reason = typeof body.reason === 'string' ? body.reason : undefined;
    if (!reason) {
      json(res, 400, { error: { code: 'VERIFIER_INVALID_ARGUMENT', message: 'reason is required for override.' } });
      return true;
    }
    const decidedBy = typeof body.decidedBy === 'string' ? body.decidedBy : 'director';
    const withOverride = verifierService.applyOverride(prior, { decision, reason, decidedBy });
    json(res, 200, {
      verdict: sanitizeVerdict(withOverride.verdict),
      override: withOverride.override,
      effectiveDecision: withOverride.effectiveDecision,
    });
    return true;
  }

  // POST /api/verifier/reverify — re-evaluate after staleness or interruption.
  if (method === 'POST' && p === '/api/verifier/reverify') {
    const raw = await readBody(_req);
    const body = (JSON.parse(raw) as VerifierRequestBody & { executionId?: string }) ?? {};
    const executionId =
      new URL(_req.url ?? '', 'http://x').searchParams.get('executionId') ?? body.executionId ?? 'unknown';
    const claim = typeof body?.claim === 'string' ? body.claim : 'Untitled claim';
    const criteria = normalizeCriteria(body.criteria);
    const bundle = ctx.evidenceBundles.read(executionId);
    if (!bundle) {
      json(res, 404, { error: { code: 'BUNDLE_NOT_FOUND', message: `No evidence bundle for ${executionId}.` } });
      return true;
    }
    const prior = ctx.verifierResults.read(executionId);
    const verdict = prior
      ? verifierService.reverify(bundle, criteria, claim, prior)
      : verifierService.evaluate(bundle, criteria, claim);
    ctx.verifierResults.record(verdict);
    json(res, 200, { verdict: sanitizeVerdict(verdict), reverified: Boolean(prior) });
    return true;
  }

  return false;
}
