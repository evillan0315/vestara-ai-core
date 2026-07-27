import type { AIProvider } from '@vestara/shared';
import type { DecisionStorage } from './decision-storage';
import type { ImpactStorage } from './impact-storage';
import type { PlanStorage } from './plan-storage';
import type { Decision } from './types';
import type { WorkspaceSession } from './workspace-session';

let decCounter = 0;

export class DecisionService {
  private storage: DecisionStorage;
  private planStorage?: PlanStorage;
  private impactStorage?: ImpactStorage;
  private provider?: AIProvider;

  constructor(opts: {
    storage: DecisionStorage;
    planStorage?: PlanStorage;
    impactStorage?: ImpactStorage;
    provider?: AIProvider;
  }) {
    this.storage = opts.storage;
    this.planStorage = opts.planStorage;
    this.impactStorage = opts.impactStorage;
    this.provider = opts.provider;
  }

  async recommend(session: WorkspaceSession): Promise<Decision> {
    return this.recommendForTarget('workspace', undefined, session);
  }

  async recommendPlan(planId: string, session: WorkspaceSession): Promise<Decision> {
    return this.recommendForTarget('plan', planId, session);
  }

  async recommendNext(session: WorkspaceSession): Promise<Decision> {
    return this.recommendForTarget('next', undefined, session);
  }

  private async recommendForTarget(
    targetType: string,
    planId: string | undefined,
    session: WorkspaceSession,
  ): Promise<Decision> {
    const profile = session.profile;
    const health = profile.healthScore;
    const id = `D-${Date.now()}-${++decCounter}`;
    const now = new Date().toISOString();

    // Build recommendation from workspace signals
    const missingTests = profile.risks.some((r) => r.category === 'missing-tests');
    const largeFiles = profile.risks.some((r) => r.category === 'large-file');
    const todoDensity = profile.risks.some((r) => r.category === 'todo-hotspot');
    const lowHealth = health ? health.overall < 5 : false;

    let recommendation = '';
    let rationale = '';
    let confidence = 0.5;
    const alternatives: { label: string; description: string; risk: string }[] = [];

    if (targetType === 'plan' && planId && this.planStorage) {
      const plan = await this.planStorage.get(planId);
      if (!plan) throw new Error(`Plan "${planId}" not found.`);
      recommendation = 'Review plan and verify prerequisites before implementation';
      rationale = `Plan ${planId}: "${plan.goal}". ${missingTests ? 'Affected packages lack test coverage. ' : ''}${lowHealth ? `Repository health is ${health?.overall}. ` : ''}`;
      confidence = lowHealth ? 0.4 : 0.7;
      alternatives.push(
        {
          label: 'Proceed with implementation',
          description: 'Implement the plan as designed',
          risk: lowHealth ? 'high' : 'medium',
        },
        { label: 'Increase test coverage first', description: 'Address test gaps before implementing', risk: 'low' },
        { label: 'Split into smaller plans', description: 'Reduce scope and dependency radius', risk: 'low' },
      );
    } else if (targetType === 'next') {
      const pendingPlans = this.planStorage
        ? (await this.planStorage.list(session.fingerprint.id)).filter((p) => p.status === 'approved')
        : [];
      if (pendingPlans.length > 0) {
        recommendation = `Implement approved plan ${pendingPlans[0].id}`;
        rationale = `${pendingPlans.length} approved plan(s) waiting. ${pendingPlans[0].goal}`;
        confidence = 0.8;
      } else if (lowHealth) {
        recommendation = 'Improve repository health before planning new work';
        rationale = `Health score is ${health?.overall}. Focus on reducing technical debt.`;
        confidence = 0.7;
      } else {
        recommendation = 'Create a plan for the next engineering goal';
        rationale = 'Workspace is in good health with no pending plans.';
        confidence = 0.9;
      }
      alternatives.push(
        { label: 'Follow recommendation', description: recommendation, risk: 'low' },
        { label: 'Review health dashboard', description: 'Check health metrics before deciding', risk: 'low' },
      );
    } else {
      recommendation = lowHealth ? 'Improve repository health' : 'Workspace is healthy';
      rationale = lowHealth
        ? `Health score: ${health?.overall}. ${missingTests ? 'Missing tests. ' : ''}${largeFiles ? 'Large files detected. ' : ''}${todoDensity ? 'TODO hotspots present.' : ''}`
        : 'No significant issues detected.';
      confidence = lowHealth ? 0.3 : 0.9;
      alternatives.push(
        {
          label: 'Address health issues',
          description: 'Fix risks before new development',
          risk: lowHealth ? 'low' : 'low',
        },
        {
          label: 'Proceed with planning',
          description: 'Create plans for new features',
          risk: lowHealth ? 'high' : 'low',
        },
      );
    }

    // Load latest impact assessment if available
    let assessmentId: string | undefined;
    if (this.impactStorage) {
      const assessments = await this.impactStorage.listByWorkspace(session.fingerprint.id);
      if (assessments.length > 0) assessmentId = assessments[0].id;
    }

    // AI enrichment for narrative
    let narrative = '';
    if (this.provider) {
      try {
        const resp = await this.provider.complete({
          model: 'deepseek-v4-flash-free',
          messages: [
            {
              role: 'system',
              content: "You are Vestara's decision engine. Provide concise rationale for the recommendation.",
            },
            {
              role: 'user',
              content: `Recommendation: ${recommendation}\nRationale: ${rationale}\nHealth: ${health?.overall ?? 'N/A'}\nConfidence: ${confidence}`,
            },
          ],
          temperature: 0.4,
          maxTokens: 256,
        });
        narrative = resp.content || '';
      } catch {
        /* best effort */
      }
    }

    const decision: Decision = {
      id,
      workspaceId: session.fingerprint.id,
      planId,
      assessmentId,
      createdAt: now,
      recommendation: recommendation + (narrative ? `\n\n${narrative}` : ''),
      alternatives,
      rationale,
      confidence: Math.round(confidence * 100) / 100,
      accepted: false,
      modelVersion: 'v1',
    };

    await this.storage.save(decision);
    return decision;
  }

  async accept(id: string, by: string): Promise<Decision | null> {
    const d = await this.storage.get(id);
    if (!d) return null;
    d.accepted = true;
    d.acceptedBy = by;
    d.acceptedAt = new Date().toISOString();
    await this.storage.save(d);
    return d;
  }

  async list(workspaceId: string): Promise<Decision[]> {
    return this.storage.listByWorkspace(workspaceId);
  }

  render(d: Decision): string {
    const _statusIcon = d.accepted ? '✓' : '·';
    return [
      `Decision ${d.id}`,
      `Recommendation: ${d.recommendation}`,
      `Confidence: ${(d.confidence * 100).toFixed(0)}%`,
      `Status: ${d.accepted ? `Accepted by ${d.acceptedBy}` : 'Pending'}`,
      '',
      'Alternatives considered:',
      ...d.alternatives.map((a, i) => `  ${i + 1}. ${a.label} (risk: ${a.risk}) — ${a.description}`),
      '',
      `Rationale: ${d.rationale}`,
    ].join('\n');
  }
}
