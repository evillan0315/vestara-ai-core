/**
 * WFO-E2E-002B — governed Planner + Reviewer trial runner.
 *
 * Advisory and read-only: invokes a real model for Planner and Reviewer roles,
 * validates structured output (one constrained retry), records invocation
 * evidence, and STOPS before execution — it never creates implementation tasks
 * and never touches the repository. Reviewer independence: the Reviewer sees
 * the objective, context, and the immutable plan artifact only — never the
 * Planner's hidden reasoning.
 */

import type { TrialInvocationResult, TrialModelProvider } from './adapter';
import { evaluateRunControls, type RunControlResult, type RunControlState } from './controls';
import { type AgentInvocationEvidence, hashText, recordInvocation } from './invocation';
import type { RealAgentE2EProfile, RealAgentRole } from './profile';
import type { AgentGeneratedPlan, PlanReviewResult } from './schemas';
import { hasBlockingFindings, validateAgentGeneratedPlan, validatePlanReviewResult } from './schemas';

export interface PlanTrialContext {
  readonly objective: string;
  readonly repositorySummary: string;
  readonly relevantAdrs: readonly string[];
  readonly packageBoundaries: readonly string[];
  readonly verificationRequirements: readonly string[];
  readonly permittedScope: readonly string[];
}

export interface PlanArtifact {
  readonly planHash: string;
  readonly plan: AgentGeneratedPlan;
  readonly version: number;
  readonly createdAt: string;
  readonly immutable: true;
}

export interface TrialInvocationRecord {
  readonly invocation: AgentInvocationEvidence;
  readonly role: RealAgentRole;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly producedArtifact?: PlanArtifact;
}

export type TrialConclusion =
  | 'approved'
  | 'changes-requested'
  | 'rejected'
  | 'indeterminate'
  | 'awaiting-human-approval';

export interface PlanTrialResult {
  readonly workflowId: string;
  readonly conclusion: TrialConclusion;
  readonly planArtifact?: PlanArtifact;
  readonly planVersions: readonly PlanArtifact[];
  readonly review?: PlanReviewResult;
  readonly invocations: readonly TrialInvocationRecord[];
  readonly evidenceRefs: readonly string[];
  readonly controls: RunControlResult;
  readonly stoppedBeforeExecution: true;
  readonly reasons: readonly string[];
}

export interface PlanTrialRunOptions {
  readonly workflowId: string;
  readonly profile: RealAgentE2EProfile;
  readonly provider: TrialModelProvider;
  readonly context: PlanTrialContext;
  readonly promptTemplateVersion?: string;
  readonly controlState?: Partial<RunControlState>;
}

export interface PlanTrialRunnerOptions {
  readonly maxValidationRetries?: number;
  readonly maxPlanRevisions?: number;
  readonly now?: () => string;
}

/** Every JSON-candidate object in the response (whole text, fenced blocks, brace-balanced spans). */
function parseJsonCandidates<T>(text: string): T[] {
  const out: T[] = [];
  const push = (candidate: string): void => {
    if (!candidate) return;
    try {
      out.push(JSON.parse(candidate) as T);
    } catch {
      // not valid JSON on its own — skip
    }
  };
  push(text.trim());
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    push(match[1]?.trim() ?? '');
  }
  for (const span of extractJsonObjects(text)) push(span);
  return out;
}

function extractJsonObjects(text: string): string[] {
  const spans: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('{', cursor);
    if (start < 0) break;
    let depth = 0;
    let inString = false;
    let end = -1;
    for (let i = start; i < text.length; i += 1) {
      const char = text[i]!;
      if (char === '"' && text[i - 1] !== '\\') inString = !inString;
      if (inString) continue;
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) break;
    spans.push(text.slice(start, end + 1));
    cursor = end + 1;
  }
  return spans;
}

export class PlanTrialRunner {
  private readonly maxValidationRetries: number;
  private readonly maxPlanRevisions: number;
  private readonly now: () => string;

