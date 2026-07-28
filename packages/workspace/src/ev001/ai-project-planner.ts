import type { AIProvider } from '@vestara/shared';
import { ProductEventTranslator } from '../runtime/product-events';
import type { ProjectPlanner, ProjectPlan } from './project-planner';
import type { PlanningContext } from './planning-context';

export class AiProjectPlanner implements ProjectPlanner {
  private readonly provider: AIProvider;
  private readonly translator?: ProductEventTranslator;

  constructor(provider: AIProvider, opts?: { translator?: ProductEventTranslator }) {
    this.provider = provider;
    this.translator = opts?.translator;
  }

  async createPlan(context: PlanningContext): Promise<ProjectPlan> {
    const isResume = context.architectureDecisions.length > 0 || context.outstandingWork.length > 0;

    const systemPrompt = `You are a project planning assistant. Given a planning context, return a JSON object with "projectName" and "steps".

Each step must have: "id" (kebab-case), "name" (short), "description" (one sentence).

Return ONLY valid JSON.`;

    const contextBlock = [
      `Current request: ${context.request}`,
      `Workspace: ${context.workspaceName}`,
      context.architectureDecisions.length > 0 ? `Architecture decisions:\n${context.architectureDecisions.map((d) => `- ${d}`).join('\n')}` : '',
      context.repositorySummary ? `Repository: ${context.repositorySummary}` : '',
      context.outstandingWork.length > 0 ? `Outstanding work:\n${context.outstandingWork.map((w) => `- ${w}`).join('\n')}` : '',
      context.conversationSummary ? `Recent context: ${context.conversationSummary}` : '',
    ].filter(Boolean).join('\n\n');

    const userPrompt = isResume
      ? `Continue working on ${context.workspaceName}. Generate 3-7 steps for the next milestone.\n\n${contextBlock}`
      : `Plan a new project called "${context.workspaceName || context.request}". Include 3-7 steps covering workspace creation, setup, and documentation.`;

    const response = await this.provider.complete({
      model: 'opencode',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    let parsed: Partial<ProjectPlan>;
    try {
      parsed = JSON.parse(response.content.trim()) as ProjectPlan;
    } catch {
      parsed = {};
    }

    const plan: ProjectPlan = {
      projectName: parsed.projectName || context.workspaceName || context.request,
      steps: Array.isArray(parsed.steps) && parsed.steps.length > 0 ? parsed.steps : this.fallbackSteps(isResume),
    };

    this.translator?.emit({
      type: 'project.started',
      timestamp: new Date().toISOString(),
      payload: { projectName: plan.projectName, stepCount: plan.steps.length, source: 'ai', resumed: isResume },
      actor: 'system',
    });

    return plan;
  }

  private fallbackSteps(isResume: boolean): ProjectPlan['steps'] {
    if (isResume) {
      return [
        { id: 'restore-context', name: 'Restore context', description: 'Loading previous workspace state' },
        { id: 'assess-progress', name: 'Assess progress', description: 'Determining next steps from project state' },
        { id: 'plan-next', name: 'Plan next milestone', description: 'Creating execution plan' },
      ];
    }
    return [
      { id: 'create-workspace', name: 'Create workspace', description: 'Setting up project directory structure' },
      { id: 'init-repo', name: 'Initialize repository', description: 'Creating git repository' },
      { id: 'create-readme', name: 'Create README', description: 'Writing project README' },
      { id: 'complete', name: 'Complete', description: 'Finalizing project creation' },
    ];
  }
}
