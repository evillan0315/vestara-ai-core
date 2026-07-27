/**
 * PlanningService — Creates, stores, and manages Plan artifacts.
 *
 * Two-tier design:
 *   Tier 1 — Deterministic: basic task framework from workspace context
 *   Tier 2 — AI-synthesized: structured plan with specific tasks and files
 *
 * A Plan is a first-class durable artifact with its own lifecycle.
 * It is stored in SQLite and referenced by subsequent capabilities
 * (implement, verify).
 *
 * Architecture Traceability:
 *   PCS: PCS-003 — Planning
 *   Product Principle: Commands Are Ephemeral. Artifacts Are Durable.
 *   Product Principle: Evolve Intelligence Before Autonomy
 */

import type { AIProvider } from '@vestara/shared';
import type { DecisionService } from './decision-service';
import type { PlanStorage } from './plan-storage';
import type { PredictionService } from './prediction-service';
import type { Plan, PlanStatus, Task } from './types';
import type { WorkspaceSession } from './workspace-session';

export interface CreatePlanResult {
  plan: Plan;
  source: 'deterministic' | 'ai';
  duration: number;
}

export class PlanningService {
  private storage: PlanStorage;
  private provider?: AIProvider;
  private predictionService?: PredictionService;
  private decisionService?: DecisionService;

  constructor(opts: {
    storage: PlanStorage;
    provider?: AIProvider;
    predictionService?: PredictionService;
    decisionService?: DecisionService;
  }) {
    this.storage = opts.storage;
    this.provider = opts.provider;
    this.predictionService = opts.predictionService;
    this.decisionService = opts.decisionService;
  }

  /**
   * Create a plan from a goal within the workspace context.
   */
  async createPlan(goal: string, session: WorkspaceSession): Promise<CreatePlanResult> {
    const startTime = performance.now();

    // Create plan skeleton
    const plan = await this.storage.create(goal, session.fingerprint.id);

    // Build workspace context
    const context = this.buildContext(goal, session);

    // Populate with analysis
    plan.scope = context.suggestedScope;
    plan.assumptions = context.assumptions;
    plan.constraints = context.constraints;
    plan.risks = context.risks;

    // Retrieve relevant explanations from memory
    const explanations = await this.loadExplanations(session);
    plan.parentExplanations = explanations;

    // Tier 2: Try AI-synthesized plan
    if (this.provider) {
      const aiPlan = await this.generateWithAI(goal, context, explanations, session);
      if (aiPlan) {
        plan.tasks = aiPlan.tasks;
        plan.scope = aiPlan.scope.length > 0 ? aiPlan.scope : plan.scope;
        plan.assumptions = aiPlan.assumptions.length > 0 ? aiPlan.assumptions : plan.assumptions;
        plan.risks = aiPlan.risks.length > 0 ? aiPlan.risks : plan.risks;
        plan.title = aiPlan.title || plan.title;
        // Auto-create prediction
        await this.autoPredict(plan, session);

        await this.storage.save(plan);

        return {
          plan,
          source: 'ai',
          duration: Math.round(performance.now() - startTime),
        };
      }
    }

    // Tier 1: Deterministic fallback
    plan.tasks = this.generateDeterministicTasks(goal, context);
    // Auto-create prediction
    await this.autoPredict(plan, session);
    await this.storage.save(plan);

    return {
      plan,
      source: 'deterministic',
      duration: Math.round(performance.now() - startTime),
    };
  }

  /**
   * Delete all plans for a workspace.
   */
  async deleteAllPlans(workspaceId: string): Promise<number> {
    return this.storage.deleteAll(workspaceId);
  }

  /**
   * Get a stored plan by ID.
   */
  async getPlan(id: string): Promise<Plan | null> {
    return this.storage.get(id);
  }

  /**
   * List all plans in the workspace.
   */
  async listPlans(workspaceId: string): Promise<Plan[]> {
    return this.storage.list(workspaceId);
  }

  /**
   * Transition a plan's status.
   */
  async updatePlanStatus(id: string, status: PlanStatus, session?: WorkspaceSession): Promise<Plan | null> {
    await this.storage.updateStatus(id, status);

    // Auto-create decision when plan is approved
    if (status === 'approved' && this.decisionService && session) {
      try {
        const decision = await this.decisionService.recommendPlan(id, session);
        const plan = await this.storage.get(id);
        if (plan && decision) {
          plan.decisionId = decision.id;
          await this.storage.save(plan);
        }
      } catch {
        /* best effort */
      }
    }

    return this.storage.get(id);
  }