  constructor(options: PlanTrialRunnerOptions = {}) {
    this.maxValidationRetries = options.maxValidationRetries ?? 1;
    this.maxPlanRevisions = options.maxPlanRevisions ?? 2;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(input: PlanTrialRunOptions): Promise<PlanTrialResult> {
    const workflowId = input.workflowId;
    const version = input.promptTemplateVersion ?? 'wfo-e2e-002b-v1';
    const invocations: TrialInvocationRecord[] = [];
    const planVersions: PlanArtifact[] = [];
    const control = {
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      elapsedMs: 0,
      planningTurns: 0,
      executionTurns: 0,
      noProgressTurns: 0,
      ...input.controlState,
    };

    const plannerPromptFor = (revisionFindings?: readonly PlanReviewResult['findings']): string => {
      const base = [
        `Role: planner`,
        `Objective: ${input.context.objective}`,
        `Repository summary: ${input.context.repositorySummary}`,
        `ADRs: ${input.context.relevantAdrs.join(', ')}`,
        `Package/path boundaries: ${input.context.packageBoundaries.join(', ')}`,
        `Verification requirements: ${input.context.verificationRequirements.join(', ')}`,
        `Permitted scope: ${input.context.permittedScope.join(', ')}`,
        'Return ONLY a valid JSON object — no prose, no markdown fences. Schema: { summary, assumptions, steps[], affectedPaths, outOfScope, requiredApprovals, risks, completionCriteria }.',
      ].join('\n');
      if (revisionFindings && revisionFindings.length > 0) {
        return `${base}\nRevision required. Structured review findings only:\n${JSON.stringify(revisionFindings)}`;
      }
      return base;
    };

    const reviewPromptFor = (plan: PlanArtifact): string => {
      // Reviewer sees objective + context + the immutable plan artifact only.
      return [
        `Role: reviewer`,
        `Objective: ${input.context.objective}`,
        `Repository summary: ${input.context.repositorySummary}`,
        `Verification requirements: ${input.context.verificationRequirements.join(', ')}`,
        `Plan artifact (immutable, version ${plan.version}):\n${JSON.stringify(plan.plan)}`,
        'Return ONLY a valid JSON object — no prose, no markdown fences. Schema: { conclusion, findings[{id,severity,category,message,evidenceRefs,affectedPlanStepIds}], evidenceRefs }.',
      ].join('\n');
    };

    let finalReview: PlanReviewResult | undefined;
    let latestPlan: PlanArtifact | undefined;

    for (let revision = 0; revision <= this.maxPlanRevisions; revision += 1) {
      const plannerResult = await this.invokeWithRetry(input.provider, {
        role: 'planner' as const,
        workflowId,
        sessionId: `session-planner`,
        prompt: plannerPromptFor(
          finalReview && finalReview.conclusion === 'changes-requested' ? finalReview.findings : undefined,
        ),
        promptTemplateVersion: version,
        profile: input.profile,
        control,
        now: this.now,
      });
      invocations.push(plannerResult.record);

      if (plannerResult.result.providerStatus === 'unavailable') {
        return this.halted(
          input,
          workflowId,
          invocations,
          planVersions,
          {
            status: 'pause',
            reasons: ['provider or credential unavailable'],
          },
          ['provider or credential unavailable'],
        );
      }
      if (plannerResult.result.providerStatus === 'failed') {
        return this.halted(
          input,
          workflowId,
          invocations,
          planVersions,
          { status: 'pause', reasons: [plannerResult.result.error ?? 'provider failed'] },
          ['provider failed'],
        );
      }

      const plan = plannerResult.plan;
      if (!plan) {
        return this.halted(
          input,
          workflowId,
          invocations,
          planVersions,
          { status: 'pause', reasons: ['repeated invalid plan output'] },
          ['repeated invalid plan output — no Reviewer call against an invalid plan'],
        );
      }
      latestPlan = this.immutablePlan(plan, revision + 1, this.now());
      planVersions.push(latestPlan);

      const controls = evaluateRunControls(control, input.profile);
      if (controls.status !== 'continue') {
        return this.halted(input, workflowId, invocations, planVersions, controls, [
          ...controls.reasons,
          'no partial plan is treated as approved',
        ]);
      }

      const reviewResult = await this.invokeWithRetry(input.provider, {
        role: 'reviewer' as const,
        workflowId,
        sessionId: `session-reviewer`,
        prompt: reviewPromptFor(latestPlan),
        promptTemplateVersion: version,
        profile: input.profile,
        control,
        now: this.now,
      });
      invocations.push(reviewResult.record);
      if (reviewResult.result.providerStatus === 'unavailable') {
        return this.halted(
          input,
          workflowId,
          invocations,
          planVersions,
          { status: 'pause', reasons: ['provider or credential unavailable'] },
          ['provider or credential unavailable'],
        );
      }
      if (!reviewResult.review) {
        return this.halted(
          input,
          workflowId,
          invocations,
          planVersions,
          { status: 'pause', reasons: ['repeated invalid review output'] },
          ['repeated invalid review output — no approval'],
        );
      }
      finalReview = reviewResult.review;
      // Changes-requested continues the revision loop (Planner receives only
      // structured findings); a blocking finding still prevents approval.
      if (finalReview.conclusion !== 'changes-requested') break;
    }

    const conclusion = this.conclude(finalReview, input.profile);
    const controls = evaluateRunControls(control, input.profile);
    return {
      workflowId,
      conclusion,
      planArtifact: latestPlan,
      planVersions,
      review: finalReview,
      invocations,
      evidenceRefs: [...(finalReview?.evidenceRefs ?? [])],
      controls,
      stoppedBeforeExecution: true,
      reasons: this.reasonsFor(conclusion),
    };
  }

  private conclude(review: PlanReviewResult | undefined, profile: RealAgentE2EProfile): TrialConclusion {
    if (!review) return 'indeterminate';
    if (hasBlockingFindings(review)) return 'changes-requested';
    switch (review.conclusion) {
      case 'approved':
        return profile.requireHumanPlanApproval ? 'awaiting-human-approval' : 'approved';
      case 'changes-requested':
        return 'changes-requested';
      case 'rejected':
        return 'rejected';
      case 'indeterminate':
        return 'indeterminate';
    }
  }

  private reasonsFor(conclusion: TrialConclusion): string[] {
    switch (conclusion) {
      case 'awaiting-human-approval':
        return ['review approved; awaiting human plan approval before any execution'];
      case 'approved':
        return ['plan approved'];
      case 'changes-requested':
        return ['review requested changes; execution remains disabled'];
      case 'rejected':
        return ['plan rejected by reviewer'];
      case 'indeterminate':
        return ['review is indeterminate — it cannot become approval'];
    }
  }

  private async invokeWithRetry(
    provider: TrialModelProvider,
    input: {
      role: RealAgentRole;
      workflowId: string;
      sessionId: string;
      prompt: string;
      promptTemplateVersion: string;
      profile: RealAgentE2EProfile;
      control: RunControlState;
      now: () => string;
    },
  ): Promise<{
    result: TrialInvocationResult;
    plan?: AgentGeneratedPlan;
    review?: PlanReviewResult;
    record: TrialInvocationRecord;
  }> {
    const startedAt = input.now();
    const started = Date.now();

    const request = {
      role: input.role,
      sessionId: input.sessionId,
      prompt: input.prompt,
      promptTemplateVersion: input.promptTemplateVersion,
      providerId: input.profile.providerId,
      modelId: input.profile.modelId,
    };
    const first = await provider.invoke(request);
    input.control.modelCalls += 1;

    if (first.providerStatus !== 'completed') {
      const record = this.buildRecord(
        input,
        first.text,
        startedAt,
        started,
        'not-applicable',
        [],
        first.providerStatus,
        false,
        0,
      );
      return { result: first, record };
    }

    let response = first.text;
    let retries = 0;
    let evaluated = this.evaluateRoleResponse(input.role, response);

    while (evaluated.schemaResult === 'invalid' && retries < this.maxValidationRetries) {
      retries += 1;
      const retry = await provider.invoke({
        ...request,
        prompt: `${input.prompt}\nValidation failed (schema defects only): ${JSON.stringify(evaluated.errors)}. Return a corrected JSON object.`,
      });
      input.control.modelCalls += 1;
      response = retry.text;
      evaluated = this.evaluateRoleResponse(input.role, response);
    }

    const materialProgress =
      input.role === 'planner'
        ? evaluated.schemaResult === 'valid'
        : evaluated.schemaResult === 'valid' &&
          (evaluated.review === undefined ||
            evaluated.review.findings.length === 0 ||
            evaluated.review.findings.some((finding) => finding.evidenceRefs.length > 0));

    const record = this.buildRecord(
      input,
      response,
      startedAt,
      started,
      evaluated.schemaResult,
      evaluated.errors,
      'completed',
      materialProgress,
      retries,
    );
    return { result: { ...first, text: response }, plan: evaluated.plan, review: evaluated.review, record };
  }

  private evaluateRoleResponse(
    role: RealAgentRole,
    text: string,
  ): { schemaResult: 'valid' | 'invalid'; errors: string[]; plan?: AgentGeneratedPlan; review?: PlanReviewResult } {
    if (role === 'planner') {
      const candidates = parseJsonCandidates<AgentGeneratedPlan>(text);
      for (const candidate of candidates) {
        const validation = validateAgentGeneratedPlan(candidate);
        if (validation.valid) return { schemaResult: 'valid', errors: [], plan: candidate };
      }
      const errors = new Set<string>();
      for (const candidate of candidates) {
        for (const error of validateAgentGeneratedPlan(candidate).errors) errors.add(error);
      }
      return {
        schemaResult: 'invalid',
        errors: errors.size > 0 ? [...errors] : ['no JSON object found in the response'],
      };
    }
    const candidates = parseJsonCandidates<PlanReviewResult>(text);
    for (const candidate of candidates) {
      const validation = validatePlanReviewResult(candidate);
      if (validation.valid) return { schemaResult: 'valid', errors: [], review: candidate };
    }
    const errors = new Set<string>();
    for (const candidate of candidates) {
      for (const error of validatePlanReviewResult(candidate).errors) errors.add(error);
    }
    return {
      schemaResult: 'invalid',
      errors: errors.size > 0 ? [...errors] : ['no JSON object found in the response'],
    };
  }

  private buildRecord(
    input: {
      role: RealAgentRole;
      workflowId: string;
      prompt: string;
      promptTemplateVersion: string;
      profile: RealAgentE2EProfile;
      now: () => string;
    },
    response: string,
    startedAt: string,
    started: number,
    schemaValidation: 'valid' | 'invalid' | 'not-applicable',
    errors: readonly string[],
    providerStatus: 'completed' | 'failed' | 'unavailable',
    materialProgress: boolean,
    retries: number,
  ): TrialInvocationRecord {
    return {
      invocation: recordInvocation({
        invocationId: hashText(`${input.workflowId}:${input.role}:${startedAt}`).slice(0, 16),
        workflowId: input.workflowId,
        role: input.role,
        providerId: input.profile.providerId,
        modelId: input.profile.modelId,
        promptTemplateVersion: input.promptTemplateVersion,
        context: input.prompt,
        response,
        inputTokens: Math.ceil(input.prompt.length / 4),
        outputTokens: Math.ceil(response.length / 4),
        estimatedCostUsd: null,
        durationMs: Date.now() - started,
        startedAt,
        completedAt: input.now(),
        schemaValidation,
        retryCount: retries,
        providerStatus,
        materialProgress,
      }),
      role: input.role,
      valid: schemaValidation === 'valid',
      errors,
    };
  }

  private immutablePlan(plan: AgentGeneratedPlan, version: number, createdAt: string): PlanArtifact {
    return { planHash: hashText(JSON.stringify(plan)), plan, version, createdAt, immutable: true };
  }

  private halted(
    _input: PlanTrialRunOptions,
    workflowId: string,
    invocations: readonly TrialInvocationRecord[],
    planVersions: readonly PlanArtifact[],
    controls: RunControlResult,
    reasons: readonly string[],
  ): PlanTrialResult {
    return {
      workflowId,
      conclusion: 'indeterminate',
      planArtifact: planVersions[planVersions.length - 1],
      planVersions,
      invocations,
      evidenceRefs: [],
      controls,
      stoppedBeforeExecution: true,
      reasons: [...reasons],
    };
  }
}
