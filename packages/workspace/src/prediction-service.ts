import type { AIProvider } from '@vestara/shared';
import type { ImpactStorage } from './impact-storage';
import type { PlanStorage } from './plan-storage';
import type {
  EffortEstimate,
  HealthPrediction,
  ImpactAssessment,
  Recommendation,
  RiskAssessment,
  ScopeAnalysis,
} from './types';
import type { WorkspaceSession } from './workspace-session';

let assessCounter = 0;

export class PredictionService {
  private storage: ImpactStorage;
  private planStorage?: PlanStorage;
  private provider?: AIProvider;

  constructor(opts: { storage: ImpactStorage; planStorage?: PlanStorage; provider?: AIProvider }) {
    this.storage = opts.storage;
    this.planStorage = opts.planStorage;
    this.provider = opts.provider;
  }

  async predict(goal: string, session: WorkspaceSession): Promise<ImpactAssessment> {
    const profile = session.profile;
    const health = profile.healthScore;
    const id = `IA-${Date.now()}-${++assessCounter}`;
    const modelVersion = 'v1';

    // Deterministic scope analysis
    const lowerGoal = goal.toLowerCase();
    const matchingPkgs = profile.packages.filter(
      (p) =>
        lowerGoal.includes(p.name) || lowerGoal.includes(p.path) || lowerGoal.includes(p.name.replace('@vestara/', '')),
    );
    const pkgNames = matchingPkgs.length > 0 ? matchingPkgs.map((p) => p.name) : [profile.name];
    const affectedFileCount = Math.max(
      5,
      pkgNames.length * 4 + profile.risks.filter((r) => r.category === 'large-file').length,
    );

    const scope: ScopeAnalysis = {
      packages: pkgNames,
      modules: matchingPkgs.map((p) => p.path),
      entryPoints: profile.entryPoints.filter((ep) => pkgNames.some((n) => ep.path.includes(n))).map((ep) => ep.path),
      files: affectedFileCount,
    };

    // Risk assessment
    const baseRisk = health ? (10 - health.overall) / 10 : 0.5;
    const riskLevel: 'low' | 'medium' | 'high' = baseRisk < 0.3 ? 'low' : baseRisk < 0.6 ? 'medium' : 'high';
    const risk: RiskAssessment = {
      level: riskLevel,
      increase: matchingPkgs.some((p) => p.dependencies.length > 10)
        ? ['High dependency count in affected packages']
        : [],
      reduction: [],
    };

    // Effort estimate
    const depRadius = Math.min(matchingPkgs.length + 2, profile.packages.length);
    const effortLevel: 'small' | 'medium' | 'large' = depRadius <= 3 ? 'small' : depRadius <= 8 ? 'medium' : 'large';
    const effort: EffortEstimate = {
      level: effortLevel,
      description: effortLevel === 'small' ? '1-2 days' : effortLevel === 'medium' ? '3-5 days' : '1-2 weeks',
      filesAffected: affectedFileCount,
      dependencyRadius: depRadius,
    };

    // Health prediction
    const delta = health ? Math.round(Math.max(-2, Math.min(2, (1 - baseRisk) * 2)) * 10) / 10 : 0.5;
    const healthPred: HealthPrediction = {
      current: health?.overall ?? 0,
      predicted: Math.round(Math.max(0, Math.min(10, (health?.overall ?? 0) + delta)) * 10) / 10,
      delta,
    };

    // Recommendations (deterministic)
    const recommendations: Recommendation[] = [];
    if (profile.risks.some((r) => r.category === 'missing-tests')) {
      recommendations.push({
        category: 'testing',
        message: 'Increase test coverage in affected packages',
        priority: 'high',
      });
    }
    if (profile.risks.some((r) => r.category === 'large-file')) {
      recommendations.push({
        category: 'quality',
        message: 'Refactor large files in scope before implementing',
        priority: 'medium',
      });
    }
    if (profile.risks.some((r) => r.category === 'todo-hotspot')) {
      recommendations.push({
        category: 'debt',
        message: 'Address TODO/FIXME hotspots before adding complexity',
        priority: 'medium',
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({ category: 'info', message: 'No significant concerns detected', priority: 'low' });
    }

    const assessment: ImpactAssessment = {
      id,
      workspaceId: session.fingerprint.id,
      target: goal,
      createdAt: new Date().toISOString(),
      confidence: Math.round((1 - baseRisk) * 100) / 100,
      scope,
      risk,
      effort,
      health: healthPred,
      recommendations,
      modelVersion,
    };

    // AI narrative (optional)
    if (this.provider) {
      try {
        const resp = await this.provider.complete({
          model: 'deepseek-v4-flash-free',
          messages: [
            { role: 'system', content: 'Summarize the impact assessment concisely.' },
            {
              role: 'user',
              content: `Goal: ${goal}\nConfidence: ${assessment.confidence}\nRisk: ${riskLevel}\nEffort: ${effort.description}\nHealth: ${healthPred.current} → ${healthPred.predicted}\nPackages: ${pkgNames.join(', ')}`,
            },
          ],
          temperature: 0.4,
          maxTokens: 512,
        });
        assessment.narrative = resp.content || undefined;
      } catch {
        /* best effort */
      }
    }

    await this.storage.save(assessment);
    return assessment;
  }

  async predictPlan(planId: string, session: WorkspaceSession): Promise<ImpactAssessment | null> {
    if (!this.planStorage) return null;
    const plan = await this.planStorage.get(planId);
    if (!plan) return null;
    return this.predict(plan.goal, session);
  }

  async list(workspaceId: string): Promise<ImpactAssessment[]> {
    return this.storage.listByWorkspace(workspaceId);
  }

  async compare(id1: string, id2: string): Promise<string> {
    const a1 = await this.storage.get(id1);
    const a2 = await this.storage.get(id2);
    if (!a1 || !a2) return 'One or both assessments not found.';
    return [
      `Comparing ${id1} vs ${id2}:`,
      `  Confidence: ${a1.confidence} → ${a2.confidence}`,
      `  Risk: ${a1.risk.level} → ${a2.risk.level}`,
      `  Effort: ${a1.effort.level} → ${a2.effort.level}`,
      `  Health: ${a1.health.current}→${a1.health.predicted} vs ${a2.health.current}→${a2.health.predicted}`,
      `  Files: ${a1.scope.files} vs ${a2.scope.files}`,
    ].join('\n');
  }

  render(a: ImpactAssessment): string {
    const riskIcon = a.risk.level === 'high' ? '⚠' : a.risk.level === 'medium' ? '∼' : '✓';
    return [
      `Impact Assessment ${a.id}`,
      `Target: ${a.target}`,
      `Confidence: ${(a.confidence * 100).toFixed(0)}%`,
      `Model: ${a.modelVersion}`,
      '',
      `Scope:`,
      `  Packages:     ${a.scope.packages.length}`,
      `  Files:        ${a.scope.files}`,
      `  Entry Points: ${a.scope.entryPoints.length}`,
      '',
      `Risk: ${riskIcon} ${a.risk.level}`,
      ...a.risk.increase.map((r) => `  ⚠ ${r}`),
      '',
      `Effort: ${a.effort.level} (${a.effort.description})`,
      `  Files affected: ${a.effort.filesAffected}`,
      `  Dependency radius: ${a.effort.dependencyRadius} packages`,
      '',
      `Health: ${a.health.current.toFixed(1)} → ${a.health.predicted.toFixed(1)} (${a.health.delta > 0 ? '+' : ''}${a.health.delta.toFixed(1)})`,
      '',
      'Recommendations:',
      ...a.recommendations.map((r) => `  [${r.priority}] ${r.message}`),
      a.narrative ? `\n${a.narrative}` : '',
    ].join('\n');
  }
}