  async updatePlanExecution(id: string, execution: any): Promise<Plan | null> {
    const plan = await this.storage.get(id);
    if (!plan) return null;
    (plan as any).execution = execution;
    await this.storage.save(plan);
    return this.storage.get(id);
  }

  /**
   * Build workspace context from the session and goal.
   */
  private buildContext(
    goal: string,
    session: WorkspaceSession,
  ): {
    suggestedScope: string[];
    assumptions: string[];
    constraints: string[];
    risks: Array<{ description: string; severity: 'low' | 'medium' | 'high' }>;
    relevantPackages: string[];
  } {
    const profile = session.profile;
    const lowerGoal = goal.toLowerCase();

    // Find relevant packages by matching goal against package names and specs
    const relevantPackages = profile.packages
      .filter((p) => {
        const matchTarget = `${p.name} ${p.path}`.toLowerCase();
        const pkgBase = p.path.split('/').pop() ?? '';
        return (
          matchTarget.includes(lowerGoal) ||
          lowerGoal.includes(p.path) ||
          lowerGoal.includes(pkgBase) ||
          lowerGoal.includes(p.name.replace('@vestara/', ''))
        );
      })
      .map((p) => p.name);

    // Suggest scope from relevant packages
    const suggestedScope =
      relevantPackages.length > 0
        ? relevantPackages.map((name) => {
            const pkg = profile.packages.find((p) => p.name === name);
            return pkg ? pkg.path : name;
          })
        : [`${profile.name}/src`];

    return {
      suggestedScope,
      assumptions: [
        `Changes should follow the existing code style and conventions of this ${profile.language} project.`,
        `Existing tests should continue to pass after changes.`,
      ],
      constraints: [
        `Architecture is frozen — no changes to Blueprint, Specifications, Foundation, or Runtime contracts.`,
        ...(profile.isMonorepo ? ['Workspace package boundaries must be preserved.'] : []),
      ],
      risks: profile.risks.slice(0, 3).map((r) => ({
        description: r.detail,
        severity: r.severity as 'low' | 'medium' | 'high',
      })),
      relevantPackages,
    };
  }

  /**
   * Load relevant explanation IDs from memory.
   */
  private async loadExplanations(session: WorkspaceSession): Promise<string[]> {
    try {
      const memories = await session.memory.search('workspace', 'explain', 5);
      return memories.memories.map((m) => m.id);
    } catch {
      return [];
    }
  }

  /**
   * Tier 2: Use the AI provider to generate a structured plan.
   */
  private async generateWithAI(
    goal: string,
    context: ReturnType<typeof this.buildContext>,
    _explanations: string[],
    session: WorkspaceSession,
  ): Promise<{
    title: string;
    tasks: Task[];
    scope: string[];
    assumptions: string[];
    risks: Array<{ description: string; severity: 'low' | 'medium' | 'high' }>;
  } | null> {
    const profile = session.profile;
    const entryPoints = profile.entryPoints
      .slice(0, 8)
      .map((ep) => ep.path)
      .join('\n');
    const packages = profile.packages.map((p) => `${p.name} (${p.path})`).join('\n');

    const prompt = `You are Vestara's Planning Engine. Given a developer's goal and the workspace context below, produce a structured plan.

Goal: "${goal}"

Workspace: ${profile.name}
Language: ${profile.language}
Monorepo: ${profile.isMonorepo ? 'Yes' : 'No'}
Packages:
${packages}

Entry Points:
${entryPoints}

Relevant Packages:
${context.relevantPackages.join(', ') || '(determine from context)'}

Return ONLY valid JSON with this structure:
{
  "title": "Short plan title",
  "scope": ["affected directories or packages"],
  "assumptions": ["list of assumptions"],
  "risks": [{"description": "...", "severity": "low|medium|high"}],
  "tasks": [
    {
      "summary": "Task summary",
      "description": "Detailed description",
      "files": ["relative/file/path"],
      "dependencies": [],
      "effort": "small|medium|large"
    }
  ]
}

Tasks should be concrete, ordered, and reference specific files where possible.`;

    try {
      const response = await this.provider!.complete({
        model: 'deepseek-v4-flash-free',
        messages: [
          {
            role: 'system',
            content: "You are Vestara's Planning Engine. Generate structured, actionable plans as JSON.",
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        maxTokens: 2048,
      });

      if (!response.content) return null;

      const parsed = JSON.parse(response.content);
      if (!parsed.tasks || !Array.isArray(parsed.tasks)) return null;

      const tasks: Task[] = parsed.tasks.map((t: any, i: number) => ({
        id: `T-${i + 1}`,
        summary: t.summary || `Step ${i + 1}`,
        description: t.description || '',
        files: t.files || [],
        dependencies: t.dependencies || [],
        status: 'pending' as const,
        effort: t.effort === 'small' || t.effort === 'medium' || t.effort === 'large' ? t.effort : 'medium',
      }));

      return {
        title: parsed.title || goal.slice(0, 60),
        tasks,
        scope: parsed.scope || [],
        assumptions: parsed.assumptions || [],
        risks: parsed.risks || [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Tier 1: Generate a basic deterministic task framework.
   */
  private generateDeterministicTasks(goal: string, context: ReturnType<typeof this.buildContext>): Task[] {
    const tasks: Task[] = [];
    const scopePaths = context.suggestedScope.slice(0, 3);

    tasks.push({
      id: 'T-1',
      summary: 'Analyze current state',
      description: `Review the current implementation related to: "${goal}". Understand the existing patterns and interfaces in ${scopePaths.join(', ') || 'the relevant areas'}.`,
      files: scopePaths.length > 0 ? [scopePaths[0]] : [],
      dependencies: [],
      status: 'pending',
      effort: 'small',
    });

    tasks.push({
      id: 'T-2',
      summary: 'Implement changes',
      description: `Make the necessary changes to address: "${goal}". Follow existing conventions.`,
      files: scopePaths,
      dependencies: ['T-1'],
      status: 'pending',
      effort: context.relevantPackages.length > 2 ? 'large' : 'medium',
    });

    tasks.push({
      id: 'T-3',
      summary: 'Verify changes',
      description: 'Run existing tests, verify the changes compile and work correctly.',
      files: [],
      dependencies: ['T-2'],
      status: 'pending',
      effort: 'small',
    });

    return tasks;
  }

  /**
   * Render a plan for terminal display.
   */
  renderPlan(plan: Plan): string {
    const lines: string[] = [];
    lines.push(`Plan ${plan.id}: ${plan.title}`);
    lines.push(`Status: ${plan.status}`);
    lines.push(`Created: ${plan.createdAt}`);
    lines.push('');

    lines.push(`Goal:`);
    lines.push(`  ${plan.goal}`);
    lines.push('');

    if (plan.scope.length > 0) {
      lines.push('Scope:');
      for (const s of plan.scope) {
        lines.push(`  • ${s}`);
      }
      lines.push('');
    }

    if (plan.assumptions.length > 0) {
      lines.push('Assumptions:');
      for (const a of plan.assumptions) {
        lines.push(`  • ${a}`);
      }
      lines.push('');
    }

    if (plan.risks.length > 0) {
      lines.push('Risks:');
      for (const r of plan.risks) {
        const icon = r.severity === 'high' ? '⚠' : '·';
        lines.push(`  ${icon} [${r.severity}] ${r.description}`);
      }
      lines.push('');
    }

    if (plan.tasks.length > 0) {
      lines.push('Tasks:');
      for (const task of plan.tasks) {
        const statusIcon =
          task.status === 'completed'
            ? '✓'
            : task.status === 'in-progress'
              ? '→'
              : task.status === 'blocked'
                ? '!'
                : '·';
        lines.push(`  ${statusIcon} ${task.id}: ${task.summary} (${task.effort})`);
        if (task.files.length > 0) {
          lines.push(`     Files: ${task.files.join(', ')}`);
        }
        if (task.dependencies.length > 0) {
          lines.push(`     Deps: ${task.dependencies.join(', ')}`);
        }
      }
      lines.push('');
    }

    if (plan.predictionId) {
      lines.push(`  Prediction: ${plan.predictionId}`);
    }
    if (plan.decisionId) {
      lines.push(`  Decision:   ${plan.decisionId}`);
    }

    return lines.join('\n');
  }

  /**
   * Auto-create a prediction for a plan.
   */
  private async autoPredict(plan: Plan, session: WorkspaceSession): Promise<void> {
    if (!this.predictionService) return;
    try {
      const assessment = await this.predictionService.predict(plan.goal, session);
      plan.predictionId = assessment.id;
    } catch {
      /* best effort */
    }
  }

  /**
   * Render a compact plan list for terminal display.
   */
  renderPlanList(plans: Plan[]): string {
    if (plans.length === 0) return 'No plans in workspace.';

    const lines: string[] = [];
    lines.push('Plans:');
    lines.push('');
    for (const plan of plans) {
      const taskCount = plan.tasks.length;
      const completedCount = plan.tasks.filter((t) => t.status === 'completed').length;
      lines.push(`  ${plan.id.padEnd(6)} ${plan.status.padEnd(12)} ${plan.title}`);
      lines.push(`  ${''.padEnd(6)} Tasks: ${completedCount}/${taskCount}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}
